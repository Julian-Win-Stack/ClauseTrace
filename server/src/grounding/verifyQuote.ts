import { buildNormalized, mapSpanToRaw } from './offsets.js';

export type VerificationMethod = 'exact' | 'normalized' | 'none';

export type VerifyResult =
  | {
      verified: true;
      method: 'exact' | 'normalized';
      /** [start, end) character offsets into the raw fullText */
      start: number;
      end: number;
    }
  | { verified: false; method: 'none' };

const NOT_VERIFIED: VerifyResult = { verified: false, method: 'none' };

/**
 * The trust decision for a citation. Pure and deterministic — no I/O, no
 * LLM, and deliberately NO similarity scoring. A quote verifies only when
 * every character corresponds to the source:
 *   1. exact substring, or
 *   2. normalized match (whitespace runs, typographic quotes/dashes, case).
 * Anything less — including a 99%-similar quote — is rejected and surfaced
 * as Excluded. Similarity scoring was removed on purpose: in a long quote a
 * changed deadline or dropped "not" costs only a sliver of similarity, so
 * any fixed threshold eventually certifies an altered obligation as
 * verified (see DECISIONS.md §5).
 */
export function verifyQuote(
  sourceQuote: string,
  fullText: string,
): VerifyResult {
  const quote = sourceQuote.trim();
  if (quote.length === 0 || fullText.length === 0) return NOT_VERIFIED;

  const exactIdx = fullText.indexOf(quote);
  if (exactIdx !== -1) {
    return {
      verified: true,
      method: 'exact',
      start: exactIdx,
      end: exactIdx + quote.length,
    };
  }

  const docNorm = buildNormalized(fullText);
  const quoteNorm = buildNormalized(quote).normalized;
  if (quoteNorm.length === 0) return NOT_VERIFIED;

  const normIdx = docNorm.normalized.indexOf(quoteNorm);
  if (normIdx !== -1) {
    const { start, end } = mapSpanToRaw(
      docNorm,
      normIdx,
      normIdx + quoteNorm.length,
    );
    return { verified: true, method: 'normalized', start, end };
  }

  return NOT_VERIFIED;
}
