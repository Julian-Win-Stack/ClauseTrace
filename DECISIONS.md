# DECISIONS.md — Scope & the reasoning behind it

ClauseTrace v1 deliberately leaves several capabilities out. None of these is an oversight or a "we ran out of time" gap — each is a considered engineering choice that makes the product **more** trustworthy, not less. This document records what we chose not to build, why, and the conditions under which we'd revisit it.

The through-line: this product's entire value rests on one guarantee — *a requirement presented as trusted traces back, character-for-character, to text that provably exists in the source.* Every decision below is measured against that guarantee. Anything that would quietly weaken it is out, even when it's the fashionable thing to add.

---

## 1. No matching of requirements against internal policies (P&Ps)

**Decision:** ClauseTrace extracts what a letter *requires* and names the coarse **functional area(s)** each requirement impacts. It does **not** check those requirements against a health plan's own Policies & Procedures to tell you whether you're already compliant.

**Why:**
- Matching to internal policies would require a corpus of that organization's **private internal documents** — which we do not have and cannot get for a general tool. There is nothing to match against.
- Faking it with dummy policy data would be theater. It would produce confident-looking "you're covered / you have a gap" verdicts backed by nothing real, which is exactly the kind of unearned confidence this product exists to avoid. In a compliance setting, a fabricated "you're compliant" is worse than silence.
- It is a **fundamentally different problem** from our core. Grounded extraction from a single public document is about *precision against one known text*. Policy matching is *retrieval and comparison across a large private corpus* — different data, different infrastructure, different failure modes.
- Coarse **impacted departments** are genuinely inferable from the letter's language, so we keep them. Matching to *specific* internal policies is what's excluded — we don't blur "this touches Utilization Management" (inferable) with "this conflicts with your UM Policy 4.2" (unknowable without your files).

**When we'd revisit:** as a separate, opt-in product surface where a customer supplies their own P&P corpus. That is the one place RAG would be warranted (see §2) — searching across *many* private documents. It is out of scope here by design, not by accident.

---

## 2. No RAG, no vector database, no embeddings

**Decision:** The whole APL goes into the model's context. There is no chunking-for-retrieval, no embeddings model, and no vector store anywhere in the codebase.

**Why:**
- **Retrieval solves a problem we don't have.** RAG exists to work around a knowledge base too large to fit in context. A single APL — even a long one — fits comfortably in a modern model's context window. There is nothing to retrieve *from*; the whole document is already in front of the model.
- **On a single cross-referenced regulation, chunking actively hurts accuracy.** Requirements in a regulation depend on each other — a rule in one section leans on a definition, exception, or condition stated in another. Splitting the document to retrieve fragments risks **severing those cross-references**, so the model reasons over an incomplete picture. That *lowers* accuracy — the exact failure mode this product must avoid.
- **It would add infrastructure and new failure modes for zero benefit**: an embeddings pipeline, a vector store to run and keep in sync, chunk-boundary tuning, and retrieval-quality bugs — all to make the system *worse* at its one job.
- Adding RAG here would be **cargo-culting a popular pattern** into a place it doesn't fit. Deliberately *not* using it is the correct engineering judgment, and we state it plainly so no future contributor "adds retrieval" thinking it's an obvious win.

**When we'd revisit:** only when the task becomes searching across *many* documents — e.g. the excluded P&P-matching feature in §1. For single-document analysis, retrieval stays out permanently.

---

## 3. No live PDF upload / parsing in v1

**Decision:** Source documents are cleaned to plain text **offline** and seeded into the database. There is no in-app PDF upload or parser. A paste box handles ad-hoc text.

**Why:**
- **Parsing a PDF is easy; parsing it *faithfully* is hard — and faithful is the only kind this product can use.** Getting *some* text out of a PDF is trivial. Getting text that matches the original **character-for-character** is not.
- Real government PDFs fight you: they inject headers, footers, and page numbers mid-sentence; use multi-column layouts that scramble reading order; collapse tables into unusable runs of text; hyphenate words across line breaks; and carry ligatures, smart quotes, and odd whitespace. Scanned PDFs contain **no extractable text at all** and need OCR.
- Our trust guarantee depends on the stored source text matching the citation exactly. **A dirty parse silently breaks verification**: a genuine requirement's verbatim quote won't be found in the mangled text, so it gets wrongly rejected into *Excluded*. The tool would look like it's working while quietly discarding real obligations.
- On a **live upload there's no chance to inspect** the extracted text before it poisons the analysis. Pre-cleaning a controlled set offline lets us verify fidelity once, up front, and guarantees reliable citations from then on.

**When we'd revisit:** v2, as a deliberate ingestion pipeline with a validation/inspection step (and OCR for scanned docs) — *not* a parser bolted onto the upload path. Robust, inspectable ingestion is its own project, and it deserves to be treated as one. Until then, the paste box covers ad-hoc input without a parser.

---

## 4. No tables, figures, or images (text only)

**Decision:** v1 grounds against plain text only. Tables, figures, and images in source documents are not interpreted.

**Why:**
- **Regulatory tables don't linearize cleanly.** Timeframe grids, thresholds, and matrices lose their row/column meaning when flattened to a line of text, which would produce unreliable citations and offsets — the opposite of what grounding needs.
- **Figures and images contain no text to ground against.** There is nothing for the verification layer to match a citation to.
- Handling either *well* requires structure-aware parsing and OCR — the same class of work deferred in §3 — which is out of scope for a v1 focused squarely on the grounding core.

**Acknowledged limitation:** a requirement expressed **only** inside a table may be missed. This is stated honestly in the README's Limitations section rather than hidden.

**When we'd revisit:** alongside the faithful-ingestion work in §3, with structure-aware extraction that preserves table semantics well enough to cite reliably.

---

## 5. No fuzzy / similarity-based citation matching

**Decision:** A `source_quote` is verified only when **every character corresponds to the source text** — either verbatim (`exact`) or after unifying whitespace runs, typographic quotes/dashes, and case (`normalized`). There is no similarity-scored fallback tier. Anything less than a full-content match is rejected into the visible *Excluded* list.

**Why:**
- **Similarity thresholds structurally fail on long quotes.** A changed number ("thirty (30)" → "sixty (60)"), a dropped "not", or a swapped modal ("must" → "may") alters a fixed, tiny part of a quote, while the similarity denominator grows with quote length. Measured on the initial implementation: a 51-word quote with only its deadline changed scored **0.94** against a 0.9 threshold — *verified*. Raising the bar doesn't help: at 0.95, a 77-word mutated quote scored **0.959** — still verified. Every fixed threshold has a quote length beyond which an altered obligation gets certified.
- **That failure is invisible by construction.** A falsely *rejected* real quote lands in Excluded, on screen, where a human catches it. A falsely *accepted* fake quote looks exactly like a verified one — green badge, citation, highlight — and can only be caught by someone who already knows the source. In compliance, that's a plan building its process around a deadline the regulation doesn't say.
- **The asymmetry decides it.** The cost of strictness is that a genuine quote with a transcription slip gets excluded — visible, auditable, recoverable by re-running. The cost of leniency is a certified falsehood. The product's one promise is that the green badge cannot lie; strictness is the only side of the trade that keeps the promise.
- The normalized tier keeps the *harmless* variance (line wraps, curly quotes, case) from flooding Excluded — it is still a full character-correspondence check, not a score.

**When we'd revisit:** only with a mechanism that preserves the guarantee — e.g., an edit-distance tier that additionally requires exact agreement on load-bearing tokens (numbers, negations, modals) — and only if real APLs show the strict tiers rejecting an unacceptable share of genuine quotes. A plain similarity score never comes back.

---

## The shape of these decisions

Read together, the exclusions aren't a list of missing features — they're a boundary drawn on purpose around a single, defensible core: **grounded extraction from one faithful source text.** We kept what strengthens that guarantee (coarse impacted departments, whole-document context, pre-verified source text) and cut what would quietly undermine it (fake policy matching, retrieval that severs cross-references, dirty parses, unlinearizable tables). Each cut has a revisit condition, so the scope is a starting line, not a ceiling.
