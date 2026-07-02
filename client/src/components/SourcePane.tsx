import { useEffect, useRef } from 'react';
import type { Span } from '../types';

export function SourcePane({
  text,
  highlight,
}: {
  text: string;
  highlight: Span | null;
}) {
  const markRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (highlight) {
      markRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlight]);

  return (
    <div className="whitespace-pre-wrap font-serif text-[15.5px] leading-7 text-ink-soft">
      {highlight ? (
        <>
          {text.slice(0, highlight.start)}
          <mark
            ref={markRef}
            className="rounded-sm bg-marker px-0.5 py-0.5 text-ink shadow-[inset_0_-2px_0_var(--color-marker-line)]"
          >
            {text.slice(highlight.start, highlight.end)}
          </mark>
          {text.slice(highlight.end)}
        </>
      ) : (
        text
      )}
    </div>
  );
}
