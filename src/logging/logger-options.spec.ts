/** Unit tests for the logging configuration helpers. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  buildLoggerOptions,
  requestId,
  requestLogLevel,
} from './logger-options';

const res = (statusCode: number) => ({ statusCode }) as ServerResponse;
const req = (headers: Record<string, string> = {}, url = '/graphql') =>
  ({ headers, url }) as unknown as IncomingMessage;

describe('requestLogLevel', () => {
  it('logs server errors as "error", client errors as "warn", the rest as "info"', () => {
    expect(requestLogLevel(req(), res(200))).toBe('info');
    expect(requestLogLevel(req(), res(404))).toBe('warn');
    expect(requestLogLevel(req(), res(503))).toBe('error');
    expect(requestLogLevel(req(), res(200), new Error('boom'))).toBe('error');
  });
});

describe('requestId', () => {
  it('reuses a valid incoming x-request-id header', () => {
    expect(requestId(req({ 'x-request-id': 'abc-123' }))).toBe('abc-123');
  });

  it('generates a UUID when the header is missing or too long', () => {
    const uuid = /^[0-9a-f-]{36}$/;
    expect(requestId(req())).toMatch(uuid);
    expect(requestId(req({ 'x-request-id': 'x'.repeat(200) }))).toMatch(uuid);
  });
});

describe('buildLoggerOptions', () => {
  it('produces JSON logs at the configured level', () => {
    const options = buildLoggerOptions(
      { level: 'debug', pretty: false },
      'production',
    );
    const pinoHttp = options.pinoHttp as Record<string, unknown>;

    expect(pinoHttp.level).toBe('debug');
    expect(pinoHttp.transport).toBeUndefined();
    expect(pinoHttp.base).toEqual({
      service: 'vehicle-catalog-service',
      env: 'production',
    });
    const formatters = pinoHttp.formatters as {
      level: (label: string) => object;
    };
    expect(formatters.level('info')).toEqual({ level: 'info' });
  });

  it('uses pino-pretty when pretty logs are requested', () => {
    const options = buildLoggerOptions(
      { level: 'info', pretty: true },
      'development',
    );
    expect(
      (options.pinoHttp as Record<string, unknown>).transport,
    ).toMatchObject({
      target: 'pino-pretty',
    });
  });

  it('skips the health endpoint in the access log and echoes the request id', () => {
    const pinoHttp = buildLoggerOptions(
      { level: 'info', pretty: false },
      'test',
    ).pinoHttp as {
      autoLogging: { ignore: (r: IncomingMessage) => boolean };
      genReqId: (r: IncomingMessage, s: ServerResponse) => string;
    };
    expect(pinoHttp.autoLogging.ignore(req({}, '/health'))).toBe(true);
    expect(pinoHttp.autoLogging.ignore(req({}, '/graphql'))).toBe(false);

    const setHeader = jest.fn();
    const id = pinoHttp.genReqId(req({ 'x-request-id': 'r-1' }), {
      setHeader,
    } as unknown as ServerResponse);
    expect(id).toBe('r-1');
    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'r-1');
  });
});
