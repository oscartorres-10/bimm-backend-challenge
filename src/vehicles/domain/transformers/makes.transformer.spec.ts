/** Unit tests for the "all makes" transformer. */
import { TransformationError } from '../../../common/errors/app-errors';
import { ALL_MAKES_XML } from '../../../../test/fixtures';
import { parseXml } from '../../infrastructure/xml/xml-parser';
import { MAKE_ITEM_TAG, transformMakes } from './makes.transformer';

/** Builds the JSON the parser would produce for the given raw records. */
const response = (items: unknown) => ({
  Response: { Count: '1', Message: 'ok', Results: { AllVehicleMakes: items } },
});

describe('transformMakes', () => {
  it('transforms the parsed real response into makes', () => {
    const parsed = parseXml(ALL_MAKES_XML, { arrayTags: [MAKE_ITEM_TAG] });

    expect(transformMakes(parsed)).toEqual({
      items: [
        { makeId: 9999, makeName: '4M FARM & TRAILER SALES' },
        { makeId: 440, makeName: 'ASTON MARTIN' },
        { makeId: 474, makeName: 'HONDA' },
        { makeId: 448, makeName: 'TOYOTA' },
      ],
      rejected: [],
    });
  });

  it('trims whitespace around names and ids', () => {
    const result = transformMakes(
      response([{ Make_ID: ' 12 ', Make_Name: '  ACME  ' }]),
    );
    expect(result.items).toEqual([{ makeId: 12, makeName: 'ACME' }]);
  });

  it('skips malformed records and reports why', () => {
    const result = transformMakes(
      response([
        { Make_ID: '1', Make_Name: 'GOOD' },
        { Make_ID: 'abc', Make_Name: 'BAD ID' },
        { Make_ID: '0', Make_Name: 'ZERO ID' },
        { Make_ID: '3', Make_Name: '' },
        { Make_Name: 'MISSING ID' },
        'not an object',
      ]),
    );

    expect(result.items).toEqual([{ makeId: 1, makeName: 'GOOD' }]);
    expect(result.rejected.map((r) => r.index)).toEqual([1, 2, 3, 4, 5]);
    expect(result.rejected[0].reason).toMatch(/Make_ID/);
    expect(result.rejected[2].reason).toMatch(/Make_Name: must not be empty/);
    expect(result.rejected[0].record).toEqual({
      Make_ID: 'abc',
      Make_Name: 'BAD ID',
    });
  });

  it('keeps the first occurrence of a duplicated make id', () => {
    const result = transformMakes(
      response([
        { Make_ID: '5', Make_Name: 'FIRST' },
        { Make_ID: '5', Make_Name: 'SECOND' },
      ]),
    );
    expect(result.items).toEqual([{ makeId: 5, makeName: 'FIRST' }]);
    expect(result.rejected).toEqual([
      expect.objectContaining({ index: 1, reason: 'duplicate id 5' }),
    ]);
  });

  it('returns no makes when Results is empty', () => {
    expect(
      transformMakes({ Response: { Count: '0', Results: '' } }).items,
    ).toEqual([]);
    expect(transformMakes({ Response: { Results: {} } }).items).toEqual([]);
  });

  it('throws TransformationError when the response envelope is wrong', () => {
    expect(() => transformMakes({ Unexpected: {} })).toThrow(
      TransformationError,
    );
    expect(() => transformMakes(null)).toThrow(/getallmakes/);
    expect(() => transformMakes({ Response: { Results: 42 } })).toThrow(
      TransformationError,
    );
  });

  it('throws TransformationError when the item list is not a list', () => {
    expect(() =>
      transformMakes({ Response: { Results: { AllVehicleMakes: 'oops' } } }),
    ).toThrow(/to be a list/);
  });
});
