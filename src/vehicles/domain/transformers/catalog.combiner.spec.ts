/** Unit tests for joining makes and vehicle types into the unified JSON. */
import type { VehicleType } from '../vehicle-catalog.model';
import { combineCatalog } from './catalog.combiner';

describe('combineCatalog', () => {
  const makes = [
    { makeId: 440, makeName: 'ASTON MARTIN' },
    { makeId: 9999, makeName: 'NO TYPES INC' },
  ];

  it('produces the exact shape required by the challenge', () => {
    const typesByMakeId = new Map<number, VehicleType[]>([
      [
        440,
        [
          { typeId: 7, typeName: 'Multipurpose Passenger Vehicle (MPV)' },
          { typeId: 2, typeName: 'Passenger Car' },
        ],
      ],
    ]);

    const catalog = combineCatalog(makes, typesByMakeId);

    // Same JSON as the reference gist: an array of makes, each with its
    // vehicle types (sorted by id), and an empty list when there are none.
    expect(JSON.parse(JSON.stringify(catalog))).toEqual([
      {
        makeId: 440,
        makeName: 'ASTON MARTIN',
        vehicleTypes: [
          { typeId: 2, typeName: 'Passenger Car' },
          { typeId: 7, typeName: 'Multipurpose Passenger Vehicle (MPV)' },
        ],
      },
      { makeId: 9999, makeName: 'NO TYPES INC', vehicleTypes: [] },
    ]);
  });

  it('does not modify its inputs', () => {
    const types = [
      { typeId: 3, typeName: 'Truck' },
      { typeId: 1, typeName: 'Motorcycle' },
    ];
    const typesByMakeId = new Map([[440, types]]);

    const catalog = combineCatalog(makes, typesByMakeId);
    catalog[0].vehicleTypes[0].typeName = 'changed';

    expect(types).toEqual([
      { typeId: 3, typeName: 'Truck' },
      { typeId: 1, typeName: 'Motorcycle' },
    ]);
  });

  it('returns an empty catalog for no makes', () => {
    expect(combineCatalog([], new Map())).toEqual([]);
  });
});
