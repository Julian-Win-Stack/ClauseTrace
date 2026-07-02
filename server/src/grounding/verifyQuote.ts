import { buildNormalized, mapSpanToRaw } from './offsets.js';
import { findBestWindow } from './fuzzy.js';

export type VerificationMethod = 'exact' | 'normalized' | 'fuzzy' | 'none';

export type VerifyResult =
  | {
      verified: true;
      method: 'exact' | 'normalized' | 'fuzzy';
      /** [start, end) character offsets into the raw fullText */
      start: number;
      end: number;
      score: number;
    }
  | { verified: false; method: 'none' };

const NOT_VERIFIED: VerifyResult = { verified: false, method: 'none' };

/**
 * The trust decision for a citation. Pure and deterministic — no I/O, no
 * LLM, no randomness. Tries, in order:
 *   1. exact substring
 *   2. normalized match (whitespace/quotes/dashes/case)
 *   3. fuzzy best-window match, accepted only at/above fuzzyThreshold
 */
export function verifyQuote(
  sourceQuote: string,
  fullText: string,
  fuzzyThreshold: number,
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
      score: 1,
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
    return { verified: true, method: 'normalized', start, end, score: 1 };
  }

  const fuzzy = findBestWindow(quoteNorm, docNorm.normalized);
  if (fuzzy !== null && fuzzy.score >= fuzzyThreshold) {
    const { start, end } = mapSpanToRaw(docNorm, fuzzy.start, fuzzy.end);
    return {
      verified: true,
      method: 'fuzzy',
      start,
      end,
      score: fuzzy.score,
    };
  }

  return NOT_VERIFIED;
}
