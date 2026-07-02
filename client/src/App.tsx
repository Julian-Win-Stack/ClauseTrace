import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { ExportButton } from './components/ExportButton';
import { ResultsPane } from './components/ResultsPane';
import { SourcePane } from './components/SourcePane';
import { StatusSteps } from './components/StatusSteps';
import type { Analysis, AplDetail, AplListItem, Span } from './types';

function idFromUrl(): number | null {
  const raw = new URLSearchParams(window.location.search).get('apl');
  const id = Number(raw);
  return raw !== null && Number.isInteger(id) && id > 0 ? id : null;
}

export default function App() {
  const [apls, setApls] = useState<AplListItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(idFromUrl);
  const [detail, setDetail] = useState<AplDetail | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [highlight, setHighlight] = useState<Span | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteTitle, setPasteTitle] = useState('');

  const refreshList = useCallback(async () => {
    try {
      setApls(await api.listApls());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  // Keep selection in sync with the URL so an analysis link is shareable.
  useEffect(() => {
    const onPopState = () => setSelectedId(idFromUrl());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const select = (id: number | null) => {
    setSelectedId(id);
    const url = id === null ? window.location.pathname : `?apl=${id}`;
    window.history.pushState(null, '', url);
  };

  useEffect(() => {
    setDetail(null);
    setAnalysis(null);
    setWarnings([]);
    setHighlight(null);
    setError(null);
    if (selectedId === null) return;
    let cancelled = false;
    api
      .getApl(selectedId)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setAnalysis(d.analysis);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const analyze = async () => {
    if (selectedId === null || running) return;
    setRunning(true);
    setError(null);
    setWarnings([]);
    setHighlight(null);
    try {
      const result = await api.analyze(selectedId);
      setAnalysis(result);
      setWarnings(result.warnings);
      setApls((list) =>
        list.map((a) => (a.id === selectedId ? { ...a, analyzed: true } : a)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  const submitPaste = async () => {
    const text = pasteText.trim();
    if (!text) return;
    setError(null);
    try {
      const { id } = await api.createApl(text, pasteTitle.trim() || undefined);
      setPasteText('');
      setPasteTitle('');
      setShowPaste(false);
      await refreshList();
      select(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const optionLabel = (a: AplListItem) => {
    const prefix = a.is_adhoc
      ? '[Pasted] '
      : a.apl_number
        ? `APL ${a.apl_number} — `
        : '';
    return `${prefix}${a.title}${a.analyzed ? ' ✓' : ''}`;
  };

  const analyzeLabel = running
    ? 'Analyzing…'
    : detail?.analysis
      ? 'Re-analyze'
      : 'Analyze';

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
        {detail && analysis && (
          <ExportButton apl={detail.apl} analysis={analysis} />
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2.5 border-b border-rule bg-surface px-6 py-3">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-faint">
          Document
        </span>
        <select
          value={selectedId ?? ''}
          onChange={(e) =>
            select(e.target.value ? Number(e.target.value) : null)
          }
          className="max-w-md rounded-lg border border-rule bg-surface px-3 py-1.5 text-[13px] text-ink transition hover:border-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40"
        >
          <option value="">Select a document…</option>
          {apls.map((a) => (
            <option key={a.id} value={a.id}>
              {optionLabel(a)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void analyze()}
          disabled={selectedId === null || running}
          className="rounded-lg bg-ink px-4 py-1.5 text-[13px] font-medium text-paper transition hover:bg-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {analyzeLabel}
        </button>
        <button
          type="button"
          onClick={() => setShowPaste((v) => !v)}
          className="rounded-lg border border-rule bg-surface px-3 py-1.5 text-[13px] text-ink-soft transition hover:border-ink-faint hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40"
        >
          Paste text…
        </button>
        {detail?.apl.is_adhoc && (
          <span className="rounded border border-rule bg-paper px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-faint">
            Pasted
          </span>
        )}
      </div>

      {showPaste && (
        <div className="border-b border-rule bg-surface px-6 py-4">
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
            disabled={!pasteText.trim()}
            className="rounded-lg bg-ink px-4 py-1.5 text-[13px] font-medium text-paper transition hover:bg-ink-soft disabled:opacity-40"
          >
            Add document
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
            {detail && (
              <span className="ml-auto font-mono text-[10.5px] text-ink-faint">
                {detail.apl.char_length.toLocaleString()} chars
              </span>
            )}
          </div>
          <div className="p-6">
            {detail ? (
              <SourcePane text={detail.apl.full_text} highlight={highlight} />
            ) : (
              <p className="mt-16 text-center font-mono text-[12.5px] leading-6 text-ink-faint">
                {apls.length === 0
                  ? 'No documents yet — paste one above,\nor seed APLs with `npm run db:seed`.'
                  : 'Select a document to view its text.'}
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
          ) : detail ? (
            <p className="mt-16 text-center text-[13.5px] text-ink-faint">
              Not analyzed yet — click{' '}
              <span className="font-medium text-ink-soft">Analyze</span>.
            </p>
          ) : null}
        </section>
      </main>
    </div>
  );
}
