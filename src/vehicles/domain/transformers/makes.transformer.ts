/**
 * Transforms the parsed "get all makes" response into a list of `Make`s.
 *
 * Input (after XML → JSON):
 *   { Response: { Results: { AllVehicleMakes: [
 *       { Make_ID: "440", Make_Name: "ASTON MARTIN" }, ...
 *   ] } } }
 *
 * Output:
 *   [ { makeId: 440, makeName: "ASTON MARTIN" }, ... ]
 */
import { z } from 'zod';
import type { Make } from '../vehicle-catalog.model';
import {
  extractResultItems,
  idFromText,
  nameFromText,
  transformRecords,
  type TransformResult,
} from './vpic-response';

/** XML element name of one make inside `<Results>`. */
export const MAKE_ITEM_TAG = 'AllVehicleMakes';

/** What one raw make record must look like. */
const rawMakeSchema = z.object({
  Make_ID: idFromText,
  Make_Name: nameFromText,
});

/**
 * @param parsed - JSON produced by parsing the getallmakes XML.
 * @returns valid makes plus any skipped (malformed or duplicate) records.
 * @throws TransformationError if the overall response structure is wrong.
 */
export function transformMakes(parsed: unknown): TransformResult<Make> {
  const rawItems = extractResultItems(parsed, MAKE_ITEM_TAG, 'getallmakes');
  return transformRecords(
    rawItems,
    rawMakeSchema,
    (raw) => ({ makeId: raw.Make_ID, makeName: raw.Make_Name }),
    (make) => make.makeId,
  );
}
