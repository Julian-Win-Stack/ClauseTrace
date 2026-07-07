import type { KeyItem, MatchResult, Span } from './types.js';

export interface ReportInput {
  aplNumber: string;
  title: string;
  fullText: string;
  result: MatchResult;
  unresolved: KeyItem[];
  baseUrl: string;
  generatedAt: string;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface Mark extends Span {
  kind: 'missed' | 'extra';
}

/**
 * Render full_text with missed spans (red) and extra spans (blue) highlighted
 * in place. These two kinds can never overlap each other: if a missed key item
 * and an extra grounded requirement shared a location, the matcher would have
 * paired them. So a simple boundary sweep — where each segment is covered by at
 * most one colour — is enough, and same-colour overlaps just merge.
 */
function renderDocument(fullText: string, marks: Mark[]): string {
  const points = new Set<number>([0, fullText.length]);
  for (const m of marks) {
    points.add(Math.max(0, m.start));
    points.add(Math.min(fullText.length, m.end));
  }
  const bounds = [...points].sort((a, b) => a - b);

  let html = '';
  for (let i = 0; i < bounds.length - 1; i++) {
    const a = bounds[i] as number;
    const b = bounds[i + 1] as number;
    if (a >= b) continue;
    const text = esc(fullText.slice(a, b));
    const cover = marks.find((m) => m.start <= a && m.end >= b);
    if (cover) {
      html += `<mark id="off-${a}" class="hl ${cover.kind}">${text}</mark>`;
    } else {
      html += text;
    }
  }
  return html;
}

function chip(label: string, count: number, cls: string): string {
  return `<span class="chip ${cls}"><b>${count}</b> ${label}</span>`;
}

export function renderReport(input: ReportInput): string {
  const { result, fullText } = input;
  const keyTotal =
    result.found.length + result.missed.length + result.excluded.length;
  const recall =
    keyTotal > 0 ? Math.round((result.found.length / keyTotal) * 100) : null;

  const marks: Mark[] = [
    ...result.missed.map((k): Mark => ({
      start: k.start,
      end: k.end,
      kind: 'missed',
    })),
    ...result.excluded.map((m): Mark => ({
      start: m.key.start,
      end: m.key.end,
      kind: 'missed',
    })),
    ...result.extra.flatMap((r) =>
      r.spans.map((s): Mark => ({ start: s.start, end: s.end, kind: 'extra' })),
    ),
  ];

  const extraList = result.extra
    .slice()
    .sort((a, b) => (a.spans[0]?.start ?? 0) - (b.spans[0]?.start ?? 0))
    .map((r) => {
      const start = r.spans[0]?.start ?? 0;
      const quotes = r.spans
        .map(
          (s) =>
            `<span class="q">${esc(fullText.slice(s.start, s.end))}</span>`,
        )
        .join('');
      return `<li class="jump" onclick="jump(${start})"><span class="reqtext">${esc(r.text)}</span>${quotes}</li>`;
    })
    .join('');

  const foundList = result.found
    .slice()
    .sort((a, b) => a.key.start - b.key.start)
    .map((f) => {
      const thin =
        f.overlapRatio < 0.3
          ? ' <span class="warn" title="thin overlap — eyeball this match">⚠ thin</span>'
          : '';
      return `<li><span class="id">${esc(f.key.id)}</span><span class="q">${esc(f.key.quote)}</span><span class="arrow">↔ app: ${esc(f.req.text)}</span>${thin}</li>`;
    })
    .join('');

  const excludedList = result.excluded
    .slice()
    .sort((a, b) => a.key.start - b.key.start)
    .map((m) => {
      const reqs = m.reqs
        .map((r) => `<span class="reqtext">${esc(r.text)}</span>`)
        .join('');
      return `<li><span class="id">${esc(m.key.id)}</span><span class="q">${esc(m.key.quote)}</span>${reqs}</li>`;
    })
    .join('');

  const unresolvedBanner =
    input.unresolved.length > 0
      ? `<div class="banner">⚠ ${input.unresolved.length} key quote(s) were not found in full_text and are NOT graded (bad copy, or lifted from the PDF). Fix these:<ul>${input.unresolved
          .map(
            (u) =>
              `<li><span class="id">${esc(u.id)}</span><span class="q">${esc(u.quote)}</span></li>`,
          )
          .join('')}</ul></div>`
      : '';

  const section = (
    title: string,
    cls: string,
    count: number,
    body: string,
    empty: string,
  ): string =>
    `<section class="bucket"><h2 class="${cls}">${title} <span class="n">${count}</span></h2><ul>${count > 0 ? body : `<li class="none">${empty}</li>`}</ul></section>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Recall eval — APL ${esc(input.aplNumber)}</title>
<style>
  :root {
    --missed: #e5484d; --missed-bg: #ffeaea;
    --extra: #0b6bcb; --extra-bg: #e6f1fd;
    --found: #2f9e44; --excluded: #e08a00;
    --ink: #1a1a1a; --muted: #6b7280; --line: #e5e7eb; --bg: #f7f7f8;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  header { padding: 24px 28px 12px; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  .sub { color: var(--muted); font-size: 13px; margin-bottom: 14px; }
  .score { font-size: 40px; font-weight: 700; letter-spacing: -0.5px; }
  .score small { font-size: 16px; font-weight: 500; color: var(--muted); }
  .chips { margin: 10px 0 4px; display: flex; gap: 8px; flex-wrap: wrap; }
  .chip { padding: 4px 10px; border-radius: 999px; font-size: 13px; background: #fff; border: 1px solid var(--line); }
  .chip b { font-weight: 700; }
  .chip.c-found b { color: var(--found); }
  .chip.c-missed b { color: var(--missed); }
  .chip.c-excluded b { color: var(--excluded); }
  .chip.c-extra b { color: var(--extra); }
  .legend { color: var(--muted); font-size: 12.5px; margin-top: 6px; }
  .legend .sw { display: inline-block; width: 11px; height: 11px; border-radius: 3px; vertical-align: -1px; margin: 0 3px 0 10px; }
  .legend .sw.m { background: var(--missed-bg); border: 1px solid var(--missed); }
  .legend .sw.x { background: var(--extra-bg); border: 1px solid var(--extra); }
  .banner { margin: 8px 28px; padding: 12px 14px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; font-size: 13.5px; }
  .banner ul { margin: 8px 0 0; padding-left: 4px; list-style: none; }
  main { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; padding: 12px 28px 40px; align-items: start; }
  @media (max-width: 900px) { main { grid-template-columns: 1fr; } .doc { position: static !important; max-height: none !important; } }
  .bucket { background: #fff; border: 1px solid var(--line); border-radius: 10px; margin-bottom: 16px; overflow: hidden; }
  .bucket h2 { font-size: 14px; margin: 0; padding: 12px 14px; border-bottom: 1px solid var(--line); display: flex; align-items: center; gap: 8px; }
  .bucket h2 .n { margin-left: auto; color: var(--muted); font-weight: 600; }
  .bucket h2.c-missed { color: var(--missed); }
  .bucket h2.c-extra { color: var(--extra); }
  .bucket h2.c-found { color: var(--found); }
  .bucket h2.c-excluded { color: var(--excluded); }
  .bucket ul { list-style: none; margin: 0; padding: 0; }
  .bucket li { padding: 10px 14px; border-bottom: 1px solid #f1f1f3; font-size: 13.5px; }
  .bucket li:last-child { border-bottom: 0; }
  .bucket li.jump { cursor: pointer; }
  .bucket li.jump:hover { background: #fafafe; }
  .bucket li.none { color: var(--muted); font-style: italic; }
  .id { display: inline-block; font-weight: 700; font-size: 12px; color: var(--muted); margin-right: 8px; }
  .q { display: block; margin-top: 3px; color: #333; }
  .q::before { content: "“"; color: var(--muted); }
  .q::after { content: "”"; color: var(--muted); }
  .reqtext { display: block; font-weight: 600; }
  .arrow { display: block; margin-top: 4px; color: var(--muted); font-size: 12.5px; }
  .warn { color: var(--excluded); font-size: 12px; font-weight: 600; }
  .doc { position: sticky; top: 12px; max-height: calc(100vh - 24px); overflow: auto; background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 18px 20px; white-space: pre-wrap; word-wrap: break-word; font-size: 13.5px; line-height: 1.65; }
  .hl { border-radius: 2px; padding: 0 1px; }
  .hl.missed { background: var(--missed-bg); box-shadow: inset 0 -2px 0 var(--missed); }
  .hl.extra { background: var(--extra-bg); box-shadow: inset 0 -2px 0 var(--extra); }
  .hl.flash { animation: flash 1.4s ease; }
  @keyframes flash { 0%, 40% { background: #fff3a3; } 100% {} }
</style>
</head>
<body>
<header>
  <h1>Recall eval — APL ${esc(input.aplNumber)}: ${esc(input.title)}</h1>
  <div class="sub">grades by document position, not wording · fresh analysis · ${esc(input.baseUrl)} · ${esc(input.generatedAt)}</div>
  <div class="score">${result.found.length} <small>/ ${keyTotal} found</small> ${recall !== null ? `<small>· ${recall}% recall</small>` : ''}</div>
  <div class="chips">
    ${chip('found', result.found.length, 'c-found')}
    ${chip('missed', result.missed.length, 'c-missed')}
    ${chip('excluded', result.excluded.length, 'c-excluded')}
    ${chip('extra (not in key)', result.extra.length, 'c-extra')}
  </div>
  <div class="legend">In the document →<span class="sw m"></span>not found by the app (missed or excluded)<span class="sw x"></span>extra (app produced it, not in your key). Matches are in the Found list.</div>
</header>
${unresolvedBanner}
<main>
  <div class="col">
    ${section('Missed — recall gaps', 'c-missed', result.missed.length, result.missed.map((k) => `<li class="jump" onclick="jump(${k.start})"><span class="id">${esc(k.id)}</span><span class="q">${esc(k.quote)}</span></li>`).join(''), 'nothing missed 🎉')}
    ${section('Extra — app found, not in key', 'c-extra', result.extra.length, extraList, 'none')}
    ${section('Excluded — app saw it, grounding rejected', 'c-excluded', result.excluded.length, excludedList, 'none')}
    ${section('Found', 'c-found', result.found.length, foundList, 'none')}
  </div>
  <div class="doc" id="doc">${renderDocument(fullText, marks)}</div>
</main>
<script>
  function jump(off) {
    var el = document.getElementById('off-' + off);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }
</script>
</body>
</html>`;
}
