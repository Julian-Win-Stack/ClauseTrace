import { type ChangeEvent, useRef, useState } from 'react';
import { api } from './api';
import { ExportButton } from './components/ExportButton';
import { ResultsPane } from './components/ResultsPane';
import { SourcePane } from './components/SourcePane';
import { StatusSteps } from './components/StatusSteps';
import type { Analysis, Span } from './types';

interface Doc {
  title: string;
  text: string;
}

export default function App() {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [highlight, setHighlight] = useState<Span | null>(null);
  const [highlightAll, setHighlightAll] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPaste, setShowPaste] = useState(true);
  const [pasteText, setPasteText] = useState('');
  const [pasteTitle, setPasteTitle] = useState('');
  const [fromPdf, setFromPdf] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const analyze = async (target: Doc) => {
    if (running) return;
    setDoc(target);
    setAnalysis(null);
    setWarnings([]);
    setHighlight(null);
    setError(null);
    setRunning(true);
    try {
      const result = await api.analyze(target.text, target.title);
      setAnalysis(result);
      setWarnings(result.warnings);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  const submitPaste = async () => {
    const text = pasteText.trim();
    if (!text) return;
    setShowPaste(false);
    setFromPdf(false);
    await analyze({ title: pasteTitle.trim() || 'Pasted document', text });
  };

  // Extract + clean a PDF in the browser, then drop the result into the paste
  // box for review. The cleaned text is only analyzed once the user confirms
  // it — a lossy parse is never trusted on its own.
  const onPickPdf = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // let the same file be re-selected later
    if (!file) return;
    setError(null);
    setPdfBusy(true);
    try {
      // Load pdfjs on demand so its ~1.9 MB payload only ships when a PDF is
      // actually uploaded.
      const { cleanPdf } = await import('./lib/cleanPdf');
      const { text, aplNumber } = await cleanPdf(file);
      setPasteText(text);
      setPasteTitle(
        aplNumber ? `APL ${aplNumber}` : file.name.replace(/\.pdf$/i, ''),
      );
      setFromPdf(true);
      setShowPaste(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPdfBusy(false);
    }
  };

  const verifiedSpans: Span[] = analysis
    ? analysis.requirements.flatMap((r) =>
        r.citations
          .filter((c) => c.verified && c.start !== null && c.end !== null)
          .map((c) => ({ start: c.start as number, end: c.end as number })),
      )
    : [];

  return (
    <div className="flex h-screen flex-col bg-paper text-ink">
      <header className="flex items-center justify-between gap-4 border-b border-rule bg-surface px-6 py-3.5">
        <div className="flex items-center gap-3">
          <h1 className="font-serif text-[22px] font-semibold leading-none tracking-tight text-ink">
            ClauseTrace
          </h1>
          <span className="hidden h-4 w-px bg-rule sm:block" />
          <p className="hidden font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-faint sm:block">
            source-verified regulatory analysis
          </p>
        </div>
        {doc && analysis && (
          <ExportButton title={doc.title} analysis={analysis} />
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2.5 border-b border-rule bg-surface px-6 py-3">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-faint">
          Document
        </span>
        {doc && (
          <span className="max-w-md truncate text-[13px] text-ink">
            {doc.title}
          </span>
        )}
        <button
          type="button"
          onClick={() => setShowPaste((v) => !v)}
          className="rounded-lg border border-rule bg-surface px-3 py-1.5 text-[13px] text-ink-soft transition hover:border-ink-faint hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40"
        >
          Paste text…
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={(e) => void onPickPdf(e)}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={pdfBusy}
          className="rounded-lg border border-rule bg-surface px-3 py-1.5 text-[13px] text-ink-soft transition hover:border-ink-faint hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pdfBusy ? 'Reading PDF…' : 'Upload APL PDF…'}
        </button>
        {doc && (
          <button
            type="button"
            onClick={() => void analyze(doc)}
            disabled={running}
            className="rounded-lg bg-ink px-4 py-1.5 text-[13px] font-medium text-paper transition hover:bg-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running ? 'Analyzing…' : 'Re-analyze'}
          </button>
        )}
      </div>

      {showPaste && (
        <div className="border-b border-rule bg-surface px-6 py-4">
          {fromPdf && (
            <p className="mb-3 border-l-2 border-advisory-line bg-advisory-soft px-3 py-2 text-[12.5px] leading-5 text-advisory">
              Extracted from PDF — review and correct the text before analyzing.
              Cleaning a regulatory PDF is imperfect, and this text becomes the
              source of record grounding runs against.
            </p>
          )}
          <input
            value={pasteTitle}
            onChange={(e) => setPasteTitle(e.target.value)}
            placeholder="Title (optional)"
            className="mb-2 w-full max-w-md rounded-lg border border-rule bg-surface px-3 py-1.5 text-[13px] text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40"
          />
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste regulatory letter text here…"
            rows={8}
            className="mb-2 w-full rounded-lg border border-rule bg-surface px-3 py-2 font-mono text-[12px] leading-5 text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40"
          />
          <button
            type="button"
            onClick={() => void submitPaste()}
            disabled={!pasteText.trim() || running}
            className="rounded-lg bg-ink px-4 py-1.5 text-[13px] font-medium text-paper transition hover:bg-ink-soft disabled:opacity-40"
          >
            Analyze document
          </button>
        </div>
      )}

      {error && (
        <div className="border-b border-flagged-line bg-flagged-soft px-6 py-2 font-mono text-[12.5px] text-flagged">
          {error}
        </div>
      )}
      {warnings.map((w) => (
        <div
          key={w}
          className="border-b border-advisory-line bg-advisory-soft px-6 py-2 text-[13px] text-advisory"
        >
          {w}
        </div>
      ))}

      <main className="flex min-h-0 flex-1">
        <section className="w-1/2 overflow-y-auto border-r border-rule bg-surface">
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-rule-soft bg-surface/95 px-6 py-2 backdrop-blur">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-faint">
              Source · full_text
            </span>
            <div className="ml-auto flex items-center gap-3">
              {verifiedSpans.length > 0 && (
                <button
                  type="button"
                  onClick={() => setHighlightAll((v) => !v)}
                  aria-pressed={highlightAll}
                  className={`flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40 ${
                    highlightAll
                      ? 'text-verified'
                      : 'text-ink-faint hover:text-ink-soft'
                  }`}
                >
                  <span
                    className={`relative h-3.5 w-6 rounded-full transition ${
                      highlightAll ? 'bg-verified' : 'bg-rule'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-surface transition-all ${
                        highlightAll ? 'left-3' : 'left-0.5'
                      }`}
                    />
                  </span>
                  Highlight quotes
                </button>
              )}
              {doc && (
                <span className="font-mono text-[10.5px] text-ink-faint">
                  {doc.text.length.toLocaleString()} chars
                </span>
              )}
            </div>
          </div>
          <div className="p-6">
            {doc ? (
              <SourcePane
                text={doc.text}
                spans={highlightAll ? verifiedSpans : []}
                highlight={highlight}
              />
            ) : (
              <p className="mt-16 text-center font-mono text-[12.5px] leading-6 text-ink-faint">
                {
                  'No document yet — paste its text above,\nor upload an APL PDF.'
                }
              </p>
            )}
          </div>
        </section>
        <section className="w-1/2 overflow-y-auto p-6">
          {running ? (
            <div className="animate-rise rounded-xl border border-rule bg-surface p-6">
              <div className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint">
                Analyzing
              </div>
              <StatusSteps />
            </div>
          ) : analysis ? (
            <ResultsPane analysis={analysis} onHighlight={setHighlight} />
          ) : null}
        </section>
      </main>
    </div>
  );
}
