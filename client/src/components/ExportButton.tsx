import { useState } from 'react';
import type { Analysis } from '../types';

function buildMarkdown(title: string, analysis: Analysis): string {
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
    const verified = req.citations.filter((c) => c.verified);
    for (const citation of verified) {
      lines.push(`> “${citation.quote}”`, '');
    }
    const methodSummary = verified.some((c) => c.method === 'normalized')
      ? 'normalized'
      : 'exact';
    lines.push(
      `*Verified: ${methodSummary}* — Departments: ${
        req.impacted_departments.join(', ') || '—'
      }`,
      '',
    );
    if (req.faithfulness === 'needs_review' && req.faithfulness_reason) {
      lines.push(`> ⚠ Needs review: ${req.faithfulness_reason}`, '');
    }
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
  title,
  analysis,
}: {
  title: string;
  analysis: Analysis;
}) {
  const [copied, setCopied] = useState(false);
  const markdown = () => buildMarkdown(title, analysis);

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
    const slug =
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'analysis';
    a.download = `clausetrace-${slug}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={copy}
        className="rounded-lg border border-rule bg-surface px-3 py-1.5 text-[13px] text-ink-soft transition hover:border-ink-faint hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40"
      >
        {copied ? 'Copied ✓' : 'Copy checklist'}
      </button>
      <button
        type="button"
        onClick={download}
        className="rounded-lg border border-rule bg-surface px-3 py-1.5 text-[13px] text-ink-soft transition hover:border-ink-faint hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40"
      >
        Download .md
      </button>
    </div>
  );
}
