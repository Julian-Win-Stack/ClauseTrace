import { describe, expect, it } from 'vitest';
import { classifyRequirement } from '../src/pipeline/classifyRequirement.js';
import type { ExtractedRequirement } from '../src/llm/schemas.js';

const FULL_TEXT =
  'Plans must respond to standard prior authorization requests within five business days.';

function extracted(
  overrides: Partial<ExtractedRequirement>,
): ExtractedRequirement {
  return {
    requirement_text: 'Respond to standard PA requests within 5 business days.',
    source_quote: FULL_TEXT,
    impacted_departments: ['Utilization Management / Prior Authorization'],
    not_stated: false,
    action_items: [
      {
        action_item_text: 'Update PA turnaround SOP.',
        suggested_owner_department:
          'Utilization Management / Prior Authorization',
        priority: 'high',
      },
    ],
    ...overrides,
  };
}

describe('trust routing', () => {
  it('routes a verified quote to grounded, keeping offsets and action items', () => {
    const result = classifyRequirement(extracted({}), FULL_TEXT);
    expect(result.status).toBe('grounded');
    expect(result.verification_method).toBe('exact');
    expect(
      FULL_TEXT.slice(
        result.source_start_offset ?? -1,
        result.source_end_offset ?? -1,
      ),
    ).toBe(FULL_TEXT);
    expect(result.action_items).toHaveLength(1);
    expect(result.discarded_action_items).toBe(0);
  });

  it('routes not_stated to abstained and discards its action items', () => {
    const result = classifyRequirement(
      extracted({ not_stated: true, source_quote: '' }),
      FULL_TEXT,
    );
    expect(result.status).toBe('abstained');
    expect(result.source_quote).toBeNull();
    expect(result.action_items).toHaveLength(0);
    expect(result.discarded_action_items).toBe(1);
  });

  it('routes an unverifiable quote to excluded, preserving it for audit but discarding action items', () => {
    const fabricatedQuote =
      'Plans shall file quarterly network adequacy attestations with the department.';
    const result = classifyRequirement(
      extracted({ source_quote: fabricatedQuote }),
      FULL_TEXT,
    );
    expect(result.status).toBe('excluded');
    expect(result.source_quote).toBe(fabricatedQuote);
    expect(result.action_items).toHaveLength(0);
    expect(result.discarded_action_items).toBe(1);
  });

  it('grounds a requirement whose quote verifies even when not_stated is (contradictorily) true', () => {
    const result = classifyRequirement(
      extracted({ not_stated: true }),
      FULL_TEXT,
    );
    expect(result.status).toBe('grounded');
  });

  it('deduplicates repeated departments', () => {
    const result = classifyRequirement(
      extracted({
        impacted_departments: ['Claims', 'Claims', 'Member Services'],
      }),
      FULL_TEXT,
    );
    expect(result.impacted_departments).toEqual(['Claims', 'Member Services']);
  });
});
