/**
 * Unit tests for the vPIC HTTP client.
 * `fetch` is mocked: these tests never reach the real internet.
 */
import { ExternalApiError } from '../../../common/errors/app-errors';
import { jest } from '../../../../test/helpers/jest';
import { ALL_MAKES_XML } from '../../../../test/fixtures';
import {
  createMockLogger,
  createTestConfig,
  xmlResponse,
} from '../../../../test/helpers/test-doubles';
import { isRetryableStatus, VpicClient } from './vpic.client';

describe('VpicClient', () => {
  const setup = (overrides: Record<string, string> = {}) => {
    const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
    const logger = createMockLogger();
    const client = new VpicClient(
      createTestConfig({ HTTP_MAX_RETRIES: '2', ...overrides }),
      fetchMock,
      logger,
    );
    return { client, fetchMock, logger };
  };

  it('downloads the all-makes XML from the configured URL', async () => {
    const { client, fetchMock } = setup({
      VPIC_ALL_MAKES_URL: 'https://example.test/makes?format=XML',
    });
    fetchMock.mockResolvedValue(xmlResponse(ALL_MAKES_XML));

    await expect(client.fetchAllMakesXml()).resolves.toBe(ALL_MAKES_XML);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/makes?format=XML',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('fills the make id into the vehicle types URL template', async () => {
    const { client, fetchMock } = setup({
      VPIC_VEHICLE_TYPES_URL_TEMPLATE:
        'https://example.test/types/{makeId}?format=xml',
    });
    fetchMock.mockResolvedValue(xmlResponse('<Response/>'));

    await client.fetchVehicleTypesXml(440);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://example.test/types/440?format=xml',
    );
  });

  it('retries a server error and then succeeds', async () => {
    const { client, fetchMock, logger } = setup();
    fetchMock
      .mockResolvedValueOnce(xmlResponse('busy', 503))
      .mockResolvedValueOnce(xmlResponse('<ok/>'));

    await expect(client.fetchAllMakesXml()).resolves.toBe('<ok/>');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 1 }),
      'vPIC request failed, retrying',
    );
  });

  it('retries network failures and gives up after the retry budget', async () => {
    const { client, fetchMock } = setup();
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const error = await client.fetchAllMakesXml().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ExternalApiError);
    expect((error as ExternalApiError).retryable).toBe(true);
    expect((error as ExternalApiError).details).toMatchObject({ attempts: 3 });
    expect((error as ExternalApiError).message).toMatch(/fetch failed/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry a permanent HTTP error such as 404', async () => {
    const { client, fetchMock } = setup();
    fetchMock.mockResolvedValue(xmlResponse('missing', 404));

    const error = await client.fetchAllMakesXml().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ExternalApiError);
    expect((error as ExternalApiError).details).toMatchObject({ status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports a timeout when the server is too slow', async () => {
    const { client, fetchMock } = setup({
      HTTP_TIMEOUT_MS: '100',
      HTTP_MAX_RETRIES: '0',
    });
    // A fake fetch that only settles when its abort signal fires.
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason),
          );
        }),
    );

    await expect(client.fetchAllMakesXml()).rejects.toThrow(
      /timed out after 100ms/,
    );
  });

  it('stops immediately (no retries) when the caller cancels', async () => {
    const { client, fetchMock } = setup();
    const controller = new AbortController();
    fetchMock.mockImplementation(() => {
      controller.abort();
      return Promise.reject(new DOMException('aborted', 'AbortError'));
    });

    const error = await client
      .fetchAllMakesXml(controller.signal)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ExternalApiError);
    expect((error as ExternalApiError).message).toMatch(/cancelled/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('wraps a failure while reading the response body', async () => {
    const { client, fetchMock } = setup({ HTTP_MAX_RETRIES: '0' });
    const broken = xmlResponse('<ok/>');
    jest.spyOn(broken, 'text').mockRejectedValue(new Error('socket closed'));
    fetchMock.mockResolvedValue(broken);

    await expect(client.fetchAllMakesXml()).rejects.toThrow(/socket closed/);
  });
});

describe('isRetryableStatus', () => {
  it.each([
    [429, true],
    [500, true],
    [503, true],
    [400, false],
    [404, false],
  ])('HTTP %i → retryable: %s', (status, expected) => {
    expect(isRetryableStatus(status)).toBe(expected);
  });
});
