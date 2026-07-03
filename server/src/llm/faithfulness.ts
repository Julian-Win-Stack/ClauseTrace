import type { LLMClient } from './client.js';
import { faithfulnessSystemPrompt, faithfulnessUserPrompt } from './prompts.js';
import {
  faithfulnessResponseSchema,
  type FaithfulnessResponse,
} from './schemas.js';

/**
 * Advisory faithfulness check for ONE grounded requirement: does the verified
 * quote(s) actually support the paraphrase? Generated content — the caller
 * must never let this influence trust status.
 */
export async function checkFaithfulness(
  llm: LLMClient,
  requirementText: string,
  quotes: string[],
  timeoutMs?: number,
): Promise<FaithfulnessResponse> {
  return llm.structuredCall({
    system: faithfulnessSystemPrompt,
    user: faithfulnessUserPrompt(requirementText, quotes),
    schema: faithfulnessResponseSchema,
    schemaName: 'faithfulness',
    timeoutMs,
  });
}
