const LINE_WIDTHS = ['100%', '88%', '60%'];

/**
 * Honest wait state. The analysis runs as one blocking server call, so the
 * client has no real progress to report — we describe the whole job instead of
 * faking per-step checkmarks, and the highlighter animation loops for the same
 * reason: its position means nothing.
 */
export function StatusSteps() {
  return (
    <div role="status">
      <div
        aria-hidden
        className="mb-6 w-full max-w-[184px] rounded-lg border border-rule bg-paper px-3.5 py-3"
      >
        <div className="space-y-2.5">
          {LINE_WIDTHS.map((width, i) => (
            <div
              key={i}
              className="relative h-2 overflow-hidden rounded-full bg-rule"
              style={{ width }}
            >
              <span
                className="ct-mark absolute inset-0 block rounded-full bg-marker"
                style={{ animationDelay: `${i * 500}ms` }}
              />
            </div>
          ))}
        </div>
      </div>

      <h3 className="font-serif text-[19px] leading-snug text-ink">
        Reading the letter, end to end.
      </h3>
      <p className="mt-2 max-w-[36ch] text-[13.5px] leading-relaxed text-ink-soft">
        Extracting each requirement and verifying every citation against the
        source before any of it reaches you.
      </p>

      <p className="mt-5 flex items-center gap-2 font-mono text-[11px] tracking-tight text-ink-faint">
        <span className="ct-pulse inline-block h-1.5 w-1.5 rounded-full bg-verified" />
        Usually around 1.5 - 2 minutes 
      </p>
    </div>
  );
}
