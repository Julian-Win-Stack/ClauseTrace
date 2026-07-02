import { isValidDepartment, type Department } from '../domain/departments.js';
import {
  verifyQuote,
  type VerificationMethod,
} from '../grounding/verifyQuote.js';
import type {
  ExtractedActionItem,
  ExtractedRequirement,
} from '../llm/schemas.js';

export type RequirementStatus = 'grounded' | 'abstained' | 'excluded';

export interface ClassifiedRequirement {
  requirement_text: string;
  source_quote: string | null;
  status: RequirementStatus;
  verification_method: VerificationMethod;
  match_score: number | null;
  source_start_offset: number | null;
  source_end_offset: number | null;
  impacted_departments: Department[];
  /** Kept only when grounded — guidance derived from an untrusted claim is untrusted. */
  action_items: ExtractedActionItem[];
  /** How many draft action items were dropped because the parent isn't grounded. */
  discarded_action_items: number;
}

/**
 * The trust routing. Pure and deterministic:
 *   quote verified            → grounded (with offsets)
 *   else model said not_stated → abstained
 *   else                       → excluded (stored, shown, never trusted)
 */
export function classifyRequirement(
  extracted: ExtractedRequirement,
  fullText: string,
  fuzzyThreshold: number,
): ClassifiedRequirement {
  // Schema already restricts departments to the vocabulary; this filter is
  // the mandated deterministic backstop in case the schema ever loosens.
  const departments = [
    ...new Set(extracted.impacted_departments.filter(isValidDepartment)),
  ];

  const result = verifyQuote(extracted.source_quote, fullText, fuzzyThreshold);
  if (result.verified) {
    return {
      requirement_text: extracted.requirement_text,
      source_quote: extracted.source_quote,
      status: 'grounded',
      verification_method: result.method,
      match_score: result.score,
      source_start_offset: result.start,
      source_end_offset: result.end,
      impacted_departments: departments,
      action_items: extracted.action_items,
      discarded_action_items: 0,
    };
  }

  return {
    requirement_text: extracted.requirement_text,
    source_quote: extracted.not_stated ? null : extracted.source_quote,
    status: extracted.not_stated ? 'abstained' : 'excluded',
    verification_method: 'none',
    match_score: null,
    source_start_offset: null,
    source_end_offset: null,
    impacted_departments: departments,
    action_items: [],
    discarded_action_items: extracted.action_items.length,
  };
}
