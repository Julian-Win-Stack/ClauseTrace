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
    <ol className="space-y-2">
      {STAGES.map((stage, i) => (
        <li key={stage} className="flex items-center gap-2 text-sm">
          {i < current ? (
            <span className="text-emerald-600">✓</span>
          ) : i === current ? (
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
          ) : (
            <span className="inline-block h-3 w-3 rounded-full border-2 border-slate-200" />
          )}
          <span className={i <= current ? 'text-slate-800' : 'text-slate-400'}>
            {stage}
          </span>
        </li>
      ))}
    </ol>
  );
}
