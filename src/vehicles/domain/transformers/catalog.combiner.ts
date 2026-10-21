/**
 * Combines the two API results into ONE unified JSON structure.
 *
 * We get makes from one endpoint and vehicle types from another (one call per
 * make). This function joins them so each make carries its own list of
 * vehicle types, producing the exact shape required by the challenge:
 *
 *   [ { makeId, makeName, vehicleTypes: [ { typeId, typeName } ] } ]
 */
import type { CatalogEntry, Make, VehicleType } from '../vehicle-catalog.model';

/**
 * @param makes          - makes in the order they should appear.
 * @param typesByMakeId  - vehicle types keyed by make id. A make missing from
 *                         this map gets an empty list.
 * @returns a new array; the inputs are not modified. Vehicle types are
 *          sorted by id so the output is stable and easy to compare.
 */
export function combineCatalog(
  makes: readonly Make[],
  typesByMakeId: ReadonlyMap<number, readonly VehicleType[]>,
): CatalogEntry[] {
  return makes.map((make) => ({
    makeId: make.makeId,
    makeName: make.makeName,
    vehicleTypes: [...(typesByMakeId.get(make.makeId) ?? [])]
      .sort((a, b) => a.typeId - b.typeId)
      .map((type) => ({ typeId: type.typeId, typeName: type.typeName })),
  }));
}
