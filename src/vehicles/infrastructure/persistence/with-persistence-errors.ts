import { PersistenceError } from '../../../common/errors/app-errors';

/**
 * Runs a database operation and converts any failure to PersistenceError.
 * @param operation - short name used in the message and logs, e.g. "saveBatch".
 */
export async function withPersistenceErrors<T>(
  operation: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (cause) {
    throw new PersistenceError(
      `Database operation "${operation}" failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause, details: { operation } },
    );
  }
}
