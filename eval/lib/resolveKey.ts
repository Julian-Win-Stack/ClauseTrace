import { verifyQuote } from '../../server/src/grounding/verifyQuote.js';
import type { KeyItem, ResolvedKeyItem } from './types.js';

export interface ResolvedKey {
  resolved: ResolvedKeyItem[];
  unresolved: KeyItem[];
}

/**
 * Locate each key quote in full_text using the app's OWN verifier, so the
 * answer key and the app's citations live in one coordinate system. A quote
 * that doesn't verify is surfaced as unresolved — it means a bad copy (a typo,
 * or text lifted from the lossy PDF instead of the canonical full_text), not a
 * recall miss.
 */
export function resolveKey(items: KeyItem[], fullText: string): ResolvedKey {
  const resolved: ResolvedKeyItem[] = [];
  const unresolved: KeyItem[] = [];
  for (const item of items) {
    const v = verifyQuote(item.quote, fullText);
    if (v.verified) {
      resolved.push({ ...item, start: v.start, end: v.end });
    } else {
      unresolved.push(item);
    }
  }
  return { resolved, unresolved };
}
