import { describe, expect, it } from 'vitest';
import { tilePieces, type Piece } from '../src/pipeline/segmentDocument.js';

const DOC = [
  'BACKGROUND',
  'This All Plan Letter clarifies existing duties.',
  '',
  'ELIGIBILITY REQUIREMENTS',
  'Plans must verify member eligibility every month.',
  '',
  'REPORTING OBLIGATIONS',
  'Plans must submit compliance reports each quarter.',
  '',
  'ENFORCEMENT',
  'DHCS may audit any plan at its discretion.',
].join('\n');

const ELIGIBILITY = 'ELIGIBILITY REQUIREMENTS';
const REPORTING = 'REPORTING OBLIGATIONS';
const ENFORCEMENT = 'ENFORCEMENT';

/**
 * The core guarantee: pieces tile [0, len) with no gaps or overlaps, and
 * concatenating them reproduces the source exactly. Every case asserts this.
 */
function expectContiguousCover(pieces: Piece[], fullText: string): void {
  expect(pieces[0]!.start).toBe(0);
  expect(pieces.at(-1)!.end).toBe(fullText.length);
  for (let i = 0; i < pieces.length - 1; i++) {
    expect(pieces[i]!.end).toBe(pieces[i + 1]!.start);
  }
  for (const piece of pieces) {
    expect(piece.text).toBe(fullText.slice(piece.start, piece.end));
  }
  expect(pieces.map((p) => p.text).join('')).toBe(fullText);
}

describe('tilePieces', () => {
  it('splits at each located marker, in document order', () => {
    const pieces = tilePieces(DOC, [ELIGIBILITY, REPORTING, ENFORCEMENT]);

    expect(pieces.map((p) => p.start)).toEqual([
      0,
      DOC.indexOf(ELIGIBILITY),
      DOC.indexOf(REPORTING),
      DOC.indexOf(ENFORCEMENT),
    ]);
    expectContiguousCover(pieces, DOC);
  });

  it('drops an out-of-order marker rather than moving a boundary backwards', () => {
    const pieces = tilePieces(DOC, [ENFORCEMENT, ELIGIBILITY]);

    expect(pieces.map((p) => p.start)).toEqual([0, DOC.indexOf(ENFORCEMENT)]);
    expectContiguousCover(pieces, DOC);
  });

  it('drops a repeated marker so boundaries stay strictly increasing', () => {
    const pieces = tilePieces(DOC, [REPORTING, REPORTING]);

    expect(pieces.map((p) => p.start)).toEqual([0, DOC.indexOf(REPORTING)]);
    expectContiguousCover(pieces, DOC);
  });

  it('skips an invented marker without opening a gap', () => {
    const pieces = tilePieces(DOC, [
      ELIGIBILITY,
      'A PHRASE THAT IS NOWHERE IN THE LETTER',
      ENFORCEMENT,
    ]);

    expect(pieces.map((p) => p.start)).toEqual([
      0,
      DOC.indexOf(ELIGIBILITY),
      DOC.indexOf(ENFORCEMENT),
    ]);
    expectContiguousCover(pieces, DOC);
  });

  it('skips empty and whitespace-only markers', () => {
    const pieces = tilePieces(DOC, ['', '   ', ELIGIBILITY]);

    expect(pieces.map((p) => p.start)).toEqual([0, DOC.indexOf(ELIGIBILITY)]);
    expectContiguousCover(pieces, DOC);
  });

  it('returns one whole-document piece when no marker is usable', () => {
    for (const markers of [[], ['NOPE', 'ALSO NOT PRESENT']]) {
      const pieces = tilePieces(DOC, markers);

      expect(pieces).toHaveLength(1);
      expect(pieces[0]!.text).toBe(DOC);
      expectContiguousCover(pieces, DOC);
    }
  });

  it('locates a marker that only matches after normalization', () => {
    const curly =
      'Intro paragraph.\n\nMember’s appeal rights must be preserved.\n\nEnd.';
    const straightApostropheMarker = "Member's appeal rights";

    const pieces = tilePieces(curly, [straightApostropheMarker]);

    expect(curly.indexOf(straightApostropheMarker)).toBe(-1); // exact match impossible
    expect(pieces.map((p) => p.start)).toEqual([
      0,
      curly.indexOf('Member’s appeal rights'),
    ]);
    expectContiguousCover(pieces, curly);
  });

  it('drops a marker that lands at offset 0 (piece 1 already starts there)', () => {
    const pieces = tilePieces(DOC, ['BACKGROUND', ELIGIBILITY]);

    expect(pieces.map((p) => p.start)).toEqual([0, DOC.indexOf(ELIGIBILITY)]);
    expectContiguousCover(pieces, DOC);
  });
});
