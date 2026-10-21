/**
 * Shared logic for reading the "envelope" every vPIC XML response has.
 *
 * Every vPIC response looks like this once converted from XML to JSON:
 *
 *   { Response: {
 *       Count: "2",
 *       Message: "Response returned successfully",
 *       Results: { <ItemTag>: [ {...}, {...} ] }   // or "" when empty
 *   } }
 *
 * Here we pull out the list of items and check the envelope is sane.
 * Individual records are validated by the specific transformers.
 */
import { z } from 'zod';
import { TransformationError } from '../../../common/errors/app-errors';

/** A record that was skipped because it was malformed. */
export interface RejectedRecord {
  /** Position of the record in the original list. */
  index: number;
  /** Human-readable explanation, e.g. "Make_ID: Invalid string". */
  reason: string;
  /** The raw record, kept for debugging. */
  record: unknown;
}

/** Output of every transformer: the good items plus the skipped ones. */
export interface TransformResult<T> {
  items: T[];
  rejected: RejectedRecord[];
}

/** Zod schema for the envelope. `Results` is "" when there are no results. */
const envelopeSchema = z.object({
  Response: z.object({
    Count: z.string().optional(),
    Message: z.string().optional(),
    Results: z.union([z.literal(''), z.record(z.string(), z.unknown())]),
  }),
});

/**
 * Returns the raw list of items inside `Response.Results.<itemTag>`.
 *
 * @param parsed  - the JSON produced by the XML parser.
 * @param itemTag - the XML element name of one item, e.g. "AllVehicleMakes".
 * @param source  - a label used in error messages, e.g. "getallmakes".
 * @throws TransformationError if the envelope is not what we expect.
 */
export function extractResultItems(
  parsed: unknown,
  itemTag: string,
  source: string,
): unknown[] {
  const envelope = envelopeSchema.safeParse(parsed);
  if (!envelope.success) {
    throw new TransformationError(
      `Unexpected ${source} response structure: ${z.prettifyError(envelope.error)}`,
      { details: { source } },
    );
  }

  const results = envelope.data.Response.Results;
  if (results === '') return [];

  const items = results[itemTag];
  if (items === undefined) return [];
  if (!Array.isArray(items)) {
    throw new TransformationError(
      `Expected Results.${itemTag} in ${source} response to be a list`,
      { details: { source } },
    );
  }
  return items;
}

/** A numeric id written as text, e.g. "440" → 440. Rejects "", "abc", "0". */
export const idFromText = z
  .string()
  .trim()
  .regex(/^\d+$/, 'must be a positive whole number')
  .transform(Number)
  .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));

/** A non-empty name, with surrounding spaces removed. */
export const nameFromText = z.string().trim().min(1, 'must not be empty');

/**
 * Validates each raw record with `schema` and converts it with `map`.
 * Bad records and duplicate ids are collected in `rejected` instead of
 * aborting everything: one malformed make should not block 12,400 good ones.
 */
export function transformRecords<S extends z.ZodType, T>(
  rawItems: unknown[],
  schema: S,
  map: (record: z.infer<S>) => T,
  idOf: (item: T) => number,
): TransformResult<T> {
  const items: T[] = [];
  const rejected: RejectedRecord[] = [];
  const seenIds = new Set<number>();

  rawItems.forEach((record, index) => {
    const parsed = schema.safeParse(record);
    if (!parsed.success) {
      rejected.push({
        index,
        record,
        reason: parsed.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; '),
      });
      return;
    }
    const item = map(parsed.data);
    const id = idOf(item);
    if (seenIds.has(id)) {
      rejected.push({ index, record, reason: `duplicate id ${id}` });
      return;
    }
    seenIds.add(id);
    items.push(item);
  });

  return { items, rejected };
}
