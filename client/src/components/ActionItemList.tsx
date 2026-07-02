import type { Requirement } from '../types';
import { Badge } from './Badge';

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

export function ActionItemList({ grounded }: { grounded: Requirement[] }) {
  const items = grounded
    .flatMap((req) =>
      req.action_items.map((item) => ({ item, ordinal: req.ordinal })),
    )
    .sort(
      (a, b) =>
        PRIORITY_ORDER[a.item.priority] - PRIORITY_ORDER[b.item.priority],
    );

  if (items.length === 0) return null;

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-700">
          Action-item checklist
        </h3>
        <Badge kind="generated">Generated · advisory</Badge>
      </div>
      <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-4">
        <ul className="space-y-2">
          {items.map(({ item, ordinal }, i) => (
            <li key={i} className="flex gap-2 text-sm leading-6 text-slate-700">
              <span
                className={`mt-1 shrink-0 rounded px-1.5 text-[11px] font-semibold uppercase ${
                  item.priority === 'high'
                    ? 'bg-rose-100 text-rose-700'
                    : item.priority === 'medium'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-slate-200 text-slate-600'
                }`}
              >
                {item.priority}
              </span>
              <span>
                {item.text}{' '}
                <span className="text-xs text-slate-500">
                  — {item.suggested_owner_department} · from requirement #
                  {ordinal}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
