CREATE TABLE apls (
  id SERIAL PRIMARY KEY,
  apl_number TEXT,
  title TEXT NOT NULL,
  issued_date DATE,
  source_url TEXT,
  full_text TEXT NOT NULL,
  char_length INT NOT NULL,
  is_adhoc BOOLEAN NOT NULL DEFAULT FALSE,
  summary TEXT,
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per real APL number; ad-hoc pasted docs have apl_number NULL.
CREATE UNIQUE INDEX apls_apl_number_key ON apls (apl_number)
  WHERE apl_number IS NOT NULL;

CREATE TABLE requirements (
  id SERIAL PRIMARY KEY,
  apl_id INT NOT NULL REFERENCES apls (id) ON DELETE CASCADE,
  ordinal INT NOT NULL,
  requirement_text TEXT NOT NULL,
  source_quote TEXT,
  source_start_offset INT,
  source_end_offset INT,
  status TEXT NOT NULL CHECK (status IN ('grounded', 'abstained', 'excluded')),
  verification_method TEXT NOT NULL
    CHECK (verification_method IN ('exact', 'normalized', 'none')),
  impacted_departments JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX requirements_apl_id_idx ON requirements (apl_id);

CREATE TABLE action_items (
  id SERIAL PRIMARY KEY,
  requirement_id INT NOT NULL REFERENCES requirements (id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  suggested_owner_department TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX action_items_requirement_id_idx ON action_items (requirement_id);
