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

/** One verified (or attempted) citation span. */
export interface Citation {
  quote: string;
  verified: boolean;
  start: number | null;
  end: number | null;
  method: VerificationMethod;
}

export interface ClassifiedRequirement {
  requirement_text: string;
  status: RequirementStatus;
  /**
   * grounded: every span verified. excluded: every attempted span with its
   * real verified flag (failing spans have verified:false / method:'none' /
   * null offsets), preserved for audit. abstained: empty.
   */
  citations: Citation[];
  impacted_departments: Department[];
  /** Kept only when grounded — guidance derived from an untrusted claim is untrusted. */
  action_items: ExtractedActionItem[];
  /** How many draft action items were dropped because the parent isn't grounded. */
  discarded_action_items: number;
}

/**
 * The trust routing. Pure and deterministic. A requirement may cite several
 * spans; each is verified independently and grounding is all-or-nothing:
 *   every span verifies    → grounded (with per-span offsets)
 *   else model said not_stated → abstained
 *   else                   → excluded (spans stored with real flags, never trusted)
 */
export function classifyRequirement(
  extracted: ExtractedRequirement,
  fullText: string,
): ClassifiedRequirement {
  // Schema already restricts departments to the vocabulary; this filter is
  // the mandated deterministic backstop in case the schema ever loosens.
  const departments = [
    ...new Set(extracted.impacted_departments.filter(isValidDepartment)),
  ];

  const quotes = extracted.source_quotes;
  const results = quotes.map((quote) => ({
    quote,
    result: verifyQuote(quote, fullText),
  }));
  const allVerified =
    quotes.length > 0 && results.every(({ result }) => result.verified);

  if (allVerified) {
    return {
      requirement_text: extracted.requirement_text,
      status: 'grounded',
      citations: results.map(({ quote, result }) => ({
        quote,
        verified: result.verified,
        start: result.verified ? result.start : null,
        end: result.verified ? result.end : null,
        method: result.method,
      })),
      impacted_departments: departments,
      action_items: extracted.action_items,
      discarded_action_items: 0,
    };
  }

  const citations: Citation[] = extracted.not_stated
    ? []
    : results.map(({ quote, result }) =>
        result.verified
          ? {
              quote,
              verified: true,
              start: result.start,
              end: result.end,
              method: result.method,
            }
          : { quote, verified: false, start: null, end: null, method: 'none' },
      );

  return {
    requirement_text: extracted.requirement_text,
    status: extracted.not_stated ? 'abstained' : 'excluded',
    citations,
    impacted_departments: departments,
    action_items: [],
    discarded_action_items: extracted.action_items.length,
  };
}
