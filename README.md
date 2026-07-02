# ClauseTrace

Turn a single regulatory letter into a structured, **source-verified** breakdown of what it actually requires you to do.

California managed-care health plans are bound by a stream of DHCS **All Plan Letters (APLs)** — 5–30 pages of dense, cross-referenced regulatory language each. Today compliance staff read every new letter by hand to answer one question: *what does this require us to do, and who is affected?* ClauseTrace does that pass in seconds and produces:

- A plain-language **summary** (labeled *generated / advisory*).
- A list of discrete **requirements**, each traceable to the exact supporting text in the source.
- The internal **departments** each requirement impacts (from a fixed vocabulary).
- A draft **action-item checklist**, exportable to Markdown.
- A transparent **Excluded** list of any model assertions that failed verification.

## Why grounding is the whole point

In this domain, **a fabricated or misattributed requirement is worse than no answer at all.** A tool that invents obligations or cites text that doesn't exist isn't just unhelpful — it's dangerous.

So ClauseTrace never trusts the model's word. For every requirement the model must return a `source_quote` it claims is copied verbatim from the letter. **Deterministic code then verifies that span actually exists** in the canonical source text. The same operation that confirms existence also yields the character offsets, which the UI renders as a click-to-highlight in the source pane. If a quote can't be verified, the requirement is **rejected** — moved to a visible *Excluded* list, never shown as trusted. The correctness guarantee lives in code, not in the (probabilistic) model.

Every output falls into one of four clearly-separated categories:

| Category | Meaning | Trust |
|---|---|---|
| **Grounded** | Extracted **and** its citation was verified to exist in the source. | Highest — carries a verifiable citation + highlight. |
| **Abstained** | Model was asked and explicitly declined ("not stated in source"). | Honest non-answer. |
| **Excluded** | Model asserted it, but its citation could not be verified. | Rejected — shown for auditability, never trusted. |
| **Generated** | Advisory guidance (the summary, the action items). | Advisory — never "what the regulation says." |

## Architecture

A single deployable web app. No message queue, no vector store, no external services beyond the LLM API and Postgres.

```
Browser (React + Vite + Tailwind)
   │  JSON over HTTP
   ▼
Express API ── pipeline: summarize → extract+ground → classify → action items
   │                 ├── grounding/  deterministic verification (the core)
   │                 └── llm/        LLMClient → OpenAI, schema-validated I/O
   ▼
Postgres  (apls, requirements, action_items)
```

The pipeline (`server/src/pipeline/runAnalysis.ts`) runs the stages in order and saves the results, **replacing** any previous analysis for that document. There is no run-status tracking and no crash recovery — the app is small and a run takes seconds, so a failed run is simply re-run.

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

Read these honestly — they define the edges of what the tool guarantees.

- **Grounding verifies existence, not interpretation.** A cited span is confirmed to exist in the source; the tool does **not** verify that the paraphrase correctly *reads* it. A real quote paired with a wrong interpretation (a *misread*) is a distinct failure mode that grounding does not catch — it requires evaluation, not verification.
- **Extraction recall is not guaranteed.** Grounding constrains the *precision* of citations, not the *completeness* of extraction; the model may still miss requirements.
- **Matching is strict by design — no similarity scoring.** A quote verifies only if every character corresponds to the source (verbatim, or after unifying whitespace/typographic quotes/dashes/case). A genuine quote with even a small transcription error is rejected into the visible *Excluded* list rather than risk certifying an altered obligation. See `DECISIONS.md` §5.
- **Cross-references are out of scope.** Obligations that live in a document the APL points to (but does not contain) are not resolved.
- **Text only.** Tables, figures, and images are not interpreted in v1 — a requirement expressed *only* inside a table may be missed.

## Scope & decisions

Several capabilities are **deliberately** excluded from v1: matching requirements against an organization's internal policies, RAG/vector/embeddings, live PDF upload/parsing, and table/figure handling. These are reasoned engineering choices, not gaps. The full rationale — what was excluded, why, and when it would be revisited — is in [`DECISIONS.md`](DECISIONS.md). The authoritative specification is in [`SPEC.md`](SPEC.md); repo conventions and invariants for contributors (and AI agents) are in [`CLAUDE.md`](CLAUDE.md).
