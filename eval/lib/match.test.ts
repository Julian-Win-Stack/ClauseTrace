import { describe, expect, it } from 'vitest';
import { match } from './match.js';
import type { AppRequirement, ResolvedKeyItem } from './types.js';

function key(id: string, start: number, end: number): ResolvedKeyItem {
  return { id, quote: `q-${id}`, start, end };
}

function req(
  ordinal: number,
  status: AppRequirement['status'],
  spans: [number, number][],
): AppRequirement {
  return {
    ordinal,
    text: `req-${ordinal}`,
    status,
    spans: spans.map(([start, end]) => ({ start, end })),
  };
}

describe('match', () => {
  it('marks a key item found when a grounded requirement overlaps it', () => {
    const res = match([key('A', 100, 200)], [req(1, 'grounded', [[120, 180]])]);
    expect(res.found.map((f) => f.key.id)).toEqual(['A']);
    expect(res.missed).toHaveLength(0);
    expect(res.extra).toHaveLength(0);
  });

  it('marks a key item missed when nothing points at it', () => {
    const res = match([key('A', 100, 200)], [req(1, 'grounded', [[300, 400]])]);
    expect(res.missed.map((k) => k.id)).toEqual(['A']);
    expect(res.extra).toHaveLength(1);
  });

  it('reports a grounded requirement matching no key item as extra', () => {
    const res = match([], [req(1, 'grounded', [[10, 20]])]);
    expect(res.extra).toHaveLength(1);
    expect(res.found).toHaveLength(0);
  });

  it('two key items in one span: both found when the app emits two requirements', () => {
    const res = match(
      [key('A', 100, 200), key('B', 100, 200)],
      [req(1, 'grounded', [[100, 200]]), req(2, 'grounded', [[100, 200]])],
    );
    expect(res.found.map((f) => f.key.id).sort()).toEqual(['A', 'B']);
    expect(res.missed).toHaveLength(0);
  });

  it('two key items in one span: one missed when the app merges them (1-to-1 matching)', () => {
    const res = match(
      [key('A', 100, 200), key('B', 100, 200)],
      [req(1, 'grounded', [[100, 200]])],
    );
    expect(res.found).toHaveLength(1);
    expect(res.missed).toHaveLength(1);
  });

  it('assigns each requirement to its largest-overlap key so a graze cannot steal a real hit', () => {
    // req 1 overlaps A fully but B by a single char; req 2 overlaps B fully.
    // Correct assignment is A↔1, B↔2 — the 1-char graze must lose.
    const res = match(
      [key('A', 100, 200), key('B', 199, 260)],
      [req(1, 'grounded', [[100, 200]]), req(2, 'grounded', [[199, 260]])],
    );
    const byKey = Object.fromEntries(
      res.found.map((f) => [f.key.id, f.req.ordinal]),
    );
    expect(byKey).toEqual({ A: 1, B: 2 });
    expect(res.missed).toHaveLength(0);
  });

  it('routes a key item to excluded when only a grounding-rejected requirement points there', () => {
    const res = match([key('A', 100, 200)], [req(1, 'excluded', [[120, 180]])]);
    expect(res.excluded.map((m) => m.key.id)).toEqual(['A']);
    expect(res.missed).toHaveLength(0);
    expect(res.found).toHaveLength(0);
  });

  it('ignores abstained requirements and grounded requirements with no verified span', () => {
    const res = match(
      [key('A', 100, 200)],
      [req(1, 'abstained', []), req(2, 'grounded', [])],
    );
    expect(res.missed.map((k) => k.id)).toEqual(['A']);
    expect(res.extra).toHaveLength(0);
  });

  it('flags a grazing found match with a low overlap ratio', () => {
    const res = match([key('A', 100, 200)], [req(1, 'grounded', [[199, 260]])]);
    expect(res.found[0]?.overlapRatio).toBeLessThan(0.3);
  });
});
