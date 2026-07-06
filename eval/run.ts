import { readdirSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { match } from './lib/match.js';
import { parseKey } from './lib/parseKey.js';
import { renderReport } from './lib/report.js';
import { resolveKey } from './lib/resolveKey.js';
import type { AppRequirement, AppStatus } from './lib/types.js';

const here = path.dirname(fileURLToPath(import.meta.url));

interface Args {
  aplNumber: string;
  base: string;
  analyze: boolean;
  keyPath: string;
  outPath: string;
}

/**
 * Accept a full apl_number ("24-006") or just its numeric tail ("006"). The
 * short form expands to the single answer key in eval/keys/ ending in it, so
 * the year never has to be typed and the command doesn't go stale across years.
 */
function resolveAplNumber(input: string): string {
  if (/^\d{2}-\d{3}$/.test(input)) return input;
  const stems = readdirSync(path.join(here, 'keys'))
    .filter((f) => f.endsWith('.csv'))
    .map((f) => f.slice(0, -'.csv'.length));
  const matches = stems.filter(
    (stem) => stem === input || stem.split('-').pop() === input,
  );
  if (matches.length > 1) {
    throw new Error(
      `"${input}" is ambiguous across ${matches.join(', ')} — pass the full apl_number`,
    );
  }
  const [only] = matches;
  if (!only) {
    throw new Error(
      `no answer key matches "${input}" — expected eval/keys/<year>-${input}.csv (have: ${stems.join(', ') || 'none'})`,
    );
  }
  return only;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  let base = process.env.EVAL_BASE_URL ?? 'http://localhost:3000';
  let analyze = false;
  let keyPath: string | undefined;
  let outPath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a === '--analyze') analyze = true;
    else if (a === '--base') base = argv[++i] ?? base;
    else if (a === '--key') keyPath = argv[++i];
    else if (a === '--out') outPath = argv[++i];
    else if (a.startsWith('--')) throw new Error(`unknown flag: ${a}`);
    else positional.push(a);
  }

  const input = positional[0];
  if (!input) {
    throw new Error(
      'usage: npm run eval <apl_number> [--base <url>] [--analyze] [--key <path>] [--out <path>]',
    );
  }
  const aplNumber = resolveAplNumber(input);
  return {
    aplNumber,
    base: base.replace(/\/+$/, ''),
    analyze,
    keyPath: keyPath ?? path.join(here, 'keys', `${aplNumber}.csv`),
    outPath: outPath ?? path.join(here, 'out', `${aplNumber}.html`),
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(body) && typeof body.error === 'string'
        ? body.error
        : `HTTP ${res.status}`;
    throw new Error(`GET ${url} failed: ${msg}`);
  }
  return body;
}

async function postJson(url: string, payload: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(body) && typeof body.error === 'string'
        ? body.error
        : `HTTP ${res.status}`;
    throw new Error(`POST ${url} failed: ${msg}`);
  }
  return body;
}

/** Resolve an apl_number to its numeric id on the target instance. */
async function resolveAplId(base: string, aplNumber: string): Promise<number> {
  const list = await getJson(`${base}/api/apls`);
  if (!Array.isArray(list))
    throw new Error('GET /api/apls did not return a list');
  for (const row of list) {
    if (
      isRecord(row) &&
      row.apl_number === aplNumber &&
      typeof row.id === 'number'
    ) {
      return row.id;
    }
  }
  throw new Error(
    `APL "${aplNumber}" not found on ${base}. Seed it there first (it must exist in that instance's DB).`,
  );
}

const STATUSES: readonly AppStatus[] = ['grounded', 'abstained', 'excluded'];

function toAppRequirements(analysis: unknown): AppRequirement[] {
  if (!isRecord(analysis)) return [];
  const reqs = analysis.requirements;
  if (!Array.isArray(reqs)) return [];

  const out: AppRequirement[] = [];
  for (const r of reqs) {
    if (!isRecord(r)) continue;
    const status = r.status;
    if (typeof status !== 'string' || !STATUSES.includes(status as AppStatus)) {
      continue;
    }
    const spans: AppRequirement['spans'] = [];
    if (Array.isArray(r.citations)) {
      for (const c of r.citations) {
        if (
          isRecord(c) &&
          c.verified === true &&
          typeof c.start === 'number' &&
          typeof c.end === 'number'
        ) {
          spans.push({ start: c.start, end: c.end });
        }
      }
    }
    out.push({
      ordinal: typeof r.ordinal === 'number' ? r.ordinal : out.length + 1,
      text: typeof r.requirement_text === 'string' ? r.requirement_text : '',
      status: status as AppStatus,
      spans,
    });
  }
  return out;
}

function snippet(s: string, n = 90): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > n ? `${flat.slice(0, n)}…` : flat;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const csv = await readFile(args.keyPath, 'utf8').catch(() => {
    throw new Error(`cannot read key file: ${args.keyPath}`);
  });
  const { items, errors } = parseKey(csv);
  if (errors.length > 0) {
    console.error('\nAnswer-key problems:');
    for (const e of errors) console.error(`  ✗ ${e}`);
  }
  if (items.length === 0) {
    throw new Error(`no usable rows in ${args.keyPath}`);
  }

  const aplId = await resolveAplId(args.base, args.aplNumber);

  if (args.analyze) {
    console.log(`Running a fresh analysis on ${args.base} …`);
    await postJson(`${args.base}/api/analyze`, { aplId });
  }

  const detail = await getJson(`${args.base}/api/apls/${aplId}`);
  if (!isRecord(detail) || !isRecord(detail.apl)) {
    throw new Error('unexpected /api/apls/:id response shape');
  }
  const fullText = detail.apl.full_text;
  if (typeof fullText !== 'string') throw new Error('apl.full_text missing');
  const title = typeof detail.apl.title === 'string' ? detail.apl.title : '';

  if (detail.analysis === null || detail.analysis === undefined) {
    throw new Error(
      `APL ${args.aplNumber} has no saved analysis. Re-run with --analyze, or analyze it in the app first.`,
    );
  }

  const appReqs = toAppRequirements(detail.analysis);
  const { resolved, unresolved } = resolveKey(items, fullText);
  const result = match(resolved, appReqs);

  const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const html = renderReport({
    aplNumber: args.aplNumber,
    title,
    fullText,
    result,
    unresolved,
    baseUrl: args.base,
    analyzedFresh: args.analyze,
    generatedAt,
  });
  await mkdir(path.dirname(args.outPath), { recursive: true });
  await writeFile(args.outPath, html, 'utf8');

  const keyGraded = resolved.length;
  const recall =
    keyGraded > 0 ? Math.round((result.found.length / keyGraded) * 100) : 0;

  console.log(`\nAPL ${args.aplNumber} — ${title}`);
  console.log(
    `Answer key: ${items.length} items (${keyGraded} graded, ${unresolved.length} unresolved)`,
  );
  console.log(
    `\n  RECALL: ${result.found.length}/${keyGraded} found (${recall}%)`,
  );
  console.log(`    found:    ${result.found.length}`);
  console.log(`    missed:   ${result.missed.length}`);
  console.log(
    `    excluded: ${result.excluded.length}  (app saw it, grounding rejected)`,
  );
  console.log(`    extra:    ${result.extra.length}  (app found, not in key)`);

  if (result.missed.length > 0) {
    console.log('\n  Missed (recall gaps):');
    for (const k of result.missed)
      console.log(`    [${k.id}] ${snippet(k.quote)}`);
  }
  if (unresolved.length > 0) {
    console.log(
      '\n  ⚠ Unresolved key quotes (not in full_text — fix these, not graded):',
    );
    for (const u of unresolved)
      console.log(`    [${u.id}] ${snippet(u.quote)}`);
  }
  console.log(`\n  Report → ${args.outPath}\n`);
}

main().catch((err: unknown) => {
  console.error(
    `\neval failed: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
