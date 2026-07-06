import { describe, expect, it } from 'vitest';
import { resolveKey } from './resolveKey.js';

describe('resolveKey', () => {
  const fullText =
    'Alpha. Plans must notify DHCS within 10 business days. Omega.';

  it('locates a verbatim quote and separates one that is not present', () => {
    const { resolved, unresolved } = resolveKey(
      [
        { id: '1', quote: 'Plans must notify DHCS within 10 business days' },
        { id: '2', quote: 'Plans must notify CMS within 30 days' },
      ],
      fullText,
    );

    expect(resolved.map((r) => r.id)).toEqual(['1']);
    expect(unresolved.map((u) => u.id)).toEqual(['2']);
    // The resolved offsets must slice back to the exact quote — this is the
    // shared coordinate system the whole eval depends on.
    const r = resolved[0];
    expect(fullText.slice(r?.start, r?.end)).toBe(
      'Plans must notify DHCS within 10 business days',
    );
  });
});
