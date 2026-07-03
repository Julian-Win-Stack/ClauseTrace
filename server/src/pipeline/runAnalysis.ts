import {
  getAnalysis,
  getApl,
  saveAnalysis,
  type AnalysisDto,
} from '../db/queries.js';
import { classifyError, withRetry, withTimeout } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import type { LLMClient } from '../llm/client.js';
import { getLLMClient } from '../llm/openaiClient.js';
import {
  analysisSystemPrompt,
  analysisUserPrompt,
  repairPrompt,
} from '../llm/prompts.js';
import {
  analysisResponseSchema,
  type AnalysisResponse,
} from '../llm/schemas.js';
import { attachFaithfulness } from './attachFaithfulness.js';
import { classifyRequirement } from './classifyRequirement.js';

const CALL_TIMEOUT_MS = 180_000;
const OVERALL_TIMEOUT_MS = 300_000;

export interface AnalysisResult extends AnalysisDto {
  warnings: string[];
}

async function callModel(
  llm: LLMClient,
  title: string,
  fullText: string,
): Promise<AnalysisResponse> {
  const base = {
    system: analysisSystemPrompt,
    schema: analysisResponseSchema,
    schemaName: 'apl_analysis',
    timeoutMs: CALL_TIMEOUT_MS,
  };
  try {
    return await withRetry(() =>
      llm.structuredCall({
        ...base,
        user: analysisUserPrompt(title, fullText),
      }),
    );
  } catch (err) {
    if (classifyError(err) !== 'schema_invalid') throw err;
    // One repair re-prompt on schema failure, then fail for real.
    logger.warn('schema-invalid model output, attempting one repair');
    const message =
      err instanceof Error ? err.message.slice(0, 2000) : String(err);
    return await withRetry(() =>
      llm.structuredCall({
        ...base,
        user: `${analysisUserPrompt(title, fullText)}\n\n${repairPrompt(message)}`,
      }),
    );
  }
}

/**
 * The whole pipeline for one APL: single LLM call (summary + requirements +
 * draft action items) → deterministic verification and trust routing →
 * persist, replacing any previous analysis. No run-status tracking, no crash
 * recovery — a failed run is simply re-run.
 */
export async function runAnalysis(aplId: number): Promise<AnalysisResult> {
  const apl = await getApl(aplId);
  if (!apl) throw new Error(`APL ${aplId} not found`);

  const title = apl.apl_number
    ? `APL ${apl.apl_number}: ${apl.title}`
    : apl.title;
  const llm = getLLMClient();
  const response = await withTimeout(
    callModel(llm, title, apl.full_text),
    OVERALL_TIMEOUT_MS,
    'analysis',
  );

  const classified = response.requirements.map((req) =>
    classifyRequirement(req, apl.full_text),
  );

  const { requirements, warnings: faithfulnessWarnings } =
    await attachFaithfulness(llm, classified);

  const warnings: string[] = [...faithfulnessWarnings];
  const discarded = classified.reduce(
    (sum, req) => sum + req.discarded_action_items,
    0,
  );
  if (discarded > 0) {
    warnings.push(
      `${discarded} draft action item(s) were discarded because their requirement could not be verified against the source.`,
    );
  }

  await saveAnalysis(aplId, response.summary, requirements);
  logger.info('analysis saved', {
    aplId,
    requirements: classified.length,
    grounded: classified.filter((r) => r.status === 'grounded').length,
    excluded: classified.filter((r) => r.status === 'excluded').length,
    abstained: classified.filter((r) => r.status === 'abstained').length,
  });

  const saved = await getAnalysis(aplId);
  if (!saved) throw new Error('analysis vanished after save');
  return { ...saved, warnings };
}
