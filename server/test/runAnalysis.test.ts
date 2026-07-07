import { describe, expect, it, vi } from 'vitest';
import type { LLMClient, StructuredCallOptions } from '../src/llm/client.js';
import { runAnalysis } from '../src/pipeline/runAnalysis.js';

let currentLLM: LLMClient;

vi.mock('../src/llm/openaiClient.js', () => ({
  getLLMClient: () => currentLLM,
}));

vi.mock('../src/lib/logger.js', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}));

type Responder = (schemaName: string, user: string) => unknown;

/**
 * Stub the one seam the pipeline uses. `structuredCall` runs the caller's stub
 * through the real zod schema, so a malformed stub fails loudly instead of
 * masquerading as valid model output. Everything downstream of the LLM —
 * tiling, verifyQuote, classifyRequirement, sorting, faithfulness wiring —
 * runs for real.
 */
class FakeLLM implements LLMClient {
  constructor(private readonly respond: Responder) {}
  async structuredCall<T>(options: StructuredCallOptions<T>): Promise<T> {
    return options.schema.parse(this.respond(options.schemaName, options.user));
  }
}

function analyze(llm: LLMClient, fullText: string) {
  currentLLM = llm;
  return runAnalysis('Test APL', fullText);
}

const SECTION_ONE_QUOTE = 'Plans must submit quarterly reports to DHCS.';
const SECTION_TWO_QUOTE = 'Plans must respond to appeals within 30 days.';
const FULL_TEXT = [
  'SECTION ONE',
  SECTION_ONE_QUOTE,
  'SECTION TWO',
  SECTION_TWO_QUOTE,
].join('\n');

const supportedVerdict = { verdict: 'supported', reason: '' };

describe('runAnalysis', () => {
  it('merges per-piece extractions into one grounded, ordered result', async () => {
    const pieceResponses = [
      {
        requirements: [
          {
            requirement_text: 'Submit quarterly reports.',
            source_quotes: [SECTION_ONE_QUOTE],
            impacted_departments: ['Compliance / Regulatory Affairs'],
            not_stated: false,
            action_items: [
              {
                action_item_text: 'Update the reporting P&P.',
                suggested_owner_department: 'Compliance / Regulatory Affairs',
                priority: 'high',
              },
            ],
          },
        ],
      },
      {
        requirements: [
          {
            requirement_text: 'Respond to appeals within 30 days.',
            source_quotes: [SECTION_TWO_QUOTE],
            impacted_departments: ['Appeals & Grievances'],
            not_stated: false,
            action_items: [],
          },
        ],
      },
    ];
    const llm = new FakeLLM((schemaName) => {
      if (schemaName === 'apl_segmentation') {
        return {
          summary: 'Two obligations.',
          boundary_markers: ['SECTION TWO'],
        };
      }
      if (schemaName === 'apl_piece_extraction') return pieceResponses.shift();
      return supportedVerdict;
    });

    const result = await analyze(llm, FULL_TEXT);

    expect(result.summary).toBe('Two obligations.');
    expect(result.warnings).toEqual([]);
    expect(result.requirements).toHaveLength(2);

    const [first, second] = result.requirements;
    expect(first?.ordinal).toBe(1);
    expect(second?.ordinal).toBe(2);
    expect(first?.requirement_text).toBe('Submit quarterly reports.');
    expect(second?.requirement_text).toBe('Respond to appeals within 30 days.');

    expect(first?.status).toBe('grounded');
    expect(first?.citations).toEqual([
      {
        quote: SECTION_ONE_QUOTE,
        verified: true,
        start: FULL_TEXT.indexOf(SECTION_ONE_QUOTE),
        end: FULL_TEXT.indexOf(SECTION_ONE_QUOTE) + SECTION_ONE_QUOTE.length,
        method: 'exact',
      },
    ]);
    expect(first?.impacted_departments).toEqual([
      'Compliance / Regulatory Affairs',
    ]);
    expect(first?.action_items).toEqual([
      {
        text: 'Update the reporting P&P.',
        suggested_owner_department: 'Compliance / Regulatory Affairs',
        priority: 'high',
      },
    ]);
    expect(first?.faithfulness).toBe('supported');
    expect(first?.faithfulness_reason).toBeNull();
  });

  it('excludes a requirement whose quote is not in the source and warns about its discarded action items', async () => {
    const llm = new FakeLLM((schemaName) => {
      if (schemaName === 'apl_segmentation') {
        return { summary: 'S', boundary_markers: [] };
      }
      if (schemaName === 'apl_piece_extraction') {
        return {
          requirements: [
            {
              requirement_text: 'Fabricated obligation.',
              source_quotes: ['this sentence does not exist in the source'],
              impacted_departments: ['Claims'],
              not_stated: false,
              action_items: [
                {
                  action_item_text: 'Should never surface.',
                  suggested_owner_department: 'Claims',
                  priority: 'low',
                },
                {
                  action_item_text: 'Should never surface either.',
                  suggested_owner_department: 'Claims',
                  priority: 'low',
                },
              ],
            },
          ],
        };
      }
      return supportedVerdict;
    });

    const result = await analyze(llm, FULL_TEXT);

    const [req] = result.requirements;
    expect(req?.status).toBe('excluded');
    expect(req?.citations[0]?.verified).toBe(false);
    expect(req?.action_items).toEqual([]);
    expect(req?.faithfulness).toBeNull();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/2 draft action item/);
  });

  it('recovers when the model returns schema-invalid output once', async () => {
    let failedOnce = false;
    const llm = new FakeLLM((schemaName) => {
      if (schemaName === 'apl_segmentation') {
        if (!failedOnce) {
          failedOnce = true;
          throw new SyntaxError('malformed model output');
        }
        return { summary: 'Recovered.', boundary_markers: [] };
      }
      if (schemaName === 'apl_piece_extraction') return { requirements: [] };
      return supportedVerdict;
    });

    const result = await analyze(llm, FULL_TEXT);

    expect(result.summary).toBe('Recovered.');
  });

  it('fails the run when schema-invalid output persists past the single repair', async () => {
    const llm = new FakeLLM(() => {
      throw new SyntaxError('malformed model output');
    });

    await expect(analyze(llm, FULL_TEXT)).rejects.toThrow(
      'malformed model output',
    );
  });
});
