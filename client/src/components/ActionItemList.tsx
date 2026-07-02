import type { Requirement } from '../types';
import { Badge } from './Badge';
import { SectionHeader } from './SectionHeader';

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
      <SectionHeader
        label="Action-item checklist"
        aside={<Badge kind="generated">Generated · advisory</Badge>}
      />
      <div className="rounded-xl border border-advisory-line/60 border-l-[3px] border-l-advisory bg-advisory-soft/40 p-4">
        <ul className="space-y-2.5">
          {items.map(({ item, ordinal }, i) => (
            <li
              key={i}
              className="flex gap-2.5 text-[13.5px] leading-6 text-ink-soft"
            >
              <span
                className={`mt-0.5 shrink-0 rounded font-mono text-[10px] font-semibold uppercase tracking-[0.06em] ${
                  item.priority === 'high'
                    ? 'bg-flagged-soft text-flagged'
                    : item.priority === 'medium'
                      ? 'bg-advisory-soft text-advisory'
                      : 'bg-rule-soft text-ink-faint'
                } px-1.5 py-0.5`}
              >
                {item.priority}
              </span>
              <span>
                {item.text}{' '}
                <span className="font-mono text-[11px] text-ink-faint">
                  — {item.suggested_owner_department} · req #{ordinal}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
