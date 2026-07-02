import type { Requirement } from '../types';
import { Badge } from './Badge';
import { SectionHeader } from './SectionHeader';

export function AbstainedList({ items }: { items: Requirement[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <SectionHeader label="Not stated in source" />
      <p className="mb-3 text-[13px] leading-5 text-ink-faint">
        The model was asked and honestly declined — the source does not state
        these. Shown as non-answers, never as requirements.
      </p>
      <div className="space-y-2">
        {items.map((req) => (
          <div
            key={req.ordinal}
            className="rounded-lg border border-rule border-l-[3px] border-l-abstain bg-abstain-soft/50 p-3"
          >
            <div className="mb-1.5">
              <Badge kind="abstained">Abstained · not stated</Badge>
            </div>
            <p className="text-[13.5px] leading-6 text-ink-soft">
              {req.requirement_text}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
