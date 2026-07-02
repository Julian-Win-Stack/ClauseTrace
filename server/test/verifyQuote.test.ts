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

describe('exact match', () => {
  it('verifies a verbatim quote with correct offsets', () => {
    const quote = 'Plans must respond to expedited requests within 72 hours.';
    const result = verifyQuote(quote, FULL_TEXT);
    expect(result).toMatchObject({ verified: true, method: 'exact' });
    if (!result.verified) throw new Error('unreachable');
    expect(FULL_TEXT.slice(result.start, result.end)).toBe(quote);
  });

  it('trims surrounding whitespace before matching', () => {
    const result = verifyQuote(
      '  Plans must respond to expedited requests within 72 hours.\n',
      FULL_TEXT,
    );
    expect(result).toMatchObject({ verified: true, method: 'exact' });
  });
});

describe('normalized match', () => {
  it('matches when whitespace differs (line wraps collapsed)', () => {
    const quote =
      'Plans must respond to standard prior authorization requests\nwithin five (5)  business days of receipt.';
    const result = verifyQuote(quote, FULL_TEXT);
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
    expect(verifyQuote(quote, FULL_TEXT)).toMatchObject({
      verified: true,
      method: 'normalized',
    });
  });
});

// Wrong #2 — the dangerous direction. A falsely REJECTED real quote is
// visible on screen (it lands in Excluded); a falsely ACCEPTED fake quote
// looks identical to a real one and can only be caught here, by handing the
// verifier quotes KNOWN to be fabricated and asserting rejection. With no
// similarity tier, any content difference at all must reject.
describe('adversarial false accepts (fake-smoke tests)', () => {
  const DOC = [
    'APL 26-001: Corrective Action and Delegation Requirements.',
    'Plans must submit a corrective action plan to the Department within thirty (30) calendar days of receiving a notice of noncompliance, and must include in that plan a description of the root cause, the remediation steps, the responsible business units, and the date by which each remediation step will be completed.',
    'Plans must respond to member grievances within thirty (30) calendar days.',
    'Plans must not delegate final adverse benefit determinations to any subcontractor.',
    'The Department may impose sanctions for repeated noncompliance.',
  ].join('\n');

  it.each([
    [
      'a full paraphrase of a real obligation',
      'A corrective action plan has to be filed with DHCS no later than one month after a plan gets a noncompliance notice.',
    ],
    [
      'a quote stitched from two distant real passages',
      'Plans must submit a corrective action plan to the Department and the Department may impose sanctions for repeated noncompliance.',
    ],
    [
      'a real quote with a single word swapped',
      'Plans must respond to member complaints within thirty (30) calendar days.',
    ],
    [
      'a short real quote with its deadline changed',
      'Plans must respond to member grievances within sixty (60) calendar days.',
    ],
    [
      'a short real prohibition with its negation dropped',
      'Plans must delegate final adverse benefit determinations to any subcontractor.',
    ],
  ])('rejects %s', (_label, fabricated) => {
    expect(verifyQuote(fabricated, DOC).verified).toBe(false);
  });

  it('rejects a LONG real quote with only its deadline changed — quote length must not dilute a substance-changing mutation', () => {
    const mutated =
      'Plans must submit a corrective action plan to the Department within sixty (60) calendar days of receiving a notice of noncompliance, and must include in that plan a description of the root cause, the remediation steps, the responsible business units, and the date by which each remediation step will be completed.';
    expect(verifyQuote(mutated, DOC).verified).toBe(false);
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
    expect(verifyQuote(quote, doc)).toEqual({
      verified: false,
      method: 'none',
    });
  });
});
