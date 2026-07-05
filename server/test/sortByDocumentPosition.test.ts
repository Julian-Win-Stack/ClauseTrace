import { describe, expect, it } from 'vitest';
import type {
  Citation,
  ClassifiedRequirement,
} from '../src/pipeline/classifyRequirement.js';
import { sortByDocumentPosition } from '../src/pipeline/sortByDocumentPosition.js';

function requirement(
  text: string,
  overrides: Partial<ClassifiedRequirement> = {},
): ClassifiedRequirement {
  return {
    requirement_text: text,
    status: 'grounded',
    citations: [],
    impacted_departments: [],
    action_items: [],
    discarded_action_items: 0,
    ...overrides,
  };
}

function verifiedSpan(start: number): Citation {
  return { quote: 'q', verified: true, start, end: start + 1, method: 'exact' };
}

const failedSpan: Citation = {
  quote: 'q',
  verified: false,
  start: null,
  end: null,
  method: 'none',
};

describe('document-order sort', () => {
  it('anchors a multi-span requirement to its earliest verified span', () => {
    const scattered = requirement('scattered', {
      citations: [verifiedSpan(500), verifiedSpan(40)],
    });
    const middle = requirement('middle', { citations: [verifiedSpan(100)] });

    const sorted = sortByDocumentPosition([middle, scattered]);

    expect(sorted.map((r) => r.requirement_text)).toEqual([
      'scattered',
      'middle',
    ]);
  });

  it('sinks requirements without a verified span to the end', () => {
    const abstained = requirement('abstained', { status: 'abstained' });
    const grounded = requirement('grounded', { citations: [verifiedSpan(10)] });

    const sorted = sortByDocumentPosition([abstained, grounded]);

    expect(sorted.map((r) => r.requirement_text)).toEqual([
      'grounded',
      'abstained',
    ]);
  });

  it('keeps extraction order among requirements that have no position', () => {
    const first = requirement('first abstained', { status: 'abstained' });
    const second = requirement('second abstained', { status: 'abstained' });
    const grounded = requirement('grounded', { citations: [verifiedSpan(10)] });

    const sorted = sortByDocumentPosition([first, second, grounded]);

    expect(sorted.map((r) => r.requirement_text)).toEqual([
      'grounded',
      'first abstained',
      'second abstained',
    ]);
  });

  it('positions an excluded requirement by its verified spans, ignoring failed ones', () => {
    const excluded = requirement('excluded', {
      status: 'excluded',
      citations: [failedSpan, verifiedSpan(50)],
    });
    const grounded = requirement('grounded', {
      citations: [verifiedSpan(100)],
    });

    const sorted = sortByDocumentPosition([grounded, excluded]);

    expect(sorted.map((r) => r.requirement_text)).toEqual([
      'excluded',
      'grounded',
    ]);
  });
});
