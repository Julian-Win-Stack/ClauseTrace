import type { Requirement, Span } from '../types';
import { Badge } from './Badge';

export function RequirementCard({
  requirement,
  onHighlight,
}: {
  requirement: Requirement;
  onHighlight: (span: Span) => void;
}) {
  const { source_start_offset: start, source_end_offset: end } = requirement;
  const clickable = start !== null && end !== null;
  const score =
    requirement.verification_method === 'fuzzy' &&
    requirement.match_score !== null
      ? ` · ${Math.round(requirement.match_score * 100)}%`
      : '';

  return (
    <article
      className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${
        clickable
          ? 'cursor-pointer transition hover:border-emerald-300 hover:shadow'
          : ''
      }`}
      onClick={() => {
        if (clickable)
          onHighlight({ start: start as number, end: end as number });
      }}
      title={clickable ? 'Click to highlight the source passage' : undefined}
    >
      <div className="mb-2 flex items-center gap-2">
        <Badge kind="grounded">
          Grounded · {requirement.verification_method}
          {score}
        </Badge>
        <span className="text-xs text-slate-400">#{requirement.ordinal}</span>
      </div>
      <p className="mb-2 text-sm font-medium leading-6 text-slate-900">
        {requirement.requirement_text}
      </p>
      {requirement.source_quote && (
        <blockquote className="mb-3 border-l-2 border-emerald-300 pl-3 font-serif text-sm italic leading-6 text-slate-600">
          “{requirement.source_quote}”
        </blockquote>
      )}
      {requirement.impacted_departments.length > 0 && (
        <div className="mb-1 flex flex-wrap gap-1.5">
          {requirement.impacted_departments.map((dept) => (
            <span
              key={dept}
              className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
            >
              {dept}
            </span>
          ))}
        </div>
      )}
      {requirement.action_items.length > 0 && (
        <div className="mt-3 rounded-md bg-indigo-50/60 p-3">
          <div className="mb-1.5">
            <Badge kind="generated">Generated · advisory</Badge>
          </div>
          <ul className="space-y-1">
            {requirement.action_items.map((item, i) => (
              <li
                key={i}
                className="flex gap-2 text-sm leading-6 text-slate-700"
              >
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    item.priority === 'high'
                      ? 'bg-rose-500'
                      : item.priority === 'medium'
                        ? 'bg-amber-500'
                        : 'bg-slate-400'
                  }`}
                  title={`${item.priority} priority`}
                />
                <span>
                  {item.text}{' '}
                  <span className="text-xs text-slate-500">
                    — {item.suggested_owner_department}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
