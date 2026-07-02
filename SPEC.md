# ClauseTrace — Technical Reference

The durable technical reference for ClauseTrace: the concrete data model, pipeline mechanics, verification algorithm, LLM schemas, and API. It is the depth doc other files point to for detail.

**Where things live:**
- **`CLAUDE.md`** — orientation + non-negotiable invariants (loaded every task).
- **`SPEC.md`** (this file) — full technical detail; the tie-breaker when the shorter docs are ambiguous.
- **`DECISIONS.md`** — why each scope exclusion was made.
- **`README.md`** — human-facing overview, setup, and limitations.
- **`IMPLEMENTATION_PLAN.md`** — the phased build order.

---

## 1. Purpose

Managed-care health plans (Medicare Advantage and Medicaid/Medi-Cal plans) are bound by a constant stream of regulatory guidance. In California, the Department of Health Care Services (DHCS) issues these as **All Plan Letters (APLs)**; at the federal level they arrive as HPMS memos. Each new letter can impose new obligations, and a single missed obligation can result in findings, corrective action, or multi-million-dollar penalties.

Today, compliance staff read each new APL by hand — often 5 to 30 pages of dense, cross-referenced regulatory language — and manually determine: *what does this actually require us to do, and which parts of our organization are affected?* This is slow, repetitive, and error-prone.

**ClauseTrace turns a single regulatory letter into a structured, source-verified breakdown:** a plain-language summary, a list of discrete requirements (each traceable to the exact supporting text in the source), the internal functional areas each requirement impacts, and a draft action-item checklist.

The defining constraint of this domain is that **a fabricated or misattributed requirement is worse than no answer at all.** A compliance tool that invents obligations, or cites text that does not exist, is not merely unhelpful — it is dangerous. ClauseTrace is therefore built around a **grounding and verification layer** that makes it structurally impossible for an unverified claim to be presented as a trusted requirement.

---

## 2. Core concept — the grounding layer (read this first)

The single most important part of this project is **not** the pipeline, the UI, or the LLM calls. It is the layer that guarantees trust. Everything else exists to support it.

The system distinguishes four categories of output, and never blurs them:

| Category | Meaning | Trust level |
|---|---|---|
| **Grounded requirement** | A requirement the model extracted **and** whose cited source text was verified by deterministic code to exist in the source document. | Highest — carries a verifiable citation. |
| **Abstained ("not stated")** | The model was asked and explicitly declined because the source does not state it. | Honest non-answer. |
| **Excluded (ungrounded)** | The model asserted a requirement but its cited text could **not** be verified against the source. Shown transparently, never trusted. | Rejected — shown for auditability, not used. |
| **Generated (advisory)** | Content the model produces as guidance rather than as a claim about the source: the summary and the action items. Clearly labeled as generated. | Advisory — never presented as "what the regulation says." |

The grounding layer is what implements this taxonomy. It rests on four design decisions, from shallowest to deepest:

1. **Structured output.** The LLM returns typed, schema-validated JSON — not prose. This is table stakes; it makes output parseable but guarantees nothing about correctness.
2. **Verified grounding.** For every requirement, the model must return a `source_quote`: a span it claims is copied verbatim from the source. Deterministic code then **verifies that span actually exists** in the source text. If it does not, the requirement is **rejected** (moved to the *Excluded* category), never shown as trusted. When the span *is* verified, locating it yields a **character offset range** in the canonical source text — the same operation that confirms existence also gives the position — which the UI renders as a highlight in the source pane (click a requirement → its exact source passage lights up). The correctness guarantee lives in deterministic code, not in the (probabilistic) model; the highlight is that guarantee made visible, not UI polish. This is one step, not two: verify the citation, keep its location, reject what can't be verified.
3. **Decomposition + abstention.** Hallucination most often appears when a model feels pressure to fill a gap; this design removes that pressure rather than only cleaning up after it. It shows up in three concrete places, not as an algorithm:
   - **In the prompts:** the model is explicitly told it may extract *nothing* for a section that imposes no new obligation, and must never fabricate a `source_quote` — if it can't cite verbatim supporting text, it omits the requirement. Permission to decline is written into the instructions.
   - **In how the model is called:** requirements are extracted in **focused pieces** (e.g., section by section, or a "list topics, then extract per topic" pass) rather than one open-ended "give me everything" call that pressures the model to pad the list. This is chunking for *focus*, and is unrelated to retrieval/RAG (which is out of scope).
   - **In the output/pipeline:** there is a legitimate representation for "not stated / none," and the pipeline treats an empty or declined result as a **valid outcome, not an error.** Without this, the permission above would be meaningless.

   Abstention reduces how often the model invents; the verification layer (decision 2) is the backstop that rejects anything it asserts without a real citation. In v1 (extraction) the two overlap — a fabricated requirement usually dies at verification anyway — so abstention's main added value here is suppressing padding at the source. The exact mechanics are the implementing engineer's call.
4. **Documented limits.** The system is explicit about what grounding does **not** solve. Grounding catches *fabricated* citations; it does not catch a *misread* of a real passage. Naming this boundary is part of the design, not an afterthought. (See README → Limitations.)

**Invariant (non-negotiable):** Ungrounded model output must never reach the user as a trusted requirement. Verification is mandatory and deterministic.

---

## 3. Scope

### In scope (v1)

A single-document pipeline over one APL at a time, producing:

1. A plain-language **summary** (generated/advisory).
2. A list of **grounded requirements**, each with a verified source citation and impacted departments.
3. Per-requirement **impacted functional areas**, drawn from a controlled vocabulary.
4. A **draft action-item checklist** (generated/advisory), derived from the grounded requirements.
5. A transparent **Excluded** list of any model assertions that failed verification.
6. **Export** of the resulting checklist.

### Explicitly out of scope

- **No matching of requirements against an organization's internal policies (P&Ps).**
- **No RAG, no vector database, no embeddings.** A single APL fits comfortably in a modern model's context window; retrieval is unnecessary and, on a single cross-referenced document, harmful.
- **No authentication, accounts, or multi-tenancy.** Single-user tool.
- **No live PDF upload / parsing in v1.** Source documents are pre-cleaned to text offline (see §11). A paste box is provided for ad-hoc text.
- **No handling of tables, figures, or images** within documents (text only).

The full rationale for each exclusion — why it was made and when it would be revisited — is in **`DECISIONS.md`**.

---

## 4. Domain primer

- **APL (All Plan Letter):** A regulatory letter issued by DHCS to all managed-care health plans, stating new or clarified obligations. Identified by a number like `24-013` (13th letter of 2024).
- **Requirement:** A discrete obligation imposed by the letter (e.g., "plans must respond to standard prior-authorization requests within X business days").
- **P&P (Policies & Procedures):** A health plan's own internal rulebook. *Not used in this project.*
- **Impacted department / functional area:** The internal team responsible for complying with a given requirement. Use this controlled vocabulary (do not invent values outside it):

```
Utilization Management / Prior Authorization
Claims
Member Services
Provider Network Management
Quality Improvement
Pharmacy / Formulary
Appeals & Grievances
Care Management / Case Management
Behavioral Health
Compliance / Regulatory Affairs
Enrollment & Eligibility
Finance
Delegation Oversight
```

The model must select impacted departments **only** from this list; code validates each returned value against the list and discards any that are not members.

---

## 5. Architecture overview

A single deployable web application:

- **Backend (Node + TypeScript + Express):** exposes a small JSON API, runs the analysis pipeline, owns all grounding/verification logic, and persists everything to Postgres.
- **Frontend (React + TypeScript + Vite + Tailwind):** a two-pane analysis view (source on one side, structured results on the other) with click-to-highlight and export.
- **Database (Postgres):** stores the source documents and the **saved results** of each analysis (requirements and action items), so an analysis can be revisited and shared without re-running it. There is no crash-recovery or run-status tracking (see §9).
- **LLM access:** only through an `LLMClient` interface; the concrete implementation calls OpenAI. Provider and model are swappable via environment variables.

There is no message queue, no vector store, and no external services beyond the LLM API and Postgres.

```
Browser (React)
   │  JSON over HTTP
   ▼
Express API ── pipeline (summarize → extract+ground → classify → action items)
   │                 │
   │                 ├── grounding/  (deterministic verification — the core)
   │                 └── llm/        (LLMClient → OpenAI, schema-validated I/O)
   ▼
Postgres (apls, requirements, action_items)
```

---

## 6. The analysis pipeline

Orchestrated in `server/src/pipeline/runAnalysis.ts`. Given an APL (selected preloaded document or pasted text), the pipeline runs these stages in order and, at the end, **saves the results** to the database. There is **no run-status tracking and no crash recovery**: the app is small and an analysis takes seconds, so if a run fails partway, the user simply runs it again. Re-analyzing a document **replaces** its previously stored results.

**Call strategy — start with the fewest LLM calls, split only if quality demands it.**

The stages below are **logical steps, not a fixed number of LLM calls.** Start with the simplest implementation: a **single LLM call** that returns the summary, the requirements (with quotes and departments), and the action items together, using **OpenAI strict structured output** so the response is guaranteed to match the schema. Then look at real output on real APLs, and only add calls if the output actually degrades. On a long document the model may **miss requirements** or return quotes that **fail verification** at a high rate — *that* is the signal to split extraction (Stage 2) into focused, section-by-section calls. Note the trigger carefully: with strict structured output on, malformed JSON can't happen, so the signal is never "broken format" — it is **missing or unverifiable content.** A third valid trigger: the **abstained category never fires** on the seeded "plausible but not stated" document — open extraction rarely volunteers `not_stated`, so if abstention can't be demonstrated, escalate to the "list topics, then extract per topic" shape where each probed topic can honestly return `not_stated`. The deterministic verification pass (Stage 2, step 2) is **always** separate code, never an LLM call. Do not pre-optimize the call count; begin at one and decompose only where verification shows it's needed.

**Stage 0 — Resolve source.**
Load the APL's canonical `full_text` from the database (or, for pasted text, create an ad-hoc APL row first). **This stored text is the single source of truth for all citations and offsets.** Nothing is grounded against anything else.

**Stage 1 — Summarize (generated/advisory).**
One LLM call over the full text → a concise plain-language summary. Labeled generated; not a source claim.

**Stage 2 — Extract & ground requirements (the core).**

1. LLM call requesting a list of discrete requirements. For each, the model returns: `requirement_text` (paraphrase), `source_quote` (a span it claims is verbatim from the source), `impacted_departments` (from the controlled list), and `not_stated` (boolean). Prompt rules: extract only obligations actually present; copy `source_quote` **verbatim**; if no verbatim supporting span can be found, do **not** invent one — omit the requirement or mark `not_stated`; choose departments only from the provided list.
2. **Verification pass (deterministic code — `grounding/verifyQuote.ts`):** for each returned `source_quote`, attempt to locate it in `full_text`:
   - **Exact substring** match → `verified: true`, `method: "exact"`, record `[start, end)` offsets.
   - Else **normalized** match (collapse whitespace, normalize quotes/dashes, case-insensitive) → `verified: true`, `method: "normalized"`, map back to approximate raw offsets.
   - Else **fuzzy** match: sliding-window similarity (e.g., token- or Levenshtein-ratio based) to find the best-matching span; accept only if similarity ≥ `FUZZY_MATCH_THRESHOLD` → `verified: true`, `method: "fuzzy"`, record offsets and `score`.
   - Else → `verified: false`.
3. **Classification of each requirement:**
   - `verified: true` → **grounded** (stored with offsets).
   - model returned `not_stated: true` → **abstained**.
   - `verified: false` → **excluded** (stored, flagged, never shown as trusted).
4. **Department validation:** discard any returned department not in the controlled vocabulary.

Trust is decided by code verification, not by the model's own say-so.

**Stage 3 — Draft action items (generated/advisory).**
For each **grounded** requirement, an LLM call (or a single batched call) produces one or more action items: `action_item_text`, `suggested_owner_department` (from the controlled list), `priority` (`high|medium|low`). Action items are guidance derived from requirements — clearly labeled generated, visually and structurally distinct from grounded source claims.

In one-call mode, action items arrive attached to requirements *before* verification runs. Items whose parent requirement is not grounded (excluded or abstained) are **discarded — never stored, never shown as guidance** (guidance derived from an untrusted claim is itself untrusted). The discard is **not silent**: the run's `warnings[]` includes the discarded count, and the UI notes on each excluded requirement that any drafted action items were dropped.

**Stage 4 — Save & return.**
Save the results (summary, requirements with their status / offsets / departments, and action items) to the database, **replacing any previous analysis for this APL**. Return the full structured result to the caller (summary, grounded requirements with offsets and departments, abstained items, excluded items, action items, and any warnings from partial failures).

---

## 7. Data model (Postgres)

Use plain SQL migrations. Suggested schema (adjust naming as needed, keep the structure). There is **no `analysis_runs` table** — each APL holds its latest analysis directly.

**`apls`** — source documents (and their latest analysis summary)

- `id` (pk), `apl_number` (text, nullable for pasted docs), `title` (text), `issued_date` (date, nullable), `source_url` (text, nullable), `full_text` (text, **canonical citation reference**), `char_length` (int), `is_adhoc` (bool, true for pasted), `summary` (text, nullable — the latest analysis's summary; generated/advisory), `analyzed_at` (timestamp, nullable), `created_at`.

**`requirements`**

- `id` (pk), `apl_id` (fk), `ordinal` (int), `requirement_text` (text), `source_quote` (text), `source_start_offset` (int, nullable), `source_end_offset` (int, nullable), `status` (`grounded|abstained|excluded`), `verification_method` (`exact|normalized|fuzzy|none`), `match_score` (float, nullable), `impacted_departments` (jsonb array), `created_at`.

**`action_items`**

- `id` (pk), `requirement_id` (fk), `text` (text), `suggested_owner_department` (text), `priority` (`high|medium|low`), `created_at`.

Re-analyzing a document **replaces** its analysis: delete the existing `requirements` (and their `action_items`) for that `apl_id`, insert the new set, and update `summary` / `analyzed_at` on the `apls` row. Offsets are stored relative to the associated APL's `full_text`.

---

## 8. LLM integration

- **Interface first.** All model access goes through an `LLMClient` interface (`llm/client.ts`) with a single concrete implementation `OpenAIClient` (`llm/openaiClient.ts`). Provider and model come from env (`LLM_PROVIDER`, `LLM_MODEL`). This makes the provider swappable in one place. Do not call the OpenAI SDK anywhere outside `llm/`.
- **Structured output.** Use **OpenAI strict structured output** so every response is guaranteed to match the schema (define schemas in `llm/schemas.ts`; still validate on receipt as a cheap backstop). Critical distinction: strict mode guarantees the output's **shape**, not the **truth of its contents** — the model can return a schema-perfect object whose `source_quote` is fabricated. Closing that content gap is exactly the job of the grounding/verification layer (§6 step 2, §2); strict mode does **not** replace it.
- **Prompts** live in `llm/prompts.ts`, kept separate from logic. Extraction prompt must instruct verbatim `source_quote`, no invention, `not_stated` allowed, departments restricted to the controlled list.

**Extraction output schema (shape):**

```json
{
  "requirements": [
    {
      "requirement_text": "string",
      "source_quote": "string (verbatim span from the source)",
      "impacted_departments": ["string (from controlled vocabulary)"],
      "not_stated": false
    }
  ]
}
```

No embeddings model is used. No vector operations exist anywhere in the codebase.

---

## 9. Reliability & error handling

Keep this **lightweight** — the app is small. There is **no crash-recovery machinery**: no run-status table, no resumable runs. If an analysis fails partway, it is simply re-run. What the system should still do:

- **Classify errors before retrying.** A single `classifyError(err)` (`lib/errors.ts`) maps failures to strategies:
  - Rate limit / 5xx / network timeout → **retryable**, exponential backoff, capped attempts.
  - Malformed / schema-invalid model output → **one** repair re-prompt (see §8), then fail with a clear message.
  - Auth / quota / permission (401/403/insufficient quota) → **fail fast**, clear message, no retries.
- **Degrade to warnings on partial failure.** Some stages are critical (requirement extraction + grounding); some are not (department classification, action-item generation). If a non-critical stage fails, attach a message to a `warnings` array in the response and return partial results rather than failing the whole analysis.
- **Timeouts** on individual LLM calls and on the overall analysis.
- **The grounding logic is pure and deterministic** and must be unit-tested. This is the one part where correctness truly matters.

---

## 10. Frontend / UX

A focused, two-pane analysis view. When implementing, follow strong frontend design practices: clear visual hierarchy, a restrained palette, purposeful typography, and generous whitespace. The interface should read as a serious professional tool, not a demo.

**Layout**

- **Left / source pane:** the APL's canonical text, rendered with preserved paragraph/section structure. Supports highlighting a character range.
- **Right / results pane:**
  - **Summary** at top, badged *Generated*.
  - **Requirements** list. Each **grounded** requirement is a card showing: the paraphrased requirement, the verified `source_quote`, a status/method badge (e.g., *Grounded · exact* / *Grounded · fuzzy*), impacted-department tags, and its action item(s). **Clicking a requirement scrolls to and highlights the exact source span in the left pane.**
  - **Abstained** items shown distinctly (e.g., "Not stated in source").
  - **Excluded (unverified)** section — collapsible — listing any model assertions that failed verification, explicitly marked as not trusted. Surfacing these is a deliberate transparency feature; do not hide them. Each excluded item also notes that any action items drafted for it were discarded (unverified requirements never produce guidance).
  - Action items, badged *Generated / advisory*, visually distinct from grounded requirements.
- **Controls:** select a preloaded APL or paste text; run analysis; per-stage status while running (mirror the pipeline: *Summarizing → Extracting requirements → Verifying citations → Classifying → Drafting action items*).
- **Shareable URLs:** the selected APL is reflected in the URL (`?apl=<id>` or `/apl/:id`); opening that link loads the document and its saved analysis. This is what makes "revisited/shared" literally true in a no-auth app.
- **Export:** a button to copy or download the checklist (action items + grounded requirements with citations) as Markdown (`.md`).

**Trust must be legible in the UI.** A grounded requirement (source-verified) and a generated action item (advisory) must never look the same or be confusable.

---

## 11. Data ingestion

- Source: **real, public DHCS APLs.** Include **APL 24-013** and 7–11 others (aim for 8–12 total). Prefer a spread of topics so different departments light up.
- **Clean each to plain text offline:** strip page headers/footers, page numbers, and boilerplate; **preserve** section numbering and paragraph structure. The cleaned text becomes the canonical citation reference — accuracy of stored text directly determines citation quality.
- Store each as `data/apls/<apl_number>.txt` plus a `data/apls/metadata.json` (number, title, issued_date, source_url).
- `data/seed.ts` loads all cleaned APLs into the `apls` table (idempotent).
- Deliberately include at least one document/topic where a plausible-sounding obligation is **not** actually stated, so the *abstention / "not stated"* behavior can be demonstrated on real data.

---

## 12. Tech stack

- **Backend:** Node 20+, TypeScript (strict), Express, zod, `pg` (node-postgres) with plain SQL migrations (no heavy ORM required; a thin query layer in `db/queries.ts` is fine).
- **LLM:** `openai` SDK, accessed only via `LLMClient`.
- **Frontend:** React, TypeScript, Vite, Tailwind.
- **Testing:** Vitest — required for grounding/verification logic.
- **Hosting:** Railway (web service + managed Postgres). A `Dockerfile` is included for portability; Railway is the deploy target for v1.

---

## 13. Project structure

```
clausetrace/
  README.md
  CLAUDE.md
  SPEC.md                   # this file
  DECISIONS.md
  .env.example
  Dockerfile
  docker-compose.yml        # local Postgres 16 for dev (host port 5433)
  eslint.config.js          # eslint + prettier (npm run lint)
  package.json              # npm workspaces: server + client
  /server
    /src
      index.ts              # Express entry; serves built client in prod
      /routes
        apls.ts             # GET /api/apls, GET /api/apls/:id, POST /api/apls (paste)
        analyze.ts          # POST /api/analyze
      /pipeline
        runAnalysis.ts      # orchestrator — single-call strategy (summary +
                            # requirements + action items in one strict call);
                            # the separate stage files were folded into it
        classifyRequirement.ts   # pure trust routing: verify → grounded/abstained/excluded,
                                 # department backstop, orphan action-item discard
      /grounding
        verifyQuote.ts      # deterministic verification — the heart of the project
        offsets.ts
        fuzzy.ts
      /llm
        client.ts           # LLMClient interface
        openaiClient.ts     # + getLLMClient factory; the only OpenAI SDK import
        schemas.ts          # zod schemas (strictObject for OpenAI strict mode)
        prompts.ts
      /db
        pool.ts
        queries.ts
        migrate.ts          # migration runner
        /migrations/001_init.sql
      /domain
        departments.ts      # controlled vocabulary
      /lib
        env.ts              # loads repo-root .env regardless of cwd
        errors.ts           # classifyError + retry + timeout
        logger.ts
    /test
      verifyQuote.test.ts
      grounding.test.ts
      classifyRequirement.test.ts
  /client
    index.html
    vite.config.ts          # react + tailwind v4 plugins; /api dev proxy
    /src
      App.tsx               # selection, ?apl=<id> share URLs, paste, analyze
      api.ts
      types.ts
      /components
        SourcePane.tsx
        ResultsPane.tsx
        RequirementCard.tsx
        AbstainedList.tsx
        ActionItemList.tsx
        ExcludedList.tsx
        StatusSteps.tsx
        ExportButton.tsx
        Badge.tsx
  /data
    /apls                   # <apl_number>.txt + metadata.json
    seed.ts
```

**API surface**

- `GET /api/apls` — list all APLs, preloaded **and** ad-hoc pasted (id, number, title, `is_adhoc`, whether analyzed). The UI badges pasted docs as *Pasted* — without listing them, a pasted analysis would be unreachable after the session, defeating persist-to-revisit.
- `GET /api/apls/:id` — full text + metadata **plus its saved analysis** (summary, requirements, action items), if one exists.
- `POST /api/apls` — create an ad-hoc APL from pasted text; returns id.
- `POST /api/analyze` — body `{ aplId }` (or `{ text }` shorthand) → runs the pipeline, **saves the results to that APL (replacing any previous analysis)**, and returns the full structured result.

**Environment variables** (`.env.example`)

```
DATABASE_URL=
OPENAI_API_KEY=
LLM_PROVIDER=openai
LLM_MODEL=gpt-5.5
FUZZY_MATCH_THRESHOLD=0.9
PORT=3000
```

**Scripts** (`package.json`)

```
dev         # run server + client together (watch)
build       # build client, compile server
start       # production: server serves built client
db:migrate  # apply SQL migrations
db:seed     # load APLs from /data into Postgres
test        # vitest
lint        # eslint (typescript-eslint) + prettier --check
```
