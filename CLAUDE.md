# CLAUDE.md

Authoritative guide for working in this repo. The full spec is in `SPEC.md`; the rationale behind every scope exclusion is in `DECISIONS.md`. When in doubt, those two win over this file.

## Overview & purpose

ClauseTrace turns a single regulatory letter — a California DHCS **All Plan Letter (APL)**, or ad-hoc pasted text — into a structured, source-verified breakdown: a plain-language summary, a list of discrete **requirements** each traceable to verified source text, the internal **departments** each requirement impacts, and a draft **action-item** checklist. The domain's defining constraint is that **a fabricated or misattributed requirement is worse than no answer at all.** Every trusted requirement must trace back to a citation that *deterministic code* has verified exists (near-)verbatim in the source. The grounding/verification layer is the product; the pipeline, UI, and LLM calls exist to support it.

## Architecture invariants (non-negotiable)

1. **Ungrounded model output must NEVER reach the user as a trusted requirement.** Verification is mandatory and **deterministic** — it lives in `server/src/grounding/`, not in prompts. Trust is decided by code, not by the model's say-so.
2. **Maintain the four-category trust taxonomy** — `grounded` / `abstained` / `excluded` / `generated` — in both the data model and the UI. Never let a source-verified claim look or read the same as generated advisory content (summary, action items).
3. **No RAG, no vector database, no embeddings.** A whole APL fits in the model's context window; retrieval would sever cross-references between requirements and *lower* accuracy. Do not add retrieval infrastructure. No embeddings model and no vector operations anywhere in the codebase.
4. **No auth, accounts, or multi-tenancy. No live PDF upload/parsing in v1.** Source text is pre-cleaned to plain text offline and seeded into the DB; a paste box covers ad-hoc input. Faithful parsing (not just parsing) is a deliberate v2 problem.
5. **The stored APL `full_text` is the canonical citation reference.** All offsets are computed against it and nothing else is grounded against anything else.
6. **All LLM access goes through the `LLMClient` interface** (`llm/client.ts`). Provider/model come from env (`LLM_PROVIDER`, `LLM_MODEL`) and are swappable in one place. The OpenAI SDK is imported and called **only** inside `server/src/llm/`.
7. **All model output is validated against zod schemas** (`llm/schemas.ts`) on receipt, with **one** repair re-prompt on schema failure, then fail with a clear message. Use OpenAI **strict structured output** — but remember strict mode guarantees output *shape*, never *truth of contents*; closing that gap is exactly the grounding layer's job.
8. **Errors are classified before any retry** (`lib/errors.ts`): retryable (rate-limit/5xx/network) → capped exponential backoff; schema-invalid → one repair then fail; auth/quota (401/403) → fail fast. Individual LLM calls and the overall analysis have timeouts.
9. **Results are persisted so an analysis can be revisited/shared. There is no crash recovery and no run-status table — a failed run is simply re-run.** Re-analyzing an APL **replaces** its previous analysis. Non-critical stages (department classification, action items) degrade to a `warnings` array rather than failing the whole run; critical stages (extraction + grounding) do not.

## Commands

```
npm run dev         # server + client together (watch)
npm run build       # build client, compile server
npm run start       # production: server serves the built client
npm run db:migrate  # apply SQL migrations
npm run db:seed     # load cleaned APLs from /data into Postgres (idempotent)
npm test            # vitest — REQUIRED green for grounding/verification logic
npm run lint        # eslint + prettier --check — REQUIRED clean before any commit
```

## Directory map

```
/server/src
  index.ts                 Express entry; serves built client in prod
  /routes                  apls.ts, analyze.ts
  /pipeline                runAnalysis.ts (orchestrator, single-call strategy),
                           classifyRequirement.ts (pure trust routing: verify → grounded/abstained/excluded)
  /grounding               verifyQuote.ts  ← MOST IMPORTANT FILE. Pure, deterministic, unit-tested.
                           offsets.ts, fuzzy.ts
  /llm                     client.ts (interface), openaiClient.ts (+ getLLMClient factory), schemas.ts, prompts.ts
  /db                      pool.ts, queries.ts, migrate.ts (runner), migrations/001_init.sql
  /domain                  departments.ts (controlled vocabulary)
  /lib                     env.ts (loads repo-root .env), errors.ts (classifyError + retry + timeout), logger.ts
/server/test               verifyQuote.test.ts, grounding.test.ts, classifyRequirement.test.ts
/client/src                App.tsx (?apl=<id> share URLs), api.ts, types.ts,
                           /components (SourcePane, ResultsPane, RequirementCard, AbstainedList,
                           ExcludedList, ActionItemList, StatusSteps, ExportButton, Badge)
/data/apls                 <apl_number>.txt + metadata.json
/data/seed.ts              idempotent loader (clears stale analysis if full_text changes)
docker-compose.yml         local Postgres 16 for dev (host port 5433)
eslint.config.js           eslint + prettier (npm run lint)
```

`server/src/grounding/verifyQuote.ts` is the heart of the project. It must be **pure and deterministic** and carry the strongest test coverage in the repo. Nothing there may call an LLM or touch the network.

## Conventions

- **TypeScript strict** everywhere. Never use `any` (use `unknown` + narrowing, unions, or the real type).
- **Grounding logic is pure and unit-tested.** No side effects, no I/O, no LLM calls in `grounding/`.
- **Prompts live in `llm/prompts.ts`**, kept separate from logic. Schemas live in `llm/schemas.ts`.
- **Every test change invokes `/test-guard`** before it ships.
- Keep the call count low: start with the fewest LLM calls (one strict-structured call can return summary + requirements + action items) and split extraction into focused section-by-section calls **only** when verification shows missing or unverifiable content on real APLs — never to fix format (strict mode makes malformed JSON impossible).

## Domain glossary

- **APL (All Plan Letter):** a DHCS regulatory letter to all managed-care plans stating new/clarified obligations. Numbered like `24-013` (13th letter of 2024).
- **Requirement:** a discrete obligation imposed by the letter.
- **P&P (Policies & Procedures):** a plan's internal rulebook. **Not used in this project** (matching to internal policies is out of scope — see `DECISIONS.md`).
- **Impacted department / functional area — the controlled vocabulary (do NOT invent values outside it; code validates and discards non-members):**
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
- **The four trust categories:**
  - **Grounded** — extracted requirement whose `source_quote` was verified by code to exist in `full_text`; carries a verified citation + offsets. *Highest trust.*
  - **Abstained** — model was asked and explicitly declined (`not_stated`) because the source does not state it. *Honest non-answer.*
  - **Excluded** — model asserted a requirement but its cited quote could not be verified. Stored and shown transparently for auditability, **never trusted**.
  - **Generated (advisory)** — content produced as guidance, not as a claim about the source: the **summary** and the **action items**. Clearly labeled generated; never presented as "what the regulation says."

## What NOT to do

- Do **not** add retrieval, embeddings, or a vector store. See `DECISIONS.md`.
- Do **not** call the OpenAI SDK (or any LLM) outside `server/src/llm/`.
- Do **not** present unverified model output as a trusted requirement, or blur grounded vs. generated content in data or UI.
- Do **not** add authentication or live PDF parsing in v1.
- Do **not** put grounding/verification logic behind an LLM call — it is always deterministic code.

Full rationale for these exclusions lives in `DECISIONS.md`.
