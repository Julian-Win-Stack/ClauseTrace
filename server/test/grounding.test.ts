import { describe, expect, it } from 'vitest';
import { buildNormalized, mapSpanToRaw } from '../src/grounding/offsets.js';
import { findBestWindow, tokenize } from '../src/grounding/fuzzy.js';

describe('buildNormalized', () => {
  it('collapses whitespace, lowercases, and maps typographic chars', () => {
    const { normalized } = buildNormalized(
      'Plans  SHALL\n\tprovide “notice” — now',
    );
    expect(normalized).toBe('plans shall provide "notice" - now');
  });

  it('maps every normalized char back to its raw index', () => {
    const raw = 'A  B\n\nC';
    const { normalized, map } = buildNormalized(raw);
    expect(normalized).toBe('a b c');
    // Non-space chars map to their exact raw positions.
    expect(map[0]).toBe(0); // a -> A
    expect(map[2]).toBe(3); // b -> B
    expect(map[4]).toBe(6); // c -> C
  });

  it('round-trips a normalized span to a raw slice covering the same text', () => {
    const raw = 'The plan\nmust   comply fully.';
    const norm = buildNormalized(raw);
    const idx = norm.normalized.indexOf('must comply');
    const { start, end } = mapSpanToRaw(norm, idx, idx + 'must comply'.length);
    expect(raw.slice(start, end).replace(/\s+/g, ' ')).toBe('must comply');
  });

  it('throws on an out-of-bounds span', () => {
    const norm = buildNormalized('short');
    expect(() => mapSpanToRaw(norm, 0, 99)).toThrow(RangeError);
  });
});

describe('tokenize', () => {
  it('returns tokens with correct [start, end) offsets', () => {
    const tokens = tokenize('ab  cd e');
    expect(tokens).toEqual([
      { text: 'ab', start: 0, end: 2 },
      { text: 'cd', start: 4, end: 6 },
      { text: 'e', start: 7, end: 8 },
    ]);
  });
});

describe('findBestWindow', () => {
  const doc =
    'plans must submit reports monthly. plans must respond to requests within five days of receipt. members must be notified promptly.';

  it('finds an identical span with score 1 and exact span offsets', () => {
    const quote = 'plans must respond to requests within five days of receipt.';
    const match = findBestWindow(quote, doc);
    expect(match).not.toBeNull();
    expect(match?.score).toBe(1);
    expect(doc.slice(match?.start, match?.end)).toBe(quote);
  });

  it('scores a scrambled-word window well below 1 (order matters)', () => {
    const scrambled =
      'receipt of days five within requests to respond must plans.';
    const match = findBestWindow(scrambled, doc);
    expect(match).not.toBeNull();
    expect(match?.score ?? 1).toBeLessThan(0.5);
  });

  it('prefers the earliest window on ties', () => {
    const repeated = 'the rule applies here. the rule applies here.';
    const match = findBestWindow('the rule applies here.', repeated);
    expect(match?.start).toBe(0);
  });

  it.each([
    [
      'the quote has more tokens than the document',
      'one two three four',
      'one two',
    ],
    ['the quote is empty', '', doc],
  ])('returns null when %s', (_label, quote, docText) => {
    expect(findBestWindow(quote, docText)).toBeNull();
  });
});
