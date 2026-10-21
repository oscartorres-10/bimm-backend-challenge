/** Unit tests for the "vehicle types for make" transformer. */
import { TransformationError } from '../../../common/errors/app-errors';
import { VEHICLE_TYPES_XML_BY_MAKE_ID } from '../../../../test/fixtures';
import { parseXml } from '../../infrastructure/xml/xml-parser';
import {
  transformVehicleTypes,
  VEHICLE_TYPE_ITEM_TAG,
} from './vehicle-types.transformer';

const parseFixture = (makeId: number) =>
  parseXml(VEHICLE_TYPES_XML_BY_MAKE_ID[makeId], {
    arrayTags: [VEHICLE_TYPE_ITEM_TAG],
  });

describe('transformVehicleTypes', () => {
  it('transforms the real response for make 440', () => {
    expect(transformVehicleTypes(parseFixture(440), 440)).toEqual({
      items: [
        { typeId: 2, typeName: 'Passenger Car' },
        { typeId: 7, typeName: 'Multipurpose Passenger Vehicle (MPV)' },
      ],
      rejected: [],
    });
  });

  it('returns an empty list for a make without vehicle types', () => {
    expect(transformVehicleTypes(parseFixture(9999), 9999)).toEqual({
      items: [],
      rejected: [],
    });
  });

  it('skips malformed vehicle types', () => {
    const result = transformVehicleTypes(
      {
        Response: {
          Results: {
            VehicleTypesForMakeIds: [
              { VehicleTypeId: '1', VehicleTypeName: 'Motorcycle' },
              { VehicleTypeId: '', VehicleTypeName: 'No id' },
              { VehicleTypeId: '1', VehicleTypeName: 'Duplicate' },
            ],
          },
        },
      },
      1,
    );

    expect(result.items).toEqual([{ typeId: 1, typeName: 'Motorcycle' }]);
    expect(result.rejected).toHaveLength(2);
  });

  it('names the make in structural errors', () => {
    expect(() => transformVehicleTypes({ nope: true }, 123)).toThrow(
      TransformationError,
    );
    expect(() => transformVehicleTypes({ nope: true }, 123)).toThrow(
      /GetVehicleTypesForMakeId\/123/,
    );
  });
});
