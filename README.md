# ClauseTrace

**Turn a dense regulatory letter into a source-verified list of what it requires — every requirement traceable to the exact text that proves it.**

California managed-care health plans must comply with a stream of DHCS *All Plan Letters* (APLs): 5–30 pages of dense, cross-referenced legal language each. Compliance teams read every new letter by hand to answer one question — *what does this require us to do, and who's affected?* ClauseTrace does that in 1-3 minutes.

The hard part isn't summarizing. It's trust: in compliance, a made-up requirement is worse than no answer at all. So the whole design follows one rule — **the model is never trusted on its word.**

Live url: https://server-production-8408.up.railway.app/ 
Loom demo: https://www.loom.com/share/8850f9b1576746d5ae759481c3f1c194 

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

One analysis = **segment the letter → extract each piece in parallel → merge → deterministic grounding → a per-requirement faithfulness check → return.** The app is stateless: paste or upload a letter, analyze it, read/export the result. Nothing is stored.

### Why the letter is read in pieces

The first version made one big extraction call over the whole letter. It worked, but it *skimmed*: on a 30-page letter, a single pass reliably missed one to three real requirements — usually ones buried mid-section. Verification guarantees we never show a *fabricated* requirement, but it can't recover one the model never mentioned. That's a **recall** gap, and the fix is to stop asking the model to hold 30 pages in its head at once.

So extraction now runs in two stages:

1. **Segment (1 LLM call).** One call returns the plain-language summary plus 5–10 short, *verbatim* "boundary markers" — snippets that mark where the letter shifts topic. The model only *proposes* where the seams are; it never hands us text we trust.
2. **Tile (deterministic code, no LLM).** Plain code finds each marker in the source (reusing the very same `verifyQuote` used for grounding) and slices the letter into contiguous **pieces** that cover it end to end — no gaps, no overlaps. If a marker can't be found or comes back out of order, that piece simply merges with its neighbor. This is the key move: **a bad boundary can never lose a requirement, because every character of the letter still lands in exactly one piece.**
3. **Extract per piece (1 LLM call each, in parallel).** Each piece gets its own extraction call. Every call sees the whole letter for context but is told to extract *only* the requirements whose obligation actually starts in its piece — so neighboring pieces don't fight over the same sentence. The results merge into one flat list and flow through the rest of the pipeline unchanged.

The cost is more LLM calls per analysis (1 + one per piece); the payoff is that no section gets skimmed. Rate limits aren't a constraint here, so it's a good trade. (Full rationale: [`docs/adr/0001-segmented-extraction.md`](docs/adr/0001-segmented-extraction.md).)

### The pipeline

```
Browser (React + Tailwind)
   │  JSON / HTTP
   ▼
Express API
   1. Segment    one LLM call → summary + verbatim boundary markers
   2. Tile       code slices full_text into gap-free, contiguous pieces (no LLM)
   3. Extract    one parallel LLM call per piece → requirements, quotes, departments, draft action items
   4. Ground     code verifies each quote exists (exact, or whitespace/punctuation-normalized) — decides trust
   5. Classify   route each requirement → grounded / abstained / excluded
   6. Review     second LLM call flags any paraphrase that overreaches its quotes (advisory)
   ▼
JSON result → browser (nothing persisted)
```

All model output is schema-validated on arrival, and all LLM access goes through one swappable interface — the provider SDK lives in a single file. There's no database and no run-state to recover: a failed run is simply re-run, and exporting the checklist is how a result is kept.

## Measuring recall (the eval harness)

Verification proves *precision* — everything shown is provably in the source. It says nothing about *recall*: did we catch every requirement, or quietly miss some? To measure that, the repo ships a small eval harness (`npm run eval`).

The idea is to grade by **where the app points, not how it words things.** For each letter, a hand-written answer key pins every real requirement to a verbatim span of the cleaned source text (kept as fixtures in `data/apls/`; each eval run POSTs one to the API and grades the fresh result). The app's citations already carry verified character offsets into that same text, so grading is pure offset overlap — the model's wording wobbles run to run, but the document's positions don't move. Each key item lands in one bucket:

- **found** — the app pointed at that span. ✅
- **missed** — nothing pointed there; the model never extracted it. *This is the recall gap.*
- **excluded** — the app *did* point there, but grounding rejected its quote (a grounding issue, not recall).
- **extra** — the app flagged a requirement the key doesn't have: an over-split, a precision miss, or a real requirement the key author forgot.

The output is a recall score plus a self-contained HTML report that highlights missed (🔴) and extra (🔵) spans right inside the document. This is the tool that told us the single-call version was skimming — and the same tool that says the chunked version still isn't perfect. (Details: [`eval/README.md`](eval/README.md).)

## Current accuracy — and what this project is

**The requirement lists this produces are not accurate yet, and that's a deliberate stopping point.**

Chunking closed the *structural* recall gap — no section of the letter goes unread anymore. What's left is a *judgement* gap. The model still drops **borderline requirements**: sentences a compliance expert might reasonably call an obligation, or might reasonably call background context. Deciding those correctly takes real DHCS domain knowledge — knowing which "should"s the department treats as binding, which cross-references actually carry a duty, which recitals are just framing. That is exactly the kind of call this project is not trying to win.

Because **this is a demonstration of engineering judgement, not a product for real users.** The recall number could be pushed higher — the most direct lever is tuning the extraction prompt, and the eval harness above exists precisely to measure whether such a change helps. I've chosen not to chase it. The point of ClauseTrace is the architecture: a verification layer that makes it *impossible* for an ungrounded claim to be shown as trusted, an eval that measures the remaining gap honestly, and a chunking design where a bad boundary can never silently cost a requirement. A prompt-tuned recall score would prove less than the parts that are already here.

So read the output as: **everything shown green is provably in the source; the list may not yet be complete.**

## Tech stack

Node · TypeScript (strict) · Express · React + Vite + Tailwind · OpenAI structured output · Vitest (heaviest coverage on the grounding logic) · deployed on Railway, Dockerfile included. No database — the app is stateless.

## Running locally

Needs Node 20+.

```bash
npm install
cp .env.example .env          # OPENAI_API_KEY, LLM_PROVIDER, LLM_MODEL
npm run dev
```

Then paste a letter's text (or upload its PDF) and analyze. Cleaned real DHCS APLs live in `data/apls/` as eval fixtures — one of them deliberately contains a plausible obligation the letter never actually states, so you can watch the tool *abstain* instead of inventing it.
