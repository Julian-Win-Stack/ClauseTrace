import { useState } from 'react';
import type { Requirement } from '../types';
import { Badge } from './Badge';

export function ExcludedList({ items }: { items: Requirement[] }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <section className="rounded-lg border border-rose-200 bg-rose-50/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-rose-800">
          Excluded — failed verification ({items.length})
        </span>
        <span className="text-rose-600">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="space-y-3 px-4 pb-4">
          <p className="text-xs leading-5 text-rose-700">
            The model asserted these, but their cited quotes could not be found
            in the source text. They are shown for auditability and are never
            trusted. Any draft action items for them were discarded — unverified
            requirements never produce guidance.
          </p>
          {items.map((req) => (
            <div
              key={req.ordinal}
              className="rounded-md border border-rose-200 bg-white p-3"
            >
              <div className="mb-1.5">
                <Badge kind="excluded">Excluded · unverified</Badge>
              </div>
              <p className="mb-1 text-sm leading-6 text-slate-700">
                {req.requirement_text}
              </p>
              {req.source_quote && (
                <p className="text-xs leading-5 text-slate-500">
                  Claimed quote (not found in source): “{req.source_quote}”
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
