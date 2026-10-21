/** Unit tests for the custom error classes and `describeError`. */
import {
  describeError,
  ExternalApiError,
  IngestionAlreadyRunningError,
  XmlParseError,
} from './app-errors';

describe('app errors', () => {
  it('keeps the class name, code, details and cause', () => {
    const cause = new Error('socket hang up');
    const error = new ExternalApiError('request failed', true, {
      url: 'https://example.com',
      status: 503,
      attempts: 2,
      cause,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ExternalApiError');
    expect(error.code).toBe('EXTERNAL_API_ERROR');
    expect(error.retryable).toBe(true);
    expect(error.cause).toBe(cause);
    expect(error.details).toEqual({
      url: 'https://example.com',
      status: 503,
      attempts: 2,
    });
  });

  it('defaults details to an empty object', () => {
    expect(new XmlParseError('bad').details).toEqual({});
  });

  it('includes the run id in IngestionAlreadyRunningError', () => {
    const error = new IngestionAlreadyRunningError(7);
    expect(error.runId).toBe(7);
    expect(error.message).toContain('7');
    expect(new IngestionAlreadyRunningError(null).message).toMatch(/starting/);
  });
});

describe('describeError', () => {
  it('describes our own errors with their code', () => {
    expect(describeError(new XmlParseError('bad xml'))).toEqual({
      code: 'XML_PARSE_ERROR',
      message: 'bad xml',
      details: {},
    });
  });

  it('describes any other Error as unexpected', () => {
    expect(describeError(new TypeError('oops'))).toEqual({
      code: 'UNEXPECTED_ERROR',
      message: 'oops',
    });
  });

  it('describes thrown non-Error values', () => {
    expect(describeError('just a string')).toEqual({
      code: 'UNEXPECTED_ERROR',
      message: 'just a string',
    });
  });
});
