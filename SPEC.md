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
   - **In how the model is called:** requirements are extracted in **focused pieces** (e.g., section by section, or a "list topics, then extract per topic" pass) rather than one open-ended "give me everything" call that pressures the model to pad the list. This is chunking for *focus*, not retrieval — every piece is processed; nothing is filtered out.
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
- **No authentication, accounts, or multi-tenancy.** Single-user tool.
- **No persistence.** There is no database; an analysis lives only in the HTTP response and the browser session. Revisiting a document means re-running the analysis.
- **No unreviewed PDF ingestion.** The client extracts + cleans an uploaded PDF in the browser, but the text must pass through the paste-box review step before it becomes the source of record (see `DECISIONS.md` §2).
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

A single deployable web application, **stateless by design**:

- **Backend (Node + TypeScript + Express):** exposes one JSON endpoint (`POST /api/analyze`), runs the analysis pipeline, and owns all grounding/verification logic. Nothing is persisted — the response is the only output.
- **Frontend (React + TypeScript + Vite + Tailwind):** a two-pane analysis view (source on one side, structured results on the other) with click-to-highlight and export. The document text lives in browser state; it is what the user pasted or reviewed.
- **LLM access:** only through an `LLMClient` interface; the concrete implementation calls OpenAI. Provider and model are swappable via environment variables.

There is no database, no message queue, no vector store, and no external services beyond the LLM API.

```
Browser (React)
   │  POST /api/analyze { text, title? }
   ▼
Express API ── pipeline (summarize → extract+ground → classify → action items)
   │                 │
   │                 ├── grounding/  (deterministic verification — the core)
   │                 └── llm/        (LLMClient → OpenAI, schema-validated I/O)
   ▼
JSON result (summary, requirements + citations, action items, warnings)
```

---

## 6. The analysis pipeline

Orchestrated in `server/src/pipeline/runAnalysis.ts`. Given a document (title + full text), the pipeline runs these stages in order and **returns the results** — nothing is saved. There is **no run-status tracking and no crash recovery**: the app is small and an analysis takes seconds, so if a run fails partway, the user simply runs it again.

**Call strategy — start with the fewest LLM calls, split only if quality demands it.**

The stages below are **logical steps, not a fixed number of LLM calls.** Start with the simplest implementation: a **single LLM call** that returns the summary, the requirements (with quotes and departments), and the action items together, using **OpenAI strict structured output** so the response is guaranteed to match the schema. Then look at real output on real APLs, and only add calls if the output actually degrades. On a long document the model may **miss requirements** or return quotes that **fail verification** at a high rate — *that* is the signal to split extraction (Stage 2) into focused, section-by-section calls. Note the trigger carefully: with strict structured output on, malformed JSON can't happen, so the signal is never "broken format" — it is **missing or unverifiable content.** A third valid trigger: the **abstained category never fires** on the "plausible but not stated" test document — open extraction rarely volunteers `not_stated`, so if abstention can't be demonstrated, escalate to the "list topics, then extract per topic" shape where each probed topic can honestly return `not_stated`. The deterministic verification pass (Stage 2, step 2) is **always** separate code, never an LLM call. Do not pre-optimize the call count; begin at one and decompose only where verification shows it's needed.

**Status: this §137 escalation has fired and is implemented.** A single open call missed real requirements on the test APLs, so extraction is now section-by-section: a **segmentation** call (summary + short verbatim boundary markers) whose markers deterministic code locates and tiles into contiguous *pieces*, then one **per-piece** extraction call in parallel, merged into one flat list before grounding. See `docs/adr/0001-segmented-extraction.md` and `server/src/pipeline/segmentDocument.ts`. The verification pass below is unchanged.

**Stage 0 — Resolve source.**
The request body's `text` is the canonical `full_text`. **This submitted text is the single source of truth for all citations and offsets.** Nothing is grounded against anything else.

**Stage 1 — Summarize (generated/advisory).**
One LLM call over the full text → a concise plain-language summary. Labeled generated; not a source claim.

**Stage 2 — Extract & ground requirements (the core).**

1. LLM call requesting a list of discrete requirements. For each, the model returns: `requirement_text` (paraphrase), `source_quote` (a span it claims is verbatim from the source), `impacted_departments` (from the controlled list), and `not_stated` (boolean). Prompt rules: extract only obligations actually present; copy `source_quote` **verbatim**; if no verbatim supporting span can be found, do **not** invent one — omit the requirement or mark `not_stated`; choose departments only from the provided list.
2. **Verification pass (deterministic code — `grounding/verifyQuote.ts`):** for each returned `source_quote`, attempt to locate it in `full_text`:
   - **Exact substring** match → `verified: true`, `method: "exact"`, record `[start, end)` offsets.
   - Else **normalized** match (collapse whitespace, normalize quotes/dashes, case-insensitive) → `verified: true`, `method: "normalized"`, map back to approximate raw offsets.
   - Else → `verified: false`. There is deliberately **no similarity/fuzzy tier**: in a long quote a changed number or dropped "not" costs only a sliver of similarity, so any threshold eventually certifies an altered obligation as verified — the exact failure this product exists to prevent. Every character of an accepted quote corresponds to the source. See `DECISIONS.md` §5.
3. **Classification of each requirement:**
   - `verified: true` → **grounded** (returned with offsets).
   - model returned `not_stated: true` → **abstained**.
   - `verified: false` → **excluded** (returned, flagged, never shown as trusted).
4. **Department validation:** discard any returned department not in the controlled vocabulary.

Trust is decided by code verification, not by the model's own say-so.

**Stage 3 — Draft action items (generated/advisory).**
For each **grounded** requirement, an LLM call (or a single batched call) produces one or more action items: `action_item_text`, `suggested_owner_department` (from the controlled list), `priority` (`high|medium|low`). Action items are guidance derived from requirements — clearly labeled generated, visually and structurally distinct from grounded source claims.

In one-call mode, action items arrive attached to requirements *before* verification runs. Items whose parent requirement is not grounded (excluded or abstained) are **discarded — never returned, never shown as guidance** (guidance derived from an untrusted claim is itself untrusted). The discard is **not silent**: the run's `warnings[]` includes the discarded count, and the UI notes on each excluded requirement that any drafted action items were dropped.

**Stage 4 — Return.**
Return the full structured result to the caller: summary, requirements (each with status, citations + offsets, departments, faithfulness verdict, and action items), and any warnings from partial failures. That response is the analysis — there is nothing else.

---

## 7. Result shape (no persistence)

There is no database. The `POST /api/analyze` response is the complete data model (types in `server/src/pipeline/runAnalysis.ts`, mirrored in `client/src/types.ts`):

```json
{
  "summary": "string (generated/advisory)",
  "requirements": [
    {
      "ordinal": 1,
      "requirement_text": "string (paraphrase)",
      "status": "grounded | abstained | excluded",
      "citations": [
        { "quote": "string", "verified": true, "start": 0, "end": 0, "method": "exact | normalized | none" }
      ],
      "faithfulness": "supported | needs_review | null",
      "faithfulness_reason": "string | null",
      "impacted_departments": ["string (controlled vocabulary)"],
      "action_items": [
        { "text": "string", "suggested_owner_department": "string", "priority": "high | medium | low" }
      ]
    }
  ],
  "warnings": ["string"]
}
```

Offsets are relative to the request's `text` — the client already holds that text, so highlights need nothing more than the response.

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
  - **Requirements** list. Each **grounded** requirement is a card showing: the paraphrased requirement, the verified `source_quote`, a status/method badge (*Grounded · exact* / *Grounded · normalized*), impacted-department tags, and its action item(s). **Clicking a requirement scrolls to and highlights the exact source span in the left pane.**
  - **Abstained** items shown distinctly (e.g., "Not stated in source").
  - **Excluded (unverified)** section — collapsible — listing any model assertions that failed verification, explicitly marked as not trusted. Surfacing these is a deliberate transparency feature; do not hide them. Each excluded item also notes that any action items drafted for it were discarded (unverified requirements never produce guidance).
  - Action items, badged *Generated / advisory*, visually distinct from grounded requirements.
- **Controls:** paste text or upload an APL PDF (extracted + cleaned in the browser, reviewed in the paste box); analyze; per-stage status while running (mirror the pipeline: *Summarizing → Extracting requirements → Verifying citations → Classifying → Drafting action items*).
- **Export:** a button to copy or download the checklist (action items + grounded requirements with citations) as Markdown (`.md`). Because nothing is persisted, export is the only way to keep a result.

**Trust must be legible in the UI.** A grounded requirement (source-verified) and a generated action item (advisory) must never look the same or be confusable.

---

## 11. Source documents (eval fixtures)

- Source: **real, public DHCS APLs**, cleaned to plain text: strip page headers/footers, page numbers, and boilerplate; **preserve** section numbering and paragraph structure. The cleaned text is what gets analyzed — its accuracy directly determines citation quality.
- Stored as `data/apls/<apl_number>.txt` plus a `data/apls/metadata.json` (number, title, issued_date, source_url). The app itself never reads these — they are **fixtures for the eval harness** (`npm run eval` POSTs them to `/api/analyze`) and the raw material for authoring answer keys.
- Deliberately include at least one document/topic where a plausible-sounding obligation is **not** actually stated, so the *abstention / "not stated"* behavior can be demonstrated on real data.

---

## 12. Tech stack

- **Backend:** Node 20+, TypeScript (strict), Express, zod. No database.
- **LLM:** `openai` SDK, accessed only via `LLMClient`.
- **Frontend:** React, TypeScript, Vite, Tailwind.
- **Testing:** Vitest — required for grounding/verification logic.
- **Hosting:** Railway (single web service). A `Dockerfile` is included for portability; Railway is the deploy target for v1.

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
  eslint.config.js          # eslint + prettier (npm run lint)
  package.json              # npm workspaces: server + client
  /server
    /src
      index.ts              # Express entry; serves built client in prod
      /routes
        analyze.ts          # POST /api/analyze — the only endpoint
      /pipeline
        runAnalysis.ts      # orchestrator: segmentation → parallel per-piece
                            # extraction → merge → ground → faithfulness → return
        segmentDocument.ts  # pure: LLM-proposed markers → contiguous pieces
        classifyRequirement.ts   # pure trust routing: verify → grounded/abstained/excluded,
                                 # department backstop, orphan action-item discard
        sortByDocumentPosition.ts
        attachFaithfulness.ts    # non-critical advisory pass
      /grounding
        verifyQuote.ts      # deterministic verification — the heart of the project
        offsets.ts
      /llm
        client.ts           # LLMClient interface
        openaiClient.ts     # + getLLMClient factory; the only OpenAI SDK import
        schemas.ts          # zod schemas (strictObject for OpenAI strict mode)
        prompts.ts
        faithfulness.ts
      /domain
        departments.ts      # controlled vocabulary
      /lib
        env.ts              # loads repo-root .env regardless of cwd
        errors.ts           # classifyError + retry + timeout
        logger.ts
        concurrency.ts
    /test
      verifyQuote.test.ts
      grounding.test.ts
      classifyRequirement.test.ts
  /client
    index.html
    vite.config.ts          # react + tailwind v4 plugins; /api dev proxy
    /src
      App.tsx               # paste / PDF upload → review → analyze → results
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
    /apls                   # <apl_number>.txt + metadata.json — eval fixtures
  /eval                     # recall harness (see eval/README.md)
```

**API surface**

- `POST /api/analyze` — body `{ text, title? }` → runs the pipeline on that text and returns the full structured result (§7). Stateless: nothing is stored, and offsets in the response refer to the submitted `text`.

**Environment variables** (`.env.example`)

```
OPENAI_API_KEY=
LLM_PROVIDER=openai
LLM_MODEL=gpt-5.5
PORT=3000
```

**Scripts** (`package.json`)

```
dev         # run server + client together (watch)
build       # build client, compile server
start       # production: server serves built client
eval        # analyze a data/apls fixture fresh and grade recall
test        # vitest
lint        # eslint (typescript-eslint) + prettier --check
```
