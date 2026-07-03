import { withRetry } from '../lib/errors.js';
import { mapWithConcurrency } from '../lib/concurrency.js';
import { checkFaithfulness } from '../llm/faithfulness.js';
import type { LLMClient } from '../llm/client.js';
import type { ClassifiedRequirement } from './classifyRequirement.js';

const CONCURRENCY = 8;
const CALL_TIMEOUT_MS = 60_000;

export interface RequirementForSave extends ClassifiedRequirement {
  faithfulness: 'supported' | 'needs_review' | null;
  faithfulness_reason: string | null;
}

/**
 * Advisory faithfulness pass: for each GROUNDED requirement, ask the model
 * whether its verified quotes actually support the paraphrase. NON-CRITICAL —
 * any failure degrades to `faithfulness = null` plus a warning; it never fails
 * the run and never changes trust status. Non-grounded requirements are left
 * `faithfulness = null` and are never sent to the judge.
 */
export async function attachFaithfulness(
  llm: LLMClient,
  classified: ClassifiedRequirement[],
): Promise<{ requirements: RequirementForSave[]; warnings: string[] }> {
  const requirements: RequirementForSave[] = classified.map((req) => ({
    ...req,
    faithfulness: null,
    faithfulness_reason: null,
  }));
  const warnings: string[] = [];

  const grounded = requirements
    .map((req, index) => ({ req, index }))
    .filter(({ req }) => req.status === 'grounded');

  const outcomes = await mapWithConcurrency(
    grounded,
    CONCURRENCY,
    async ({ req, index }) => {
      try {
        const quotes = req.citations.map((c) => c.quote);
        const verdict = await withRetry(() =>
          checkFaithfulness(llm, req.requirement_text, quotes, CALL_TIMEOUT_MS),
        );
        return {
          index,
          faithfulness: verdict.verdict,
          reason: verdict.verdict === 'needs_review' ? verdict.reason : null,
        } as const;
      } catch {
        return { index, failed: true } as const;
      }
    },
  );

  for (const outcome of outcomes) {
    const target = requirements[outcome.index];
    if (!target) continue;
    if ('failed' in outcome) {
      warnings.push(
        `Faithfulness check could not be completed for a grounded requirement; it stays verified with no faithfulness verdict.`,
      );
      continue;
    }
    target.faithfulness = outcome.faithfulness;
    target.faithfulness_reason = outcome.reason;
  }

  return { requirements, warnings };
}
