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
    source_quotes: [FULL_TEXT],
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
  it('routes a verified quote to grounded, keeping the citation and action items', () => {
    const result = classifyRequirement(extracted({}), FULL_TEXT);
    expect(result.status).toBe('grounded');
    expect(result.citations).toHaveLength(1);
    const [citation] = result.citations;
    expect(citation?.verified).toBe(true);
    expect(citation?.method).toBe('exact');
    expect(FULL_TEXT.slice(citation?.start ?? -1, citation?.end ?? -1)).toBe(
      FULL_TEXT,
    );
    expect(result.action_items).toHaveLength(1);
    expect(result.discarded_action_items).toBe(0);
  });

  it('grounds a multi-span requirement when every span verifies, mapping each offset back to its span', () => {
    const spanA = 'Plans must respond';
    const spanB = 'within five business days';
    const result = classifyRequirement(
      extracted({ source_quotes: [spanA, spanB] }),
      FULL_TEXT,
    );
    expect(result.status).toBe('grounded');
    expect(result.citations).toHaveLength(2);
    expect(result.citations.every((c) => c.verified)).toBe(true);
    expect(
      result.citations.map((c) => FULL_TEXT.slice(c.start ?? -1, c.end ?? -1)),
    ).toEqual([spanA, spanB]);
    expect(result.action_items).toHaveLength(1);
  });

  it('excludes a multi-span requirement if any single span fails, preserving per-span verified flags', () => {
    const good = 'Plans must respond';
    const bad = 'Plans shall file quarterly attestations.';
    const result = classifyRequirement(
      extracted({ source_quotes: [good, bad] }),
      FULL_TEXT,
    );
    expect(result.status).toBe('excluded');
    expect(result.citations.map((c) => c.verified)).toEqual([true, false]);
    expect(result.citations[1]?.quote).toBe(bad);
    expect(result.action_items).toHaveLength(0);
    expect(result.discarded_action_items).toBe(1);
  });

  it('routes not_stated with no quotes to abstained and discards its action items', () => {
    const result = classifyRequirement(
      extracted({ not_stated: true, source_quotes: [] }),
      FULL_TEXT,
    );
    expect(result.status).toBe('abstained');
    expect(result.citations).toEqual([]);
    expect(result.action_items).toHaveLength(0);
    expect(result.discarded_action_items).toBe(1);
  });

  it('routes an unverifiable quote to excluded, preserving it for audit but discarding action items', () => {
    const fabricatedQuote =
      'Plans shall file quarterly network adequacy attestations with the department.';
    const result = classifyRequirement(
      extracted({ source_quotes: [fabricatedQuote] }),
      FULL_TEXT,
    );
    expect(result.status).toBe('excluded');
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]?.verified).toBe(false);
    expect(result.citations[0]?.quote).toBe(fabricatedQuote);
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
