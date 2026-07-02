import type { Requirement, Span } from '../types';

export function RequirementCard({
  requirement,
  onHighlight,
}: {
  requirement: Requirement;
  onHighlight: (span: Span) => void;
}) {
  const { source_start_offset: start, source_end_offset: end } = requirement;
  const clickable = start !== null && end !== null;

  // The verification stamp makes the deterministic check visible — the product's
  // whole thesis is that code, not the model, decided this quote is real.
  const stamp =
    requirement.verification_method === 'normalized'
      ? 'normalized match'
      : 'exact match';
  const offsets = clickable ? `offset ${start}–${end}` : null;

  return (
    <article
      className={`group relative overflow-hidden rounded-xl border border-rule border-l-[3px] border-l-verified bg-surface p-4 shadow-[0_1px_2px_rgba(22,34,59,0.04)] transition ${
        clickable
          ? 'cursor-pointer hover:-translate-y-px hover:shadow-[0_6px_16px_-8px_rgba(15,122,92,0.35)]'
          : ''
      }`}
      onClick={() => {
        if (clickable)
          onHighlight({ start: start as number, end: end as number });
      }}
      title={
        clickable ? 'Click to trace this to the source passage' : undefined
      }
    >
      <div className="mb-2.5 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-verified">
          <svg
            viewBox="0 0 12 12"
            className="h-3 w-3"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="6"
              cy="6"
              r="5.25"
              stroke="currentColor"
              strokeWidth="1"
            />
            <path
              d="M3.5 6.1 5.2 7.8 8.5 4.3"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Verified
        </span>
        <span className="font-mono text-[10.5px] text-ink-faint">
          {stamp}
          {offsets ? ` · ${offsets}` : ''}
        </span>
        <span className="ml-auto font-mono text-[10.5px] text-ink-faint">
          REQ {String(requirement.ordinal).padStart(2, '0')}
        </span>
      </div>

      <p className="text-[15px] font-medium leading-6 text-ink">
        {requirement.requirement_text}
      </p>

      {requirement.source_quote && (
        <blockquote className="mt-2.5 border-l-2 border-verified-line pl-3">
          <span className="font-serif text-[14.5px] italic leading-6 text-ink-soft">
            “{requirement.source_quote}”
          </span>
        </blockquote>
      )}

      {requirement.impacted_departments.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {requirement.impacted_departments.map((dept) => (
            <span
              key={dept}
              className="rounded-full border border-rule bg-paper px-2 py-0.5 text-[11.5px] text-ink-soft"
            >
              {dept}
            </span>
          ))}
        </div>
      )}

      {requirement.action_items.length > 0 && (
        <div className="mt-3 rounded-lg border border-advisory-line/60 bg-advisory-soft/50 p-3">
          <div className="mb-2 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-advisory">
            Draft action items · advisory
          </div>
          <ul className="space-y-1.5">
            {requirement.action_items.map((item, i) => (
              <li
                key={i}
                className="flex gap-2 text-[13.5px] leading-6 text-ink-soft"
              >
                <span
                  className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${
                    item.priority === 'high'
                      ? 'bg-flagged'
                      : item.priority === 'medium'
                        ? 'bg-advisory'
                        : 'bg-ink-faint'
                  }`}
                  title={`${item.priority} priority`}
                />
                <span>
                  {item.text}{' '}
                  <span className="text-ink-faint">
                    — {item.suggested_owner_department}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {clickable && (
        <div className="mt-3 font-mono text-[10.5px] text-ink-faint opacity-0 transition group-hover:opacity-100">
          → trace to source
        </div>
      )}
    </article>
  );
}
