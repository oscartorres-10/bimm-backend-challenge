/** Unit tests for the retry helper. Waiting is faked so tests run instantly. */
import { backoffDelay, retry } from './retry';

const noSleep = () => Promise.resolve();

describe('backoffDelay', () => {
  it('doubles the delay on every attempt', () => {
    const noJitter = () => 0;
    expect(backoffDelay(1, 100, 10_000, noJitter)).toBe(100);
    expect(backoffDelay(2, 100, 10_000, noJitter)).toBe(200);
    expect(backoffDelay(3, 100, 10_000, noJitter)).toBe(400);
  });

  it('adds up to 50% jitter', () => {
    expect(backoffDelay(1, 100, 10_000, () => 0.999)).toBe(150);
  });

  it('never exceeds the maximum delay', () => {
    expect(backoffDelay(20, 100, 1_000, () => 0)).toBe(1_000);
  });
});

describe('retry', () => {
  it('returns the result straight away when the first attempt works', async () => {
    const operation = jest.fn().mockResolvedValue('ok');

    await expect(
      retry(operation, { retries: 3, baseDelayMs: 1, sleep: noSleep }),
    ).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries until the operation succeeds', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new Error('boom 1'))
      .mockRejectedValueOnce(new Error('boom 2'))
      .mockResolvedValue('ok');
    const onRetry = jest.fn();
    const sleep = jest.fn(noSleep);

    await expect(
      retry(operation, {
        retries: 3,
        baseDelayMs: 100,
        sleep,
        onRetry,
        random: () => 0,
      }),
    ).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(3);
    expect(operation).toHaveBeenNthCalledWith(3, 3);
    expect(sleep).toHaveBeenNthCalledWith(1, 100);
    expect(sleep).toHaveBeenNthCalledWith(2, 200);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('gives up after the configured number of retries and rethrows the last error', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new Error('first'))
      .mockRejectedValue(new Error('last'));

    await expect(
      retry(operation, { retries: 2, baseDelayMs: 1, sleep: noSleep }),
    ).rejects.toThrow('last');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('does not retry errors that shouldRetry rejects', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('permanent'));

    await expect(
      retry(operation, {
        retries: 5,
        baseDelayMs: 1,
        sleep: noSleep,
        shouldRetry: () => false,
      }),
    ).rejects.toThrow('permanent');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('stops retrying once the abort signal fires', async () => {
    const controller = new AbortController();
    const operation = jest.fn().mockImplementation(() => {
      controller.abort();
      return Promise.reject(new Error('aborted'));
    });

    await expect(
      retry(operation, {
        retries: 5,
        baseDelayMs: 1,
        sleep: noSleep,
        signal: controller.signal,
      }),
    ).rejects.toThrow('aborted');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('uses a real timer when no sleep function is given', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new Error('once'))
      .mockResolvedValue('ok');

    await expect(
      retry(operation, { retries: 1, baseDelayMs: 1 }),
    ).resolves.toBe('ok');
  });
});
