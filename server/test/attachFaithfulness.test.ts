import { describe, expect, it } from 'vitest';
import { attachFaithfulness } from '../src/pipeline/attachFaithfulness.js';
import type { LLMClient, StructuredCallOptions } from '../src/llm/client.js';
import type { ClassifiedRequirement } from '../src/pipeline/classifyRequirement.js';

type Responder = (opts: { user: string }) => unknown;

/**
 * Stub the one seam the stage uses. `structuredCall` runs the caller's stub
 * through the real zod schema, so a malformed stub fails loudly instead of
 * masquerading as a valid verdict.
 */
class FakeLLM implements LLMClient {
  readonly seen: string[] = [];
  constructor(private readonly respond: Responder) {}
  async structuredCall<T>(options: StructuredCallOptions<T>): Promise<T> {
    this.seen.push(options.user);
    return options.schema.parse(this.respond(options));
  }
}

function grounded(
  text: string,
  quotes: string[] = ['q'],
): ClassifiedRequirement {
  return {
    requirement_text: text,
    status: 'grounded',
    citations: quotes.map((quote) => ({
      quote,
      verified: true,
      start: 0,
      end: quote.length,
      method: 'exact',
    })),
    impacted_departments: [],
    action_items: [],
    discarded_action_items: 0,
  };
}

function excluded(text: string): ClassifiedRequirement {
  return {
    requirement_text: text,
    status: 'excluded',
    citations: [
      { quote: 'x', verified: false, start: null, end: null, method: 'none' },
    ],
    impacted_departments: [],
    action_items: [],
    discarded_action_items: 0,
  };
}

describe('attachFaithfulness', () => {
  it('attaches a needs_review verdict and its reason to a grounded requirement', async () => {
    const llm = new FakeLLM(() => ({
      verdict: 'needs_review',
      reason: 'states a January 1 deadline absent from the cited quotes',
    }));
    const { requirements, warnings } = await attachFaithfulness(llm, [
      grounded('R1'),
    ]);
    expect(requirements[0]?.faithfulness).toBe('needs_review');
    expect(requirements[0]?.faithfulness_reason).toBe(
      'states a January 1 deadline absent from the cited quotes',
    );
    expect(warnings).toEqual([]);
  });

  it('persists the reason as null when the verdict is supported', async () => {
    const llm = new FakeLLM(() => ({ verdict: 'supported', reason: '' }));
    const { requirements } = await attachFaithfulness(llm, [grounded('R1')]);
    expect(requirements[0]?.faithfulness).toBe('supported');
    expect(requirements[0]?.faithfulness_reason).toBeNull();
  });

  it('degrades to null with a warning when the judge throws, never failing the run', async () => {
    const llm = new FakeLLM(() => {
      throw new Error('judge exploded');
    });
    const { requirements, warnings } = await attachFaithfulness(llm, [
      grounded('R1'),
    ]);
    expect(requirements[0]?.faithfulness).toBeNull();
    expect(requirements[0]?.faithfulness_reason).toBeNull();
    expect(warnings).toHaveLength(1);
  });

  it('never sends non-grounded requirements to the judge and leaves them null', async () => {
    const llm = new FakeLLM(() => ({ verdict: 'supported', reason: '' }));
    const { requirements } = await attachFaithfulness(llm, [
      excluded('BAD'),
      grounded('GOOD'),
    ]);
    expect(requirements[0]?.faithfulness).toBeNull();
    expect(requirements[1]?.faithfulness).toBe('supported');
    expect(llm.seen.some((user) => user.includes('BAD'))).toBe(false);
    expect(llm.seen.some((user) => user.includes('GOOD'))).toBe(true);
  });
});
