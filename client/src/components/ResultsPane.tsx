import type { Analysis, Requirement, Span } from '../types';
import { AbstainedList } from './AbstainedList';
import { ActionItemList } from './ActionItemList';
import { Badge } from './Badge';
import { ExcludedList } from './ExcludedList';
import { RequirementCard } from './RequirementCard';
import { SectionHeader } from './SectionHeader';

function LedgerStat({
  count,
  label,
  color,
}: {
  count: number;
  label: string;
  color: string;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span className="font-mono text-[13px] font-semibold text-ink">
        {count}
      </span>
      <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-faint">
        {label}
      </span>
    </div>
  );
}

export function ResultsPane({
  analysis,
  onHighlight,
}: {
  analysis: Analysis;
  onHighlight: (span: Span) => void;
}) {
  const byStatus = (status: Requirement['status']) =>
    analysis.requirements.filter((r) => r.status === status);
  const grounded = byStatus('grounded');
  const abstained = byStatus('abstained');
  const excluded = byStatus('excluded');

  return (
    <div className="animate-rise space-y-7">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-rule bg-surface px-4 py-3">
        <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-faint">
          Trust ledger
        </span>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <LedgerStat
            count={grounded.length}
            label="grounded"
            color="bg-verified"
          />
          <LedgerStat
            count={abstained.length}
            label="abstained"
            color="bg-abstain"
          />
          <LedgerStat
            count={excluded.length}
            label="excluded"
            color="bg-flagged"
          />
        </div>
      </div>

      {analysis.summary && (
        <section>
          <SectionHeader
            label="Summary"
            aside={<Badge kind="generated">Generated</Badge>}
          />
          <p className="rounded-xl border border-advisory-line/60 border-l-[3px] border-l-advisory bg-advisory-soft/40 p-4 text-[14px] leading-6 text-ink-soft">
            {analysis.summary}
          </p>
        </section>
      )}

      <section>
        <SectionHeader
          label="Requirements"
          aside={
            <span className="font-mono text-[11px] text-ink-faint">
              {grounded.length} grounded
            </span>
          }
        />
        {grounded.length > 0 ? (
          <div className="space-y-3">
            {grounded.map((req) => (
              <RequirementCard
                key={req.ordinal}
                requirement={req}
                onHighlight={onHighlight}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-rule bg-surface px-4 py-6 text-center text-[13.5px] text-ink-faint">
            No grounded requirements were verified in this document.
          </p>
        )}
      </section>

      <AbstainedList items={abstained} />
      <ExcludedList items={excluded} />
      <ActionItemList grounded={grounded} />
    </div>
  );
}
