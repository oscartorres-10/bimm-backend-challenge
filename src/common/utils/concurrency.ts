/**
 * Small helpers to process lists efficiently.
 *
 * We have ~12,000 makes and need one HTTP request per make. Doing them one
 * after another would take hours; firing all 12,000 at once would overload
 * the remote server (and probably get us blocked). The middle ground is a
 * "worker pool": at most N requests run at the same time, and as soon as one
 * finishes the next one starts.
 */

/**
 * Splits a list into pieces of at most `size` items.
 * Example: chunk([1,2,3,4,5], 2) → [[1,2],[3,4],[5]].
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`chunk size must be a positive integer, got ${size}`);
  }
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}

/** The outcome of one item: either its value or the error it threw. */
export type Settled<R> =
  { status: 'fulfilled'; value: R } | { status: 'rejected'; reason: unknown };

/**
 * Runs `worker` for every item with at most `concurrency` running at once.
 *
 * Like `Promise.allSettled`, one failing item does NOT stop the others:
 * every item gets a result, and results keep the same order as `items`.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<Settled<R>[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError(
      `concurrency must be a positive integer, got ${concurrency}`,
    );
  }

  const results = new Array<Settled<R>>(items.length);
  let nextIndex = 0;

  // Each "lane" keeps taking the next unprocessed item until none are left.
  // JavaScript runs one piece of code at a time, so `nextIndex++` is safe.
  const lane = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      try {
        results[index] = {
          status: 'fulfilled',
          value: await worker(items[index], index),
        };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };

  const laneCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: laneCount }, lane));
  return results;
}
