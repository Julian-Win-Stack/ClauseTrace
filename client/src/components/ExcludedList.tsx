import { useState } from 'react';
import type { Requirement } from '../types';
import { Badge } from './Badge';

export function ExcludedList({ items }: { items: Requirement[] }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <section className="overflow-hidden rounded-xl border border-flagged-line bg-flagged-soft/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-flagged-soft"
        aria-expanded={open}
      >
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-flagged">
          Excluded — failed verification ({items.length})
        </span>
        <span className="font-mono text-xs text-flagged">
          {open ? '– hide' : '+ show'}
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-flagged-line/70 px-4 py-4">
          <p className="text-[12.5px] leading-5 text-flagged">
            The model asserted these, but their cited quotes could not be found
            in the source text. They are shown for auditability and are never
            trusted. Any draft action items were discarded — unverified
            requirements never produce guidance.
          </p>
          {items.map((req) => (
            <div
              key={req.ordinal}
              className="rounded-lg border border-flagged-line bg-surface p-3"
            >
              <div className="mb-1.5">
                <Badge kind="excluded">Excluded · unverified</Badge>
              </div>
              <p className="mb-1 text-[13.5px] leading-6 text-ink-soft">
                {req.requirement_text}
              </p>
              {req.citations
                .filter((c) => !c.verified)
                .map((c, i) => (
                  <p
                    key={i}
                    className="font-mono text-[11.5px] leading-5 text-ink-faint"
                  >
                    claimed quote, not found in source: “{c.quote}”
                  </p>
                ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
