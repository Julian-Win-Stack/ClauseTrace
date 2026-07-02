import { describe, expect, it } from 'vitest';
import { buildNormalized, mapSpanToRaw } from '../src/grounding/offsets.js';

describe('buildNormalized', () => {
  it('collapses whitespace, lowercases, and maps typographic chars', () => {
    const { normalized } = buildNormalized(
      'Plans  SHALL\n\tprovide “notice” — now',
    );
    expect(normalized).toBe('plans shall provide "notice" - now');
  });

  it('maps every normalized char back to its raw index', () => {
    const raw = 'A  B\n\nC';
    const { normalized, map } = buildNormalized(raw);
    expect(normalized).toBe('a b c');
    // Non-space chars map to their exact raw positions.
    expect(map[0]).toBe(0); // a -> A
    expect(map[2]).toBe(3); // b -> B
    expect(map[4]).toBe(6); // c -> C
  });

  it('round-trips a normalized span to a raw slice covering the same text', () => {
    const raw = 'The plan\nmust   comply fully.';
    const norm = buildNormalized(raw);
    const idx = norm.normalized.indexOf('must comply');
    const { start, end } = mapSpanToRaw(norm, idx, idx + 'must comply'.length);
    expect(raw.slice(start, end).replace(/\s+/g, ' ')).toBe('must comply');
  });

  it('throws on an out-of-bounds span', () => {
    const norm = buildNormalized('short');
    expect(() => mapSpanToRaw(norm, 0, 99)).toThrow(RangeError);
  });
});
