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
  source_quotes: z.array(z.string()),
  impacted_departments: z.array(z.enum(DEPARTMENTS)),
  not_stated: z.boolean(),
  action_items: z.array(actionItemSchema),
});

/**
 * Stage 1 (segmentation): the whole-document call returns the summary plus
 * short verbatim boundary markers. Markers are located by deterministic code
 * (never trusted as offsets); 5-10 are requested in the prompt, but NO
 * min/max is enforced — OpenAI strict output may ignore or reject minItems/
 * maxItems, and the tiling code guarantees coverage regardless of count.
 */
export const segmentationResponseSchema = z.strictObject({
  summary: z.string(),
  boundary_markers: z.array(z.string()),
});

/**
 * Stage 2 (per-piece extraction): each piece call returns only requirements.
 * Strict mode guarantees this *shape* only — whether a source_quotes span
 * really exists in the source is decided by grounding/, never here.
 */
export const pieceExtractionResponseSchema = z.strictObject({
  requirements: z.array(extractedRequirementSchema),
});

/**
 * Advisory faithfulness verdict for one already-grounded requirement. This is
 * generated content — it can flag a requirement for review but NEVER changes
 * its trust status. `reason` is required by strict mode; it is "" when
 * supported (persisted as null) and a specific sentence when needs_review.
 */
export const faithfulnessResponseSchema = z.strictObject({
  verdict: z.enum(['supported', 'needs_review']),
  reason: z.string(),
});

export type ExtractedActionItem = z.infer<typeof actionItemSchema>;
export type ExtractedRequirement = z.infer<typeof extractedRequirementSchema>;
export type SegmentationResponse = z.infer<typeof segmentationResponseSchema>;
export type PieceExtractionResponse = z.infer<
  typeof pieceExtractionResponseSchema
>;
export type FaithfulnessResponse = z.infer<typeof faithfulnessResponseSchema>;
