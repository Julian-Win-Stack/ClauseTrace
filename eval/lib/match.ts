import type {
  AppRequirement,
  ExcludedMatch,
  FoundMatch,
  MatchResult,
  ResolvedKeyItem,
  Span,
} from './types.js';

/** Overlap length of two half-open [start, end) spans; 0 if they don't touch. */
function overlapLen(a: Span, b: Span): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

/** Best overlap between a key span and any of a requirement's spans. */
function bestOverlap(key: ResolvedKeyItem, req: AppRequirement): number {
  let best = 0;
  for (const span of req.spans) {
    const ov = overlapLen(key, span);
    if (ov > best) best = ov;
  }
  return best;
}

interface Candidate {
  keyIndex: number;
  reqIndex: number;
  overlap: number;
}

/**
 * Grade the app's requirements against the answer key by DOCUMENT POSITION,
 * never by wording. Matching is 1-to-1: each grounded requirement can satisfy
 * at most one key item, assigned greedily by largest overlap. So when two key
 * items share a span, a single merged requirement covers only one of them and
 * the other correctly surfaces as missed.
 *
 * Buckets:
 *   found    — key item overlaps a grounded requirement
 *   excluded — key item only overlaps a requirement grounding rejected
 *              (the model saw it, verification tossed it)
 *   missed   — nothing points there (the recall gap)
 *   extra    — grounded requirement overlapping no key item
 *              (over-split, a hole in the key, or a precision miss)
 */
export function match(
  keyItems: ResolvedKeyItem[],
  appReqs: AppRequirement[],
): MatchResult {
  const grounded = appReqs.filter(
    (r) => r.status === 'grounded' && r.spans.length > 0,
  );

  const candidates: Candidate[] = [];
  keyItems.forEach((key, keyIndex) => {
    grounded.forEach((req, reqIndex) => {
      const overlap = bestOverlap(key, req);
      if (overlap > 0) candidates.push({ keyIndex, reqIndex, overlap });
    });
  });
  // Deterministic order: biggest overlap first, then document order of the key,
  // then requirement order — so a real hit always beats a 1-char graze.
  candidates.sort(
    (a, b) =>
      b.overlap - a.overlap ||
      a.keyIndex - b.keyIndex ||
      a.reqIndex - b.reqIndex,
  );

  const keyToReq = new Map<number, number>();
  const matchedReqs = new Set<number>();
  for (const c of candidates) {
    if (keyToReq.has(c.keyIndex) || matchedReqs.has(c.reqIndex)) continue;
    keyToReq.set(c.keyIndex, c.reqIndex);
    matchedReqs.add(c.reqIndex);
  }

  // Only excluded requirements with at least one verified span can be located.
  const excludedReqs = appReqs.filter(
    (r) => r.status === 'excluded' && r.spans.length > 0,
  );

  const found: FoundMatch[] = [];
  const missed: ResolvedKeyItem[] = [];
  const excluded: ExcludedMatch[] = [];

  keyItems.forEach((key, keyIndex) => {
    const reqIndex = keyToReq.get(keyIndex);
    if (reqIndex !== undefined) {
      const req = grounded[reqIndex] as AppRequirement;
      const keyLen = key.end - key.start;
      found.push({
        key,
        req,
        overlapRatio: keyLen > 0 ? bestOverlap(key, req) / keyLen : 0,
      });
      return;
    }
    const reqs = excludedReqs.filter((r) => bestOverlap(key, r) > 0);
    if (reqs.length > 0) excluded.push({ key, reqs });
    else missed.push(key);
  });

  const extra = grounded.filter((_, i) => !matchedReqs.has(i));

  return { found, missed, excluded, extra };
}
