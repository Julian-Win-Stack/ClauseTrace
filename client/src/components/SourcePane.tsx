import { useEffect, useRef } from 'react';
import type { Span } from '../types';

interface Segment {
  text: string;
  start: number;
  kind: 'plain' | 'faint' | 'active';
}

interface Mark extends Span {
  kind: 'faint' | 'active';
}

// Split the source text into plain / faint / active runs. `spans` are the
// verified quotes shown while the "highlight quotes" toggle is on; `active` is
// the single click-traced quote, which wins wherever it overlaps a faint span.
function toSegments(
  text: string,
  spans: Span[],
  active: Span | null,
): Segment[] {
  const marks: Mark[] = spans
    .filter(
      (s) => !(active && s.start === active.start && s.end === active.end),
    )
    .map((s) => ({ ...s, kind: 'faint' }));
  if (active) marks.push({ ...active, kind: 'active' });
  marks.sort((a, b) => a.start - b.start);

  const segments: Segment[] = [];
  let cursor = 0;
  for (const mark of marks) {
    if (mark.start < cursor) continue; // drop overlaps to keep slicing safe
    if (mark.start > cursor) {
      segments.push({
        text: text.slice(cursor, mark.start),
        start: cursor,
        kind: 'plain',
      });
    }
    segments.push({
      text: text.slice(mark.start, mark.end),
      start: mark.start,
      kind: mark.kind,
    });
    cursor = mark.end;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), start: cursor, kind: 'plain' });
  }
  return segments;
}

export function SourcePane({
  text,
  spans,
  highlight,
}: {
  text: string;
  spans: Span[];
  highlight: Span | null;
}) {
  const markRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (highlight) {
      markRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlight]);

  const segments = toSegments(text, spans, highlight);

  return (
    <div className="whitespace-pre-wrap font-serif text-[15.5px] leading-7 text-ink-soft">
      {segments.map((seg) => {
        if (seg.kind === 'plain')
          return <span key={seg.start}>{seg.text}</span>;
        if (seg.kind === 'active') {
          return (
            <mark
              key={seg.start}
              ref={markRef}
              className="rounded-sm bg-marker px-0.5 py-0.5 text-ink shadow-[inset_0_-2px_0_var(--color-marker-line)]"
            >
              {seg.text}
            </mark>
          );
        }
        return (
          <mark
            key={seg.start}
            className="rounded-sm bg-marker/40 text-ink-soft"
          >
            {seg.text}
          </mark>
        );
      })}
    </div>
  );
}
