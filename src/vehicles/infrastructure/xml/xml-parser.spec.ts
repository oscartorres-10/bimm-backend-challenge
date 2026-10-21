/** Unit tests for XML → JSON conversion. */
import { XmlParseError } from '../../../common/errors/app-errors';
import {
  ALL_MAKES_XML,
  VEHICLE_TYPES_XML_BY_MAKE_ID,
} from '../../../../test/fixtures';
import { parseXml } from './xml-parser';

describe('parseXml', () => {
  it('converts a real vPIC response into JSON', () => {
    const json = parseXml(ALL_MAKES_XML, { arrayTags: ['AllVehicleMakes'] });

    expect(json).toEqual({
      Response: {
        Count: '4',
        Message: 'Response returned successfully',
        Results: {
          AllVehicleMakes: [
            { Make_ID: '9999', Make_Name: '4M FARM & TRAILER SALES' },
            { Make_ID: '440', Make_Name: 'ASTON MARTIN' },
            { Make_ID: '474', Make_Name: 'HONDA' },
            { Make_ID: '448', Make_Name: 'TOYOTA' },
          ],
        },
      },
    });
  });

  it('decodes XML entities such as &amp;', () => {
    const json = parseXml('<a>Fish &amp; Chips</a>') as { a: string };
    expect(json.a).toBe('Fish & Chips');
  });

  it('keeps values as text so "007" is not turned into 7', () => {
    expect(parseXml('<a>007</a>')).toEqual({ a: '007' });
  });

  it('always returns a list for array tags, even with a single item', () => {
    const json = parseXml('<r><item><id>1</id></item></r>', {
      arrayTags: ['item'],
    });
    expect(json).toEqual({ r: { item: [{ id: '1' }] } });
  });

  it('returns an empty string for a self-closing empty element', () => {
    const json = parseXml(VEHICLE_TYPES_XML_BY_MAKE_ID[9999]) as {
      Response: { Results: unknown };
    };
    expect(json.Response.Results).toBe('');
  });

  it('throws XmlParseError with the position of malformed XML', () => {
    expect(() =>
      parseXml('<Response><Results></Response>', { source: 'test-url' }),
    ).toThrow(XmlParseError);
    expect(() => parseXml('<a><b></a>', { source: 'test-url' })).toThrow(
      /test-url: invalid XML at line 1/,
    );
  });

  it('throws XmlParseError for non-XML content such as an HTML error page', () => {
    expect(() => parseXml('Service Unavailable')).toThrow(XmlParseError);
  });

  it('throws XmlParseError for an empty body', () => {
    expect(() => parseXml('   ')).toThrow(/empty/);
  });
});
