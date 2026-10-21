/** Unit tests for `chunk` and `mapWithConcurrency`. */
import { chunk, mapWithConcurrency } from './concurrency';

describe('chunk', () => {
  it('splits a list into equal pieces with a smaller last piece', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns no pieces for an empty list', () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it('rejects a size that is not a positive integer', () => {
    expect(() => chunk([1], 0)).toThrow(RangeError);
    expect(() => chunk([1], 1.5)).toThrow(RangeError);
  });
});

describe('mapWithConcurrency', () => {
  it('keeps results in the same order as the input', async () => {
    // Later items finish first, yet results must stay in input order.
    const results = await mapWithConcurrency([30, 10, 20], 3, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return ms * 2;
    });

    expect(results).toEqual([
      { status: 'fulfilled', value: 60 },
      { status: 'fulfilled', value: 20 },
      { status: 'fulfilled', value: 40 },
    ]);
  });

  it('never runs more than `concurrency` workers at the same time', async () => {
    let running = 0;
    let maxRunning = 0;

    await mapWithConcurrency(Array.from({ length: 20 }), 4, async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running--;
    });

    expect(maxRunning).toBe(4);
  });

  it('records failures without stopping the other items', async () => {
    const error = new Error('bad item');
    const results = await mapWithConcurrency([1, 2, 3], 2, (n) =>
      n === 2 ? Promise.reject(error) : Promise.resolve(n),
    );

    expect(results).toEqual([
      { status: 'fulfilled', value: 1 },
      { status: 'rejected', reason: error },
      { status: 'fulfilled', value: 3 },
    ]);
  });

  it('handles an empty list', async () => {
    await expect(mapWithConcurrency([], 5, jest.fn())).resolves.toEqual([]);
  });

  it('rejects an invalid concurrency', async () => {
    await expect(mapWithConcurrency([1], 0, jest.fn())).rejects.toThrow(
      RangeError,
    );
  });
});
