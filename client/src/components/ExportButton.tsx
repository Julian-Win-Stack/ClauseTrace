import { useState } from 'react';
import type { Analysis, Apl } from '../types';

function buildMarkdown(apl: Apl, analysis: Analysis): string {
  const title = apl.apl_number
    ? `APL ${apl.apl_number}: ${apl.title}`
    : apl.title;
  const grounded = analysis.requirements.filter((r) => r.status === 'grounded');
  const lines: string[] = [
    `# ClauseTrace checklist — ${title}`,
    '',
    '> Grounded requirements are source-verified citations. Action items are',
    '> AI-generated advisory guidance, not claims about the source.',
    '',
    '## Grounded requirements (source-verified)',
    '',
  ];
  for (const req of grounded) {
    lines.push(`### ${req.ordinal}. ${req.requirement_text}`, '');
    if (req.source_quote) {
      lines.push(`> “${req.source_quote}”`, '');
    }
    lines.push(
      `*Verified: ${req.verification_method}* — Departments: ${
        req.impacted_departments.join(', ') || '—'
      }`,
      '',
    );
    if (req.action_items.length > 0) {
      lines.push('**Action items (generated / advisory):**', '');
      for (const item of req.action_items) {
        lines.push(
          `- [ ] (${item.priority}) ${item.text} — ${item.suggested_owner_department}`,
        );
      }
      lines.push('');
    }
  }
  if (grounded.length === 0) {
    lines.push('_No grounded requirements._', '');
  }
  return lines.join('\n');
}

export function ExportButton({
  apl,
  analysis,
}: {
  apl: Apl;
  analysis: Analysis;
}) {
  const [copied, setCopied] = useState(false);
  const markdown = () => buildMarkdown(apl, analysis);

  const copy = async () => {
    await navigator.clipboard.writeText(markdown());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const download = () => {
    const blob = new Blob([markdown()], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clausetrace-${apl.apl_number ?? apl.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={copy}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
      >
        {copied ? 'Copied ✓' : 'Copy checklist'}
      </button>
      <button
        type="button"
        onClick={download}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
      >
        Download .md
      </button>
    </div>
  );
}
