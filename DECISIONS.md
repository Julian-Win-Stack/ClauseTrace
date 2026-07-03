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

## 3. In-app PDF upload behind a mandatory human-review gate

**Decision:** The client can extract and clean a DHCS APL PDF **in the browser** (`client/src/lib/`, using `pdfjs-dist`) and drop the result into the paste box. That text is **provisional**: it becomes the canonical `full_text` only after the user reviews/edits it and clicks *Add document*. Offline seeding (`data/seed.ts`) and the paste box remain; PDF upload is a third, review-gated on-ramp. No server upload path, no OCR.

**Why this shape — and not a parser bolted straight onto the upload path:**
- **Parsing a PDF is easy; parsing it *faithfully* is hard — and faithful is the only kind this product can use.** Getting *some* text out of a PDF is trivial. Getting text that matches the original **character-for-character** is not.
- Real government PDFs fight you: they inject headers, footers, and page numbers mid-sentence; use multi-column layouts; hyphenate words across line breaks; and carry ligatures, smart quotes, and odd whitespace. Scanned PDFs contain **no extractable text at all** and need OCR.
- Our trust guarantee depends on the stored source text matching the citation exactly. **A dirty parse silently breaks verification**: a genuine requirement's verbatim quote won't be found in mangled text, so it gets wrongly rejected into *Excluded* — the tool looks like it's working while quietly discarding real obligations.
- The original objection to live upload was that *"there's no chance to inspect the extracted text before it poisons the analysis."* **The review gate is the answer to that objection.** Extraction lands in the editable paste box, a human confirms fidelity, and only then does it become the source of record. A lossy parse is never trusted on its own.
- The cleaner is tuned to the **DHCS APL template, not a general PDF parser**: it classifies assembled lines by font size and position to drop the repeating page header and letterhead footer, strip inline footnote reference markers, and move footnotes to an appended section (`client/src/lib/assembleAplText.ts`). That line-assembly logic is **pure and unit-tested**; the pdfjs I/O is isolated in `cleanPdf.ts` and lazy-loaded so its payload never ships to view-only users.

**Still out of scope:** OCR for scanned documents (no text layer → the cleaner reports empty and asks the user to paste manually), and structure-aware **table** extraction (§4). Both remain their own projects.

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

## 6. Multi-span citations — a requirement may cite several contiguous quotes

**Decision:** A requirement's supporting evidence is no longer a single contiguous quote. The model may return an **array of verbatim spans**, each verified independently against `full_text`. Grounding is **all-or-nothing**: a requirement is grounded only if *every* span verifies; if even one span fails, the whole requirement is Excluded. There is no cap on the number of spans and no minimum span length.

**Why:**
- **Real regulations split one obligation across separated passages.** On APL 24-009, a genuine requirement's support lived in two paragraphs with an unrelated paragraph in between. Forcing a *single* contiguous quote pushed the model to **glue the two halves into one string** — a string that does not exist verbatim in the source — so verification correctly rejected it and a real requirement landed in Excluded. The evidence was real; the single-quote constraint was the problem.
- **It relaxes *how many* quotes evidence can span, not *how* a quote earns trust.** Every span still must appear (near-)verbatim, decided by the same deterministic verifier (§5). Letting the model return each true passage as its own span means each is checked on its own terms instead of being forced into one illegal concatenation.
- **All-or-nothing keeps the guarantee strict.** A requirement is only as trustworthy as its weakest span. If any cited span can't be found, we don't ground "most of it" — we exclude the whole requirement, visibly, exactly as before. Partial grounding is never allowed.

**When we'd revisit:** if real APLs show the model grounding on garbage fragments (many tiny spans stitched together to fake coverage), we'd add a minimum span length or a span cap. Both are deliberately left off until a real document demonstrates the need.

---

## 7. A second, advisory LLM pass — the faithfulness check

**Decision:** After grounding, a separate LLM call judges, per grounded requirement, whether the verified quote(s) actually **support the AI's paraphrase** of that requirement — every obligation, number, scope, and deadline in the paraphrase must be backed by the quotes. The verdict is `supported` or `needs_review` (with a specific reason on `needs_review`). It is **advisory only**: it can raise a ⚠ review flag but **can never change trust status or hide the green "Verified" badge.**

**Why:**
- **Verification and faithfulness catch different failures.** Verification (§5) is deterministic and asks only *does this quote exist in the source?* — it is blind to meaning. A quote can be 100% real and still be *described* wrongly: the model can attach a genuine quote to a paraphrase that overstates it (inventing a deadline, a duty, or a scope the quote doesn't state). Verification cannot see that gap; only a meaning-level check can. This is the *grounded-but-unfaithful* case — real citation, drifted description — and nothing else in the pipeline catches it.
- **It must never decide trust.** Trust is decided by deterministic code, never by a model — the product's core invariant. So the faithfulness check is deliberately kept *outside* the trust decision: it is generated/advisory content, styled and stored as such. It flags for a human; it never green-lights or red-lights. This preserves the guarantee that a model's opinion cannot promote a requirement into trust or demote one out of it.
- **Non-critical by design.** The check runs only on already-grounded requirements, one call each, fanned out in parallel. If it fails (LLM error, malformed output), the requirement stays grounded with no verdict and the failure degrades to a `warnings[]` entry — it never fails the run. An advisory layer must not be able to take down the pipeline or the trust it sits beside.

**When we'd revisit:** the check is one model's judgment and can itself err — miss a real drift, or over-flag a faithful paraphrase. If flag quality proves unreliable on real APLs, we'd tighten the prompt, add a second judge, or require agreement between judges. It stays advisory in every case: it will never become a gate on the green badge, which remains the deterministic verifier's job alone.

---

## The shape of these decisions

Read together, these decisions aren't a list of missing features — they're a boundary drawn on purpose around a single, defensible core: **grounded extraction from one faithful source text.** We kept what strengthens that guarantee (coarse impacted departments, whole-document context, a human-reviewed source text) and cut what would quietly undermine it (fake policy matching, retrieval that severs cross-references, *unreviewed* parses trusted as source, unlinearizable tables). PDF ingestion is allowed precisely because it's gated on human review rather than trusted blindly (§3). Each cut has a revisit condition, so the scope is a starting line, not a ceiling.
