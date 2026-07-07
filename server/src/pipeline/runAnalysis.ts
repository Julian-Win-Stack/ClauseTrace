import { classifyError, withRetry, withTimeout } from '../lib/errors.js';
import { mapWithConcurrency } from '../lib/concurrency.js';
import { logger } from '../lib/logger.js';
import type { LLMClient, StructuredCallOptions } from '../llm/client.js';
import { getLLMClient } from '../llm/openaiClient.js';
import {
  pieceExtractionSystemPrompt,
  pieceExtractionUserPrompt,
  repairPrompt,
  segmentationSystemPrompt,
  segmentationUserPrompt,
} from '../llm/prompts.js';
import {
  pieceExtractionResponseSchema,
  segmentationResponseSchema,
  type ExtractedRequirement,
} from '../llm/schemas.js';
import { attachFaithfulness } from './attachFaithfulness.js';
import { classifyRequirement, type Citation } from './classifyRequirement.js';
import { tilePieces } from './segmentDocument.js';
import { sortByDocumentPosition } from './sortByDocumentPosition.js';

const CALL_TIMEOUT_MS = 1_200_000;
const OVERALL_TIMEOUT_MS = 1_200_000;

export interface ActionItemDto {
  text: string;
  suggested_owner_department: string;
  priority: 'high' | 'medium' | 'low';
}

export interface RequirementDto {
  ordinal: number;
  requirement_text: string;
  status: 'grounded' | 'abstained' | 'excluded';
  citations: Citation[];
  faithfulness: 'supported' | 'needs_review' | null;
  faithfulness_reason: string | null;
  impacted_departments: string[];
  action_items: ActionItemDto[];
}

export interface AnalysisResult {
  summary: string;
  requirements: RequirementDto[];
  warnings: string[];
}

/**
 * One structured LLM call with the mandated failure policy: classify → retry
 * retryable (capped backoff, inside withRetry) → one repair re-prompt on
 * schema_invalid → otherwise rethrow. Both stages are critical and share this
 * shape, so it lives here once.
 */
async function structuredWithRepair<T>(
  llm: LLMClient,
  options: Omit<StructuredCallOptions<T>, 'user'>,
  userPrompt: string,
): Promise<T> {
  try {
    return await withRetry(() =>
      llm.structuredCall({ ...options, user: userPrompt }),
    );
  } catch (err) {
    if (classifyError(err) !== 'schema_invalid') throw err;
    logger.warn('schema-invalid model output, attempting one repair', {
      schema: options.schemaName,
    });
    const message =
      err instanceof Error ? err.message.slice(0, 2000) : String(err);
    return await withRetry(() =>
      llm.structuredCall({
        ...options,
        user: `${userPrompt}\n\n${repairPrompt(message)}`,
      }),
    );
  }
}

function callSegmentation(llm: LLMClient, title: string, fullText: string) {
  return structuredWithRepair(
    llm,
    {
      system: segmentationSystemPrompt,
      schema: segmentationResponseSchema,
      schemaName: 'apl_segmentation',
      timeoutMs: CALL_TIMEOUT_MS,
    },
    segmentationUserPrompt(title, fullText),
  );
}

function callPieceExtraction(
  llm: LLMClient,
  title: string,
  fullText: string,
  pieceText: string,
) {
  return structuredWithRepair(
    llm,
    {
      system: pieceExtractionSystemPrompt,
      schema: pieceExtractionResponseSchema,
      schemaName: 'apl_piece_extraction',
      timeoutMs: CALL_TIMEOUT_MS,
    },
    pieceExtractionUserPrompt(title, fullText, pieceText),
  );
}

/**
 * Two-stage extraction. Stage 1: one call returns the summary + short verbatim
 * boundary markers. Deterministic code (tilePieces) locates the markers and
 * slices full_text into contiguous pieces covering it end-to-end. Stage 2: one
 * parallel call per piece, each seeing the whole letter for context and its own
 * piece, extracting only requirements whose obligation sentence starts in its
 * piece. Both stages are critical — any unrecovered piece failure rejects the
 * whole run (a silently dropped piece would be an invisible recall hole).
 */
async function runSegmentedExtraction(
  llm: LLMClient,
  title: string,
  fullText: string,
): Promise<{ summary: string; requirements: ExtractedRequirement[] }> {
  const seg = await callSegmentation(llm, title, fullText);

  const pieces = tilePieces(fullText, seg.boundary_markers);
  logger.info('document segmented', {
    markers: seg.boundary_markers.length,
    pieces: pieces.length,
  });

  const perPiece = await mapWithConcurrency(pieces, pieces.length, (piece) =>
    callPieceExtraction(llm, title, fullText, piece.text),
  );

  return {
    summary: seg.summary,
    requirements: perPiece.flatMap((p) => p.requirements),
  };
}

/**
 * The whole pipeline for one document: segmentation call → parallel per-piece
 * extraction → merge → deterministic verification and trust routing →
 * advisory faithfulness pass. Stateless — nothing is persisted; the returned
 * result is the only output, and offsets refer to the fullText passed in.
 */
export async function runAnalysis(
  title: string,
  fullText: string,
): Promise<AnalysisResult> {
  const llm = getLLMClient();
  const { summary, requirements: extracted } = await withTimeout(
    runSegmentedExtraction(llm, title, fullText),
    OVERALL_TIMEOUT_MS,
    'analysis',
  );

  const classified = sortByDocumentPosition(
    extracted.map((req) => classifyRequirement(req, fullText)),
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

  logger.info('analysis complete', {
    title,
    requirements: classified.length,
    grounded: classified.filter((r) => r.status === 'grounded').length,
    excluded: classified.filter((r) => r.status === 'excluded').length,
    abstained: classified.filter((r) => r.status === 'abstained').length,
  });

  return {
    summary,
    requirements: requirements.map((req, index) => ({
      ordinal: index + 1,
      requirement_text: req.requirement_text,
      status: req.status,
      citations: req.citations,
      faithfulness: req.faithfulness,
      faithfulness_reason: req.faithfulness_reason,
      impacted_departments: req.impacted_departments,
      action_items: req.action_items.map((item) => ({
        text: item.action_item_text,
        suggested_owner_department: item.suggested_owner_department,
        priority: item.priority,
      })),
    })),
    warnings,
  };
}
