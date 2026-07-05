import type { ClassifiedRequirement } from './classifyRequirement.js';

/**
 * Order requirements by where their evidence first appears in full_text so
 * they read top-to-bottom of the letter. Requirements with no verified span
 * (abstained, fully-failed excluded) have no position and sink to the end,
 * keeping extraction order among themselves (sort is stable).
 */
export function sortByDocumentPosition(
  requirements: ClassifiedRequirement[],
): ClassifiedRequirement[] {
  const position = (req: ClassifiedRequirement): number => {
    const starts = req.citations
      .filter((citation) => citation.verified)
      .map((citation) => citation.start)
      .filter((start): start is number => start !== null);
    return starts.length > 0 ? Math.min(...starts) : Number.MAX_SAFE_INTEGER;
  };
  return [...requirements].sort((a, b) => position(a) - position(b));
}
