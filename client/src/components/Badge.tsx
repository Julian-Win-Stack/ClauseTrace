const STYLES = {
  grounded: 'bg-verified-soft text-verified ring-verified/20',
  abstained: 'bg-abstain-soft text-abstain ring-abstain/20',
  excluded: 'bg-flagged-soft text-flagged ring-flagged/20',
  generated: 'bg-advisory-soft text-advisory ring-advisory/20',
  neutral: 'bg-rule-soft text-ink-faint ring-ink-faint/20',
} as const;

export type BadgeKind = keyof typeof STYLES;

export function Badge({
  kind,
  children,
}: {
  kind: BadgeKind;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] ring-1 ring-inset ${STYLES[kind]} px-1.5 py-0.5`}
    >
      {children}
    </span>
  );
}
