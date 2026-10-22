import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import { stdTimeFunctions } from 'pino';
import type { LoggingSettings } from '../config/app-config.service';

export const SERVICE_NAME = 'vehicle-catalog-service';

/** Paths that are too noisy/unimportant for the access log. */
const IGNORED_PATHS = new Set(['/health']);

/** Picks the log level for an HTTP request based on its outcome. */
export function requestLogLevel(
  _req: IncomingMessage,
  res: ServerResponse,
  error?: Error,
): 'error' | 'warn' | 'info' {
  if (error || res.statusCode >= 500) return 'error';
  if (res.statusCode >= 400) return 'warn';
  return 'info';
}

/** Reuses the caller's request id, or creates one. */
export function requestId(req: IncomingMessage): string {
  const header = req.headers['x-request-id'];
  return typeof header === 'string' && header.length > 0 && header.length <= 128
    ? header
    : randomUUID();
}

/** Builds the options for `LoggerModule.forRoot` in logging.module.ts. */
export function buildLoggerOptions(
  logging: LoggingSettings,
  nodeEnv: string,
): Params {
  return {
    pinoHttp: {
      level: logging.level,
      // Application log lines inside a request carry just the request id
      // ("reqId"), not the whole request; the access log line has the details.
      quietReqLogger: true,
      // Fields added to every log line.
      base: { service: SERVICE_NAME, env: nodeEnv },
      timestamp: stdTimeFunctions.isoTime,
      // Write "level":"info" instead of Pino's numeric "level":30.
      formatters: { level: (label) => ({ level: label }) },
      // Never write secrets to the logs.
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie'],
        censor: '[redacted]',
      },
      genReqId: (req, res) => {
        const id = requestId(req);
        res.setHeader('x-request-id', id);
        return id;
      },
      customLogLevel: requestLogLevel,
      autoLogging: {
        ignore: (req) => IGNORED_PATHS.has(req.url ?? ''),
      },
      // Pretty, coloured, single-line output for humans (dev only).
      transport: logging.pretty
        ? { target: 'pino-pretty', options: { singleLine: true } }
        : undefined,
    },
  };
}
