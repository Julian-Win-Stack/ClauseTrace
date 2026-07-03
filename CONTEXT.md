# ClauseTrace — Context

The domain language of ClauseTrace. Its one job is turning a regulatory letter into
source-verified requirements, so the words for *how much we trust a claim* carry the weight.
The four trust categories (grounded / abstained / excluded / generated) are defined in
`CLAUDE.md`; this file sharpens the terms around how a citation earns and keeps that trust.

## Language

**Verification**:
The deterministic, code-only check that a cited quote exists (near-)verbatim in the
canonical `full_text`. It alone decides the grounded-vs-excluded trust status.
_Avoid_: fact-check, validation.

**Faithfulness check**:
An advisory LLM judgment of whether an already-verified quote actually *supports* the
AI's paraphrased requirement. It is generated content — it may flag a requirement for
review but can never change its trust status.
_Avoid_: fact-check, fact-checking.

**Span**:
A single contiguous verbatim quote from the source, carrying its own offsets. A single
requirement may cite one span (contiguous evidence) or several (evidence split across the
letter). Each span is verified independently.
_Avoid_: match, snippet, chunk.
