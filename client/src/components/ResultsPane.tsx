import type { Analysis, Requirement, Span } from '../types';
import { AbstainedList } from './AbstainedList';
import { ActionItemList } from './ActionItemList';
import { Badge } from './Badge';
import { ExcludedList } from './ExcludedList';
import { RequirementCard } from './RequirementCard';

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
    <div className="space-y-6">
      {analysis.summary && (
        <section>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-700">Summary</h3>
            <Badge kind="generated">Generated</Badge>
          </div>
          <p className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-4 text-sm leading-6 text-slate-700">
            {analysis.summary}
          </p>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">
          Requirements{' '}
          <span className="font-normal text-slate-400">
            ({grounded.length} grounded)
          </span>
        </h3>
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
          <p className="text-sm text-slate-500">
            No grounded requirements were extracted from this document.
          </p>
        )}
      </section>

      <AbstainedList items={abstained} />
      <ExcludedList items={excluded} />
      <ActionItemList grounded={grounded} />
    </div>
  );
}
