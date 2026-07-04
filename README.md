# ClauseTrace

Turn a single regulatory letter into a structured, **source-verified** breakdown of what it actually requires you to do.

California managed-care health plans are bound by a stream of DHCS **All Plan Letters (APLs)** — 5–30 pages of dense, cross-referenced regulatory language each. Today compliance staff read every new letter by hand to answer one question: *what does this require us to do, and who is affected?* ClauseTrace does that pass in seconds and produces:

- A plain-language **summary** (labeled *generated / advisory*).
- A list of discrete **requirements**, each traceable to the exact supporting text in the source, and each carrying a second-pass **⚠ needs-review** flag when the paraphrase may overreach its cited text.
- The internal **departments** each requirement impacts (from a fixed vocabulary).
- A draft **action-item checklist**, exportable to Markdown.
- A transparent **Excluded** list of any model assertions that failed verification.

## Why grounding is the whole point

In this domain, **a fabricated or misattributed requirement is worse than no answer at all.** A tool that invents obligations or cites text that doesn't exist isn't just unhelpful — it's dangerous. So ClauseTrace never trusts the model's word. It checks every requirement in **two layers**, and only the first decides trust.

**Layer 1 — does the citation exist? (deterministic code, decides trust).** For every requirement the model must return the exact `source_quotes` it claims are copied verbatim from the letter. Deterministic code in [`server/src/grounding/`](server/src/grounding/verifyQuote.ts) then verifies each span actually exists in the canonical source text. The same operation that confirms existence also yields the character offsets, which the UI renders as a click-to-highlight in the source pane. If **any** cited span can't be verified, the whole requirement is **rejected** — moved to a visible *Excluded* list, never shown as trusted. This gate is pure, unit-tested, and non-probabilistic: the correctness guarantee lives in code, not in the model.

**Layer 2 — does the citation actually *support* the requirement? (second LLM call, advisory).** Existence is not enough. A model can cite a real quote and still *misread* it — attach a deadline the quote doesn't state, strengthen a "may" into a "must", or broaden who is covered. Deterministic matching cannot catch that, because the failure is in meaning, not in characters. So for each **grounded** requirement, a second LLM call ([`server/src/llm/faithfulness.ts`](server/src/llm/faithfulness.ts)) judges the paraphrase against its already-verified quotes and returns `supported` or `needs_review` (with a reason). This is **generated/advisory**: it can raise the **⚠ needs-review** flag but **never** changes trust status, never hides the green badge, and never moves a requirement to Excluded. If it fails, the run degrades to a warning and the requirement stays grounded with no verdict.

Every output falls into one of four clearly-separated categories:

| Category | Meaning | Trust |
|---|---|---|
| **Grounded** | Extracted **and** every cited span was verified to exist in the source. | Highest — carries a verifiable citation + highlight. May also carry a ⚠ *needs-review* faithfulness flag (advisory). |
| **Abstained** | Model was asked and explicitly declined ("not stated in source"). | Honest non-answer. |
| **Excluded** | Model asserted it, but at least one cited span could not be verified. | Rejected — shown for auditability, never trusted. |
| **Generated** | Advisory guidance: the summary, the action items, and the faithfulness verdict. | Advisory — never "what the regulation says." |

## How the LLM pipeline works

The whole analysis for one letter is orchestrated by [`server/src/pipeline/runAnalysis.ts`](server/src/pipeline/runAnalysis.ts): **one extraction LLM call → deterministic grounding → a per-requirement faithfulness LLM call → save** (replacing any previous analysis). All LLM access goes through a single `LLMClient` interface; the OpenAI SDK is imported in exactly one file ([`server/src/llm/openaiClient.ts`](server/src/llm/openaiClient.ts)), and provider/model come from env.

### 1. Extraction — one strict-structured LLM call

A single call ([`prompts.ts`](server/src/llm/prompts.ts) `analysisSystemPrompt`) asks the model to return, in one JSON payload: the `summary`, and every discrete `requirement` with its `source_quotes[]` (contiguous verbatim spans), `impacted_departments[]` (chosen only from the fixed vocabulary), a `not_stated` flag, and 1–3 draft `action_items`. The prompt pushes for atomic obligations (one duty per requirement), exhaustive extraction, faithful paraphrasing (preserve modal strength, add no unstated specifics), and strict quote discipline (copy character-for-character; never concatenate text from different places).

The call is made with **OpenAI strict structured output** — the response shape is guaranteed to match the zod schema ([`schemas.ts`](server/src/llm/schemas.ts)). Strict mode guarantees *shape*, never *truth of contents*: whether a quoted span actually exists in the source is decided by grounding, never here. On receipt the JSON is re-validated with zod as a cheap backstop and the seam where a schema-invalid response becomes a typed error.

Reliability is handled deterministically ([`lib/errors.ts`](server/src/lib/errors.ts)): errors are **classified before any retry** — retryable (rate-limit/5xx/network) → capped exponential backoff; **schema-invalid → one repair re-prompt, then fail**; auth/quota (401/403) → fail fast. Both the individual call and the overall analysis have timeouts.

### 2. Grounding — deterministic verification (the core)

Each requirement is routed by [`classifyRequirement.ts`](server/src/pipeline/classifyRequirement.ts), which verifies every cited span with [`verifyQuote.ts`](server/src/grounding/verifyQuote.ts) — pure, deterministic, no I/O, no LLM. A span verifies only when every character corresponds to the source:

1. **exact** substring match, or
2. **normalized** match — after collapsing whitespace runs and unifying typographic quotes/dashes and case ([`offsets.ts`](server/src/grounding/offsets.ts)), which also maps the match back to raw character offsets for the highlight.

There is **deliberately no similarity/fuzzy tier.** A 99%-similar quote is rejected: in a long span a changed deadline or a dropped "not" costs only a sliver of similarity, so any fixed threshold eventually certifies an *altered* obligation as verified.

Grounding is **all-or-nothing** across a requirement's spans, and trust routing is:

- every span verifies → **grounded** (with per-span offsets),
- else the model said `not_stated` → **abstained**,
- else → **excluded** (spans stored with their real `verified` flags, never trusted).

Draft action items are kept **only** when the parent is grounded — guidance derived from an unverified claim is itself untrusted, so it's discarded and counted into a warning. Impacted departments are additionally filtered against the controlled vocabulary as a code-level backstop.

### 3. Faithfulness — a second LLM call, advisory only

For each **grounded** requirement, [`attachFaithfulness.ts`](server/src/pipeline/attachFaithfulness.ts) makes a second LLM call ([`faithfulness.ts`](server/src/llm/faithfulness.ts)) that shows the model *only* the paraphrase and its already-verified quotes and asks: do the quotes actually support the paraphrase? It judges **meaning, not wording** — rewording, synonyms, and faithful generalizations are `supported`; it returns `needs_review` only when the paraphrase adds substance the quotes don't back (an unstated obligation, a number/date/scope the quotes don't support, or a strengthened modal). The reason is persisted only on `needs_review`.

This pass is **non-critical**: grounded requirements are checked concurrently (bounded), and any failure degrades to a `warnings[]` entry with `faithfulness = null`. It never fails the run, and — by design — **never** changes a requirement's trust status. Abstained and excluded requirements are never sent to the judge.

## Architecture

A single deployable web app. No message queue, no vector store, no external services beyond the LLM API and Postgres.

```
Browser (React + Vite + Tailwind)
   │  JSON over HTTP
   ▼
Express API  ── pipeline (server/src/pipeline/runAnalysis.ts):
   │              1. extract       one strict-structured LLM call → summary + requirements + quotes + departments + action items
   │              2. ground        deterministic per-span verification (grounding/)  ← decides trust, no LLM
   │              3. classify       route each requirement → grounded / abstained / excluded
   │              4. faithfulness   second LLM call per grounded requirement (advisory ⚠, never changes trust)
   ▼
Postgres  (apls, requirements, action_items)
```

The pipeline runs the stages in order and saves the results, **replacing** any previous analysis for that document. There is no run-status tracking and no crash recovery — the app is small and a run takes seconds, so a failed run is simply re-run. Non-critical stages (department classification, action items, faithfulness) degrade to a `warnings` array rather than failing the whole run; critical stages (extraction + grounding) do not.

## Tech stack

- **Backend:** Node 20+, TypeScript (strict), Express, zod, `pg` (node-postgres) + plain SQL migrations.
- **LLM:** `openai` SDK, accessed only via the `LLMClient` interface; OpenAI strict structured output.
- **Frontend:** React, TypeScript, Vite, Tailwind.
- **Testing:** Vitest (required for grounding/verification logic).
- **Hosting:** Railway (web service + managed Postgres); a `Dockerfile` is included for portability.

## Getting started

Requires Node 20+ and Docker (for the dev Postgres).

```bash
git clone <repo>
cd clausetrace
npm install

cp .env.example .env          # then fill in the values below
docker compose up -d          # local Postgres 16 (host port 5433)
npm run db:migrate            # create tables
npm run db:seed               # load cleaned APLs from /data

npm run dev                   # server + client with watch
```

### Environment variables (`.env`)

```
DATABASE_URL=postgres://postgres:postgres@localhost:5433/clausetrace
OPENAI_API_KEY=sk-...
LLM_PROVIDER=openai
LLM_MODEL=gpt-5.5
PORT=3000
```

### Commands

```
npm run dev         # server + client together (watch)
npm run build       # build client, compile server
npm run start       # production: server serves the built client
npm run db:migrate  # apply SQL migrations
npm run db:seed     # load APLs from /data into Postgres (idempotent)
npm test            # vitest
npm run lint        # eslint + prettier --check
```

## Data

Source documents are **real, public DHCS APLs** (including APL 24-013), each cleaned to plain text offline — headers/footers/page numbers stripped, section numbering and paragraph structure preserved. The cleaned text is the canonical citation reference, so its fidelity directly determines citation quality. Files live at `data/apls/<apl_number>.txt` with a `data/apls/metadata.json`; `data/seed.ts` loads them idempotently. At least one document deliberately includes a plausible-sounding obligation that is **not** actually stated, so the abstention behavior can be demonstrated on real data.

## API

- `GET /api/apls` — list all APLs, preloaded and pasted (id, number, title, is_adhoc, analyzed?).
- `GET /api/apls/:id` — full text + metadata, plus its saved analysis if one exists.
- `POST /api/apls` — create an ad-hoc APL from pasted text; returns id.
- `POST /api/analyze` — body `{ aplId }` (or `{ text }`) → runs the pipeline, saves results (replacing any previous analysis), returns the full structured result.

## Limitations

- **Extracting *every* requirement from a letter is hard.** Grounding constrains the *precision* of what's shown (a cited span provably exists, and the faithfulness pass flags paraphrases that overreach), but it does not guarantee *recall* — a single big extraction call over a 30-page letter can still miss obligations. The clearest accuracy improvement would be to stop doing one large call: feed the regulation to the model **in chunks** and have each chunk produce its requirements, so no section is skimmed. Grounding then verifies each chunk's citations exactly as it does today.

---

See also: [`SPEC.md`](SPEC.md) (specification), [`DECISIONS.md`](DECISIONS.md) (scope exclusions and rationale), [`CLAUDE.md`](CLAUDE.md) (repo conventions and invariants).
