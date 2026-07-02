import { useEffect, useState } from 'react';

const STAGES = [
  'Summarizing',
  'Extracting requirements',
  'Verifying citations',
  'Classifying departments',
  'Drafting action items',
];

/**
 * Cosmetic progress: the pipeline runs as one server call, so the steps
 * advance on a timer and settle on the last one until the response lands.
 */
export function StatusSteps() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setCurrent((c) => Math.min(c + 1, STAGES.length - 1)),
      2500,
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <ol className="space-y-2.5">
      {STAGES.map((stage, i) => (
        <li key={stage} className="flex items-center gap-2.5">
          {i < current ? (
            <span className="text-verified">
              <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" fill="none">
                <path
                  d="M2.5 6.2 5 8.6 9.6 3.4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          ) : i === current ? (
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-rule border-t-ink" />
          ) : (
            <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-rule-soft" />
          )}
          <span
            className={`font-mono text-[12.5px] tracking-tight ${
              i < current
                ? 'text-ink-soft'
                : i === current
                  ? 'text-ink'
                  : 'text-ink-faint'
            }`}
          >
            {stage}
          </span>
        </li>
      ))}
    </ol>
  );
}
