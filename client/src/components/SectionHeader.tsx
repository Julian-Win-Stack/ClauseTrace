export function SectionHeader({
  label,
  aside,
}: {
  label: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint">
        {label}
      </h3>
      <span className="h-px flex-1 bg-rule" />
      {aside && <div className="shrink-0">{aside}</div>}
    </div>
  );
}
