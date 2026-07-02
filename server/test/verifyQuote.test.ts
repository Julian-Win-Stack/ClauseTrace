import { describe, expect, it } from 'vitest';
import { verifyQuote } from '../src/grounding/verifyQuote.js';

const FULL_TEXT = [
  'APL 24-013: Requirements for Timely Access.',
  '',
  'I. Prior Authorization',
  'Plans must respond to standard prior authorization requests within five (5) business days of receipt.',
  'Plans must respond to expedited requests within 72 hours.',
  '',
  'II. Member Notices',
  'Plans shall provide written notice — including the reason for any delay — to members and providers.',
  'The notice must use "plain language" as defined by DHCS.',
].join('\n');

const THRESHOLD = 0.9;

describe('exact match', () => {
  it('verifies a verbatim quote with correct offsets', () => {
    const quote = 'Plans must respond to expedited requests within 72 hours.';
    const result = verifyQuote(quote, FULL_TEXT, THRESHOLD);
    expect(result).toMatchObject({ verified: true, method: 'exact', score: 1 });
    if (!result.verified) throw new Error('unreachable');
    expect(FULL_TEXT.slice(result.start, result.end)).toBe(quote);
  });

  it('trims surrounding whitespace before matching', () => {
    const result = verifyQuote(
      '  Plans must respond to expedited requests within 72 hours.\n',
      FULL_TEXT,
      THRESHOLD,
    );
    expect(result).toMatchObject({ verified: true, method: 'exact' });
  });
});

describe('normalized match', () => {
  it('matches when whitespace differs (line wraps collapsed)', () => {
    const quote =
      'Plans must respond to standard prior authorization requests\nwithin five (5)  business days of receipt.';
    const result = verifyQuote(quote, FULL_TEXT, THRESHOLD);
    expect(result).toMatchObject({ verified: true, method: 'normalized' });
    if (!result.verified) throw new Error('unreachable');
    // Raw slice must be the same passage, modulo the whitespace difference.
    expect(FULL_TEXT.slice(result.start, result.end).replace(/\s+/g, ' ')).toBe(
      quote.replace(/\s+/g, ' '),
    );
  });

  it.each([
    [
      'straight quotes and dashes vs typographic ones',
      'Plans shall provide written notice - including the reason for any delay - to members and providers.',
    ],
    [
      'different casing',
      'the notice must use "plain language" as defined by dhcs.',
    ],
  ])('matches despite %s', (_label, quote) => {
    expect(verifyQuote(quote, FULL_TEXT, THRESHOLD)).toMatchObject({
      verified: true,
      method: 'normalized',
    });
  });
});

describe('fuzzy match', () => {
  const nearMiss =
    'Plans must respond to routine prior authorization requests within five (5) business days of receipt.';

  it('accepts a near-miss at a permissive threshold, with a sub-1 score', () => {
    const result = verifyQuote(nearMiss, FULL_TEXT, 0.5);
    expect(result).toMatchObject({ verified: true, method: 'fuzzy' });
    if (!result.verified) throw new Error('unreachable');
    expect(result.score).toBeGreaterThanOrEqual(0.5);
    expect(result.score).toBeLessThan(1);
    // Offsets must land on the real passage it approximates.
    expect(FULL_TEXT.slice(result.start, result.end)).toContain(
      'prior authorization requests',
    );
  });

  it('rejects the same near-miss at a strict threshold', () => {
    const result = verifyQuote(nearMiss, FULL_TEXT, 0.99);
    expect(result).toEqual({ verified: false, method: 'none' });
  });

  it('rejects a fabricated quote sharing only vocabulary with the source', () => {
    const fabricated =
      'Plans must submit quarterly grievance reports to the department within 30 calendar days.';
    const result = verifyQuote(fabricated, FULL_TEXT, THRESHOLD);
    expect(result).toEqual({ verified: false, method: 'none' });
  });
});

describe('unverifiable input', () => {
  it.each([
    ['an empty quote', '', FULL_TEXT],
    ['a whitespace-only quote', '  \n\t ', FULL_TEXT],
    [
      'a quote longer than the document',
      FULL_TEXT + ' and then some more',
      'short doc',
    ],
    ['an empty document', 'anything', ''],
  ])('rejects %s', (_label, quote, doc) => {
    expect(verifyQuote(quote, doc, THRESHOLD)).toEqual({
      verified: false,
      method: 'none',
    });
  });
});
