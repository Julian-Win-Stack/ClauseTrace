-- Multi-span citations + advisory faithfulness. Re-analyzing replaces an
-- analysis, so dropping the old single-quote columns loses nothing.
ALTER TABLE requirements
  DROP COLUMN source_quote,
  DROP COLUMN source_start_offset,
  DROP COLUMN source_end_offset,
  DROP COLUMN verification_method,
  ADD COLUMN citations JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN faithfulness TEXT
    CHECK (faithfulness IN ('supported', 'needs_review')),
  ADD COLUMN faithfulness_reason TEXT;
