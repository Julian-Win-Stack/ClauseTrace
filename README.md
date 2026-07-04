# ClauseTrace

**Turn a dense regulatory letter into a source-verified list of what it requires — every requirement traceable to the exact text that proves it.**

California managed-care health plans must comply with a stream of DHCS *All Plan Letters* (APLs): 5–30 pages of dense, cross-referenced legal language each. Compliance teams read every new letter by hand to answer one question — *what does this require us to do, and who's affected?* ClauseTrace does that pass in seconds.

The hard part isn't summarizing. It's trust: in compliance, a made-up requirement is worse than no answer at all. So the whole design follows one rule — **the model is never trusted on its word.**


## The core idea: two layers of verification

Every requirement the model proposes must survive two checks — and only the first decides whether it's shown as trusted.

**1. Does the citation exist?** — *deterministic code.*
The model must return the exact quote it claims supports each requirement. Plain, unit-tested code then checks that the quote really appears in the source, character for character. If it doesn't, the requirement is rejected into a visible *Excluded* list and never shown as real. This is deliberately not fuzzy: a 99%-similar quote is still rejected, because in a long passage a single changed deadline or dropped "not" barely dents a similarity score yet flips the meaning. Trust is decided by code, not by the model.

**2. Does the citation actually support it?** — *a second LLM call, advisory.*
A real quote can still be misread — a deadline attached that isn't there, a "may" hardened into a "must." Character-matching can't catch that, so a second LLM call compares each verified requirement against its own quotes and flags any that overreach. This only raises a ⚠ *needs-review* note; it never changes trust or hides a verified requirement.

Every output lands in one of four clearly separated buckets:

| Category | Meaning | Trust |
|---|---|---|
| **Grounded** | Extracted, and every quote verified to exist in the source. | Highest — clickable citation + highlight. |
| **Abstained** | Model was asked and honestly said "not stated here." | Honest non-answer. |
| **Excluded** | Model claimed it, but a quote failed verification. | Shown for transparency, never trusted. |
| **Generated** | Advisory guidance: summary, action items, review flags. | Never "what the regulation says." |

## How it works

One analysis = one extraction call → deterministic grounding → a per-requirement faithfulness check → save.

```
Browser (React + Tailwind)
   │  JSON / HTTP
   ▼
Express API
   1. Extract    one structured LLM call → summary, requirements, quotes, departments, draft action items
   2. Ground     code verifies each quote exists (exact, or whitespace/punctuation-normalized) — decides trust
   3. Classify   route each requirement → grounded / abstained / excluded
   4. Review     second LLM call flags any paraphrase that overreaches its quotes (advisory)
   ▼
Postgres
```

All model output is schema-validated on arrival, and all LLM access goes through one swappable interface — the provider SDK lives in a single file. Re-analyzing a letter replaces the previous result; there's no run-state to recover, because a failed run is simply re-run.

## Tech stack

Node · TypeScript (strict) · Express · React + Vite + Tailwind · Postgres (plain SQL migrations) · OpenAI structured output · Vitest (heaviest coverage on the grounding logic) · deployed on Railway, Dockerfile included.

## Running locally

Needs Node 20+ and Docker (for the dev Postgres).

```bash
npm install
cp .env.example .env          # DATABASE_URL, OPENAI_API_KEY, LLM_PROVIDER, LLM_MODEL
docker compose up -d          # Postgres 16
npm run db:migrate && npm run db:seed
npm run dev
```

Source documents are real, public DHCS APLs, cleaned to plain text. One of them deliberately contains a plausible obligation the letter never actually states — so you can watch the tool *abstain* instead of inventing it.

## Limitation

Catching *every* requirement in a long letter is hard. Verification guarantees precision — what's shown is provably in the source — but not recall: one big extraction call over 30 pages can still miss an obligation. The next step would be to feed the letter to the model in chunks and extract per chunk, so no section gets skimmed; grounding would verify each chunk's citations exactly as it does now.

---
