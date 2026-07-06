# 1. Segmented per-piece requirement extraction

**Status:** accepted (2026-07-05)

## Context

A single open-ended LLM call over a whole APL misses 1-3 real requirements per letter
(recall gap measured by the eval's _missed_ bucket). SPEC §137 anticipated exactly this and
named the remedy: split extraction into focused, section-by-section calls. We needed a split
that raises recall without weakening the grounding guarantee and without letting the model
hand us document text as truth.

## Decision

Two stages. **Stage 1:** one LLM call returns the summary plus 5-10 short verbatim _boundary
markers_. Deterministic code locates the markers (reusing `verifyQuote`) and tiles the
document into contiguous _pieces_ covering it end-to-end. **Stage 2:** one parallel LLM call
per piece; each sees the whole letter for context and its own piece, and extracts only the
requirements whose obligation sentence starts in its piece. Results merge into one flat list
and flow through the existing grounding → trust-routing → sort → faithfulness → persist
pipeline, unchanged. Both stages are critical (classify → retry retryable → fail otherwise;
no partial results). The data model is unchanged.

## Alternatives considered

- **Code-only split** (cut on headings): deterministic, but brittle to pasted/oddly-formatted
  text. Rejected in favor of an LLM proposal fenced by code that guarantees coverage.
- **Model returns offsets or whole paragraphs:** models miscount offsets and mutate
  paragraphs. Rejected for short verbatim markers located by code.
- **Hard schema bound `minItems`/`maxItems` = 5-10:** OpenAI strict output may not enforce it.
  Made the count a prompt preference instead; coverage makes the exact count irrelevant.
- **Pin sampling for consistency:** gpt-5.5's Responses API rejects `temperature`/`seed`. Not
  available.
- **Build a de-duplicator now:** the ownership rule minimizes duplicates; the only safe
  dedup would need data we chose not to gather, and fuzzy matching is banned (DECISIONS §4).
  Residual duplicates are harmless to recall.

## Consequences

- Recall improves; boundary drift cannot cost recall because coverage is code-guaranteed.
- Duplicate requirements from boundary-straddling obligations may appear (eval _extra_
  bucket); accepted, harmless to recall.
- More LLM calls per analysis (1 + N). Acceptable — rate limits are not a constraint here.
- Run-to-run consistency is only indirectly helped; a full consistency effort is separate.
