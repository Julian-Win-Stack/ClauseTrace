# Recall eval

Measures **how many of a regulation's real requirements the app extracts** — its
recall — and shows exactly which ones it misses.

The trick: grade by **where the app points, not how it words things.** The LLM's
prose (and even its exact quotes) wobble run to run, but the document doesn't. So
the answer key pins each requirement to a verbatim span of `full_text`, the app's
citations already carry verified character offsets into that same `full_text`, and
grading is pure offset overlap. Wording is never compared.

## The answer key

One CSV per APL, at `eval/keys/<apl_number>.csv`, two columns:

```
id,quote
1,"Plans must notify DHCS within 10 business days of any material change..."
2,"MCPs shall develop and maintain written policies and procedures..."
```

- **`id`** — any value, only needs to be **unique** in the file and **stable over
  time**. Never renumber or reuse an id; you refer to it across runs. Only append.
- **`quote`** — a **verbatim** span copied from the app's `full_text` (not the
  PDF — PDF text is lossy and its offsets won't match). Quote the whole operative
  sentence (who is obligated + what they must do), long enough to be locally
  unique. When two distinct duties share one sentence, add **two rows** — the
  1-to-1 matcher then requires the app to have produced two requirements.

**Author it in a spreadsheet and export CSV** so commas/quotes inside the quote are
escaped automatically. The eval validates every quote against `full_text` on load
and loudly lists any it can't find (a bad copy), which are not graded.

## Running it

```
npm run eval <apl_number> [--base <url>] [--analyze] [--key <path>] [--out <path>]

npm run eval 009                 # grade the last saved analysis (localhost)
npm run eval 009 --analyze       # run a fresh analysis first, then grade
npm run eval 009 --base https://<railway-app>   # grade the live demo
```

`<apl_number>` may be the full number (`24-009`) or just its numeric tail
(`009`); the short form expands to the one answer key in `keys/` ending in it,
and `npm run eval -- 24-009` still works.

APLs are resolved by `apl_number` (numeric ids differ between local and Railway
DBs), so the same key file works against any instance. The APL must already be
seeded in that instance. Railway rate-limits analyses (10/day per IP, 20/day
site-wide) — iterate locally, show the number on Railway.

Output: a score in the terminal plus a self-contained HTML report at
`eval/out/<apl_number>.html` — open it in a browser.

## Reading the report

- **Score** — `found / total = recall`.
- **Document view** — the regulation with 🔴 **missed** and 🔵 **extra** spans
  highlighted in place; click any list item to jump to it.
- **Buckets**
  - **found** — key item overlaps a grounded requirement.
  - **missed** — nothing points there → the model never extracted it (fix the
    extraction prompt). This is the recall gap.
  - **excluded** — the model *did* point there but grounding rejected its quote
    (fix grounding, not recall — should be rare).
  - **extra** — a grounded requirement matching no key item: an over-split, a
    hole in your key, or a precision miss (the app treating background as an
    obligation).

**Growing the key:** review the *extra* list each run. If one is a real
requirement you forgot, append it as a new row — but only after **you** confirm it
against the source. Never auto-add what the app emitted, or the key becomes a copy
of the output and recall reads ~100% forever.

## Layout

```
eval/
  run.ts            CLI: args → fetch app API → grade → write report + print score
  lib/
    parseKey.ts     RFC-4180 CSV → key items (pure, tested)
    resolveKey.ts   key quotes → offsets via the app's own verifyQuote (pure, tested)
    match.ts        1-to-1 offset-overlap grading (pure, tested) — the heart
    report.ts       grade result → self-contained HTML (pure)
    types.ts
  keys/<apl>.csv    answer keys (tracked)
  out/<apl>.html    generated reports (gitignored)
```
