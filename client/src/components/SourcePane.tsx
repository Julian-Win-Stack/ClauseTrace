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
    <div className="whitespace-pre-wrap font-serif text-[15px] leading-7 text-slate-800">
      {highlight ? (
        <>
          {text.slice(0, highlight.start)}
          <mark
            ref={markRef}
            className="rounded-sm bg-amber-200 px-0.5 py-0.5 ring-1 ring-amber-400"
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
