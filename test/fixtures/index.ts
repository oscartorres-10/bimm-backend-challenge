/**
 * Test fixtures: small XML documents copied from the real vPIC API.
 *
 * Tests use these instead of calling the internet, so they are fast,
 * repeatable and work offline. `all-makes.xml` is a trimmed-down version of
 * the real ~12,400 getallmakes response; the vehicle-types files are verbatim.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Reads a fixture file from this folder as text. */
export function readFixture(fileName: string): string {
  return readFileSync(join(__dirname, fileName), 'utf8');
}

export const ALL_MAKES_XML = readFixture('all-makes.xml');

/** Vehicle-types XML by make id. Make 9999 has none (empty `<Results />`). */
export const VEHICLE_TYPES_XML_BY_MAKE_ID: Record<number, string> = {
  440: readFixture('vehicle-types-440.xml'),
  448: readFixture('vehicle-types-448.xml'),
  474: readFixture('vehicle-types-474.xml'),
  9999: readFixture('vehicle-types-empty.xml'),
};
