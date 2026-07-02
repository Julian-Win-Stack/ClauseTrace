const STYLES = {
  grounded: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  abstained: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  excluded: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  generated: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  neutral: 'bg-slate-50 text-slate-500 ring-slate-400/20',
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
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${STYLES[kind]}`}
    >
      {children}
    </span>
  );
}
