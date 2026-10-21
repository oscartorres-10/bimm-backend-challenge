/**
 * Transforms the parsed "vehicle types for make" response into `VehicleType`s.
 *
 * Input (after XML → JSON):
 *   { Response: { Results: { VehicleTypesForMakeIds: [
 *       { VehicleTypeId: "2", VehicleTypeName: "Passenger Car" }, ...
 *   ] } } }
 *
 * Output:
 *   [ { typeId: 2, typeName: "Passenger Car" }, ... ]
 */
import { z } from 'zod';
import type { VehicleType } from '../vehicle-catalog.model';
import {
  extractResultItems,
  idFromText,
  nameFromText,
  transformRecords,
  type TransformResult,
} from './vpic-response';

/** XML element name of one vehicle type inside `<Results>`. */
export const VEHICLE_TYPE_ITEM_TAG = 'VehicleTypesForMakeIds';

/** What one raw vehicle type record must look like. */
const rawVehicleTypeSchema = z.object({
  VehicleTypeId: idFromText,
  VehicleTypeName: nameFromText,
});

/**
 * @param parsed - JSON produced by parsing the GetVehicleTypesForMakeId XML.
 * @param makeId - only used to make error messages more helpful.
 * @returns valid vehicle types plus any skipped records.
 * @throws TransformationError if the overall response structure is wrong.
 */
export function transformVehicleTypes(
  parsed: unknown,
  makeId: number,
): TransformResult<VehicleType> {
  const rawItems = extractResultItems(
    parsed,
    VEHICLE_TYPE_ITEM_TAG,
    `GetVehicleTypesForMakeId/${makeId}`,
  );
  return transformRecords(
    rawItems,
    rawVehicleTypeSchema,
    (raw) => ({ typeId: raw.VehicleTypeId, typeName: raw.VehicleTypeName }),
    (type) => type.typeId,
  );
}
