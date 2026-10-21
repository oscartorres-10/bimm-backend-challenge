/**
 * Retry with exponential backoff.
 *
 * Networks are unreliable: a request can fail once and succeed a moment
 * later. Instead of giving up immediately, we try again a few times, waiting
 * a bit longer each time ("exponential backoff": 500ms, 1s, 2s, ...). A small
 * random extra delay ("jitter") prevents many requests from retrying at the
 * exact same instant and overwhelming the server.
 */

export interface RetryOptions {
  /** How many EXTRA attempts after the first one (0 = no retries). */
  retries: number;
  /** Wait before the first retry, in milliseconds. Doubles every time. */
  baseDelayMs: number;
  /** Upper bound for a single wait. */
  maxDelayMs?: number;
  /** Decide, per error, whether another attempt is worthwhile. */
  shouldRetry?: (error: unknown) => boolean;
  /** Called before each retry; handy for logging. */
  onRetry?: (info: {
    attempt: number;
    delayMs: number;
    error: unknown;
  }) => void;
  /** Lets tests replace real waiting with an instant fake. */
  sleep?: (ms: number) => Promise<void>;
  /** Lets tests make the jitter predictable. Returns a number in [0, 1). */
  random?: () => number;
  /** Stops retrying when this signal is aborted (e.g. on shutdown). */
  signal?: AbortSignal;
}

/** Waits `ms` milliseconds. */
export const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Calculates how long to wait before retry number `attempt` (1-based).
 * Example with base 500ms: attempt 1 → 500–750ms, attempt 2 → 1000–1500ms.
 */
export function backoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  random: () => number = Math.random,
): number {
  const exponential = baseDelayMs * 2 ** (attempt - 1);
  const withJitter = exponential * (1 + random() * 0.5);
  return Math.min(Math.round(withJitter), maxDelayMs);
}

/**
 * Runs `operation`, retrying it when it fails and `shouldRetry` agrees.
 * The function receives the attempt number (1 = first try).
 * If every attempt fails, the LAST error is re-thrown unchanged.
 */
export async function retry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const {
    retries,
    baseDelayMs,
    maxDelayMs = 30_000,
    shouldRetry = () => true,
    onRetry,
    sleep = defaultSleep,
    random = Math.random,
    signal,
  } = options;

  for (let attempt = 1; ; attempt++) {
    try {
      return await operation(attempt);
    } catch (error) {
      const attemptsLeft = attempt <= retries;
      if (!attemptsLeft || signal?.aborted || !shouldRetry(error)) {
        throw error;
      }
      const delayMs = backoffDelay(attempt, baseDelayMs, maxDelayMs, random);
      onRetry?.({ attempt, delayMs, error });
      await sleep(delayMs);
    }
  }
}
