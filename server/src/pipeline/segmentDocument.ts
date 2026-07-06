import { verifyQuote } from '../grounding/verifyQuote.js';

export interface Piece {
  index: number;
  /** inclusive offset into fullText */
  start: number;
  /** exclusive offset into fullText */
  end: number;
  /** fullText.slice(start, end) — a verbatim substring */
  text: string;
}

/**
 * Turn LLM-proposed boundary markers into contiguous pieces covering the WHOLE
 * document. Guarantees, regardless of what the model returned:
 *   - pieces are contiguous and cover [0, fullText.length) with NO gaps and NO overlaps
 *   - boundaries are strictly increasing and always start at 0
 *   - always >= 1 piece
 * Unfindable, out-of-order, duplicate, or invented markers are simply skipped
 * (they merge neighbors), never creating a gap. This is what lets boundary
 * drift never cost recall: a requirement a bad marker "loses" is just extracted
 * by the merged piece instead.
 */
export function tilePieces(fullText: string, markers: string[]): Piece[] {
  const boundaries: number[] = [0];
  let lastPos = 0;

  for (const raw of markers) {
    const marker = raw.trim();
    if (marker.length === 0) continue;

    // 1) exact match at/after the last boundary (handles ordering + non-unique markers).
    let pos = fullText.indexOf(marker, lastPos);

    // 2) normalized fallback via the existing verifier (searches from 0). Accept only if it
    //    lands strictly after the last boundary; verifyQuote has no from-offset variant.
    if (pos === -1) {
      const r = verifyQuote(marker, fullText);
      pos = r.verified && r.start > lastPos ? r.start : -1;
    }

    if (pos > lastPos) {
      boundaries.push(pos);
      lastPos = pos;
    }
  }

  return boundaries.map((start, i) => {
    const end =
      i + 1 < boundaries.length ? boundaries[i + 1]! : fullText.length;
    return { index: i, start, end, text: fullText.slice(start, end) };
  });
}
