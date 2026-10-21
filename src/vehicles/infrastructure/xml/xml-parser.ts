/**
 * XML → JSON conversion.
 *
 * XML is a text format made of nested tags, e.g.
 *   <Make><Make_ID>440</Make_ID></Make>
 * JSON is the object format JavaScript works with natively, e.g.
 *   { "Make": { "Make_ID": "440" } }
 *
 * We use the `fast-xml-parser` library (fast, no native dependencies).
 * This wrapper adds two things on top of it:
 *   1. it validates the XML first and throws our own `XmlParseError` with the
 *      line/column of the problem when the text is not valid XML;
 *   2. it always turns the listed "array tags" into lists. Without this, an
 *      XML document with ONE item becomes an object but with TWO items
 *      becomes a list, which is a classic source of bugs.
 *
 * Values are kept as text on purpose (`parseTagValue: false`); converting
 * to numbers is done (and validated) by the domain transformers. Otherwise a
 * make called "007" would silently become the number 7.
 */
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { XmlParseError } from '../../../common/errors/app-errors';

export interface ParseXmlOptions {
  /** Element names that must always be parsed as lists. */
  arrayTags?: readonly string[];
  /** Label for error messages, e.g. the URL the XML came from. */
  source?: string;
}

/**
 * Parses an XML string into a plain JavaScript object.
 *
 * @throws XmlParseError when the input is empty or not well-formed XML.
 */
export function parseXml(xml: string, options: ParseXmlOptions = {}): unknown {
  const { arrayTags = [], source = 'XML document' } = options;

  if (xml.trim() === '') {
    throw new XmlParseError(`${source}: response body is empty`, {
      details: { source },
    });
  }

  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    const { msg, line, col } = validation.err;
    throw new XmlParseError(
      `${source}: invalid XML at line ${line}, column ${col}: ${msg}`,
      { details: { source, line, col } },
    );
  }

  const arrayTagSet = new Set(arrayTags);
  const parser = new XMLParser({
    ignoreAttributes: true,
    ignoreDeclaration: true,
    parseTagValue: false,
    trimValues: true,
    isArray: (tagName) => arrayTagSet.has(tagName),
  });

  try {
    return parser.parse(xml) as unknown;
  } catch (cause) {
    throw new XmlParseError(`${source}: failed to parse XML`, {
      cause,
      details: { source },
    });
  }
}
