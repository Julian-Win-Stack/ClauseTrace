import * as z from 'zod';
import { DEPARTMENTS } from '../domain/departments.js';

// strictObject everywhere and no .optional(): OpenAI strict structured output
// requires every field required and additionalProperties: false.

export const actionItemSchema = z.strictObject({
  action_item_text: z.string(),
  suggested_owner_department: z.enum(DEPARTMENTS),
  priority: z.enum(['high', 'medium', 'low']),
});

export const extractedRequirementSchema = z.strictObject({
  requirement_text: z.string(),
  source_quote: z.string(),
  impacted_departments: z.array(z.enum(DEPARTMENTS)),
  not_stated: z.boolean(),
  action_items: z.array(actionItemSchema),
});

/**
 * The single-call analysis response: summary + requirements (with nested
 * draft action items). Strict mode guarantees this *shape* only — whether a
 * source_quote really exists in the source is decided by grounding/, never
 * here.
 */
export const analysisResponseSchema = z.strictObject({
  summary: z.string(),
  requirements: z.array(extractedRequirementSchema),
});

export type ExtractedActionItem = z.infer<typeof actionItemSchema>;
export type ExtractedRequirement = z.infer<typeof extractedRequirementSchema>;
export type AnalysisResponse = z.infer<typeof analysisResponseSchema>;
