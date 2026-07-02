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

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">
            ClauseTrace
          </h1>
          <p className="text-sm text-slate-500">
            source-verified regulatory breakdowns
          </p>
        </div>
        {detail && analysis && (
          <ExportButton apl={detail.apl} analysis={analysis} />
        )}
      </header>

      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-6 py-3">
        <select
          value={selectedId ?? ''}
          onChange={(e) =>
            select(e.target.value ? Number(e.target.value) : null)
          }
          className="max-w-md rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800"
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
          className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {running ? 'Analyzing…' : detail?.analysis ? 'Re-analyze' : 'Analyze'}
        </button>
        <button
          type="button"
          onClick={() => setShowPaste((v) => !v)}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
        >
          Paste text…
        </button>
        {detail?.apl.is_adhoc && (
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
            Pasted document
          </span>
        )}
      </div>

      {showPaste && (
        <div className="border-b border-slate-200 bg-white px-6 py-4">
          <input
            value={pasteTitle}
            onChange={(e) => setPasteTitle(e.target.value)}
            placeholder="Title (optional)"
            className="mb-2 w-full max-w-md rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste regulatory letter text here…"
            rows={8}
            className="mb-2 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
          />
          <button
            type="button"
            onClick={() => void submitPaste()}
            disabled={!pasteText.trim()}
            className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-40"
          >
            Add document
          </button>
        </div>
      )}

      {error && (
        <div className="border-b border-rose-200 bg-rose-50 px-6 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}
      {warnings.map((w) => (
        <div
          key={w}
          className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-800"
        >
          {w}
        </div>
      ))}

      <main className="flex min-h-0 flex-1">
        <section className="w-1/2 overflow-y-auto border-r border-slate-200 bg-white p-6">
          {detail ? (
            <SourcePane text={detail.apl.full_text} highlight={highlight} />
          ) : (
            <p className="text-sm text-slate-400">
              {apls.length === 0
                ? 'No documents yet — paste one above, or seed APLs with `npm run db:seed`.'
                : 'Select a document to view its text.'}
            </p>
          )}
        </section>
        <section className="w-1/2 overflow-y-auto p-6">
          {running ? (
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <h3 className="mb-3 text-sm font-semibold text-slate-700">
                Analyzing…
              </h3>
              <StatusSteps />
            </div>
          ) : analysis ? (
            <ResultsPane analysis={analysis} onHighlight={setHighlight} />
          ) : detail ? (
            <p className="text-sm text-slate-400">
              Not analyzed yet — click <b>Analyze</b>.
            </p>
          ) : null}
        </section>
      </main>
    </div>
  );
}
