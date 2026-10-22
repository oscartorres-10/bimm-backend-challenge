import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AppConfigService } from '../../../config/app-config.service';
import { MAKE_ID_PLACEHOLDER } from '../../../config/env.schema';
import { ExternalApiError } from '../../../common/errors/app-errors';
import { retry } from '../../../common/utils/retry';

export const FETCH = Symbol('FETCH');
export type FetchFn = typeof fetch;

/** HTTP statuses worth retrying: rate limiting and server-side errors. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

@Injectable()
export class VpicClient {
  constructor(
    private readonly config: AppConfigService,
    @Inject(FETCH) private readonly fetchFn: FetchFn,
    @InjectPinoLogger(VpicClient.name) private readonly logger: PinoLogger,
  ) {}

  /** Downloads the XML list of every vehicle make. */
  fetchAllMakesXml(signal?: AbortSignal): Promise<string> {
    return this.fetchXml(this.config.vpic.allMakesUrl, signal);
  }

  /** Downloads the XML list of vehicle types for one make. */
  fetchVehicleTypesXml(makeId: number, signal?: AbortSignal): Promise<string> {
    return this.fetchXml(this.vehicleTypesUrl(makeId), signal);
  }

  /** Builds the vehicle-types URL by filling in the `{makeId}` placeholder. */
  vehicleTypesUrl(makeId: number): string {
    return this.config.vpic.vehicleTypesUrlTemplate.replace(
      MAKE_ID_PLACEHOLDER,
      encodeURIComponent(String(makeId)),
    );
  }

  /** GETs `url` as text, retrying temporary failures. */
  private async fetchXml(url: string, signal?: AbortSignal): Promise<string> {
    const { maxRetries, retryBaseDelayMs } = this.config.http;
    const startedAt = Date.now();

    const body = await retry((attempt) => this.request(url, attempt, signal), {
      retries: maxRetries,
      baseDelayMs: retryBaseDelayMs,
      signal,
      shouldRetry: (error) =>
        error instanceof ExternalApiError && error.retryable,
      onRetry: ({ attempt, delayMs, error }) =>
        this.logger.warn(
          { url, attempt, delayMs, err: error },
          'vPIC request failed, retrying',
        ),
    });

    this.logger.debug(
      { url, durationMs: Date.now() - startedAt, bytes: body.length },
      'vPIC request succeeded',
    );
    return body;
  }

  /** Performs ONE HTTP attempt and converts every failure to ExternalApiError. */
  private async request(
    url: string,
    attempt: number,
    callerSignal?: AbortSignal,
  ): Promise<string> {
    const timeoutSignal = AbortSignal.timeout(this.config.http.timeoutMs);
    const signal = callerSignal
      ? AbortSignal.any([callerSignal, timeoutSignal])
      : timeoutSignal;
    const signals = { caller: callerSignal, timeout: timeoutSignal };

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        headers: { Accept: 'application/xml, text/xml' },
        signal,
      });
    } catch (cause) {
      throw this.networkError(url, attempt, cause, signals);
    }

    if (!response.ok) {
      // Drain the body so the underlying connection can be reused.
      await response.body?.cancel().catch(() => undefined);
      throw new ExternalApiError(
        `vPIC responded with HTTP ${response.status}`,
        isRetryableStatus(response.status),
        { url, status: response.status, attempts: attempt },
      );
    }

    try {
      return await response.text();
    } catch (cause) {
      throw this.networkError(url, attempt, cause, signals);
    }
  }

  /**
   * Classifies low-level errors (DNS failure, reset connection, timeout,
   * cancellation).
   */
  private networkError(
    url: string,
    attempt: number,
    cause: unknown,
    signals: { caller?: AbortSignal; timeout: AbortSignal },
  ): ExternalApiError {
    if (signals.caller?.aborted) {
      return new ExternalApiError('vPIC request was cancelled', false, {
        url,
        attempts: attempt,
        cause,
      });
    }
    return new ExternalApiError(
      signals.timeout.aborted
        ? `vPIC request timed out after ${this.config.http.timeoutMs}ms`
        : `vPIC request failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      true,
      { url, attempts: attempt, cause },
    );
  }
}
