import type { Requirement } from '../types';
import { Badge } from './Badge';

export function AbstainedList({ items }: { items: Requirement[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-slate-700">
        Not stated in source
      </h3>
      <div className="space-y-2">
        {items.map((req) => (
          <div
            key={req.ordinal}
            className="rounded-lg border border-slate-200 bg-slate-50 p-3"
          >
            <div className="mb-1.5">
              <Badge kind="abstained">Abstained · not stated</Badge>
            </div>
            <p className="text-sm leading-6 text-slate-600">
              {req.requirement_text}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
