import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../server/src/db/pool.js';

interface AplMetadata {
  apl_number: string;
  title: string;
  issued_date: string | null;
  source_url: string | null;
}

const dataDir = path.dirname(fileURLToPath(import.meta.url));

async function seed(): Promise<void> {
  const metaRaw = await readFile(
    path.join(dataDir, 'apls', 'metadata.json'),
    'utf8',
  );
  const metas: AplMetadata[] = JSON.parse(metaRaw);
  if (metas.length === 0) {
    console.log('data/apls/metadata.json is empty — nothing to seed');
    return;
  }

  for (const meta of metas) {
    const fullText = await readFile(
      path.join(dataDir, 'apls', `${meta.apl_number}.txt`),
      'utf8',
    );

    const existing = await pool.query<{ id: number; full_text: string }>(
      'SELECT id, full_text FROM apls WHERE apl_number = $1',
      [meta.apl_number],
    );

    const row = existing.rows[0];
    if (!row) {
      await pool.query(
        `INSERT INTO apls (apl_number, title, issued_date, source_url, full_text, char_length, is_adhoc)
         VALUES ($1, $2, $3, $4, $5, $6, FALSE)`,
        [
          meta.apl_number,
          meta.title,
          meta.issued_date,
          meta.source_url,
          fullText,
          fullText.length,
        ],
      );
      console.log(`inserted ${meta.apl_number}`);
    } else if (row.full_text !== fullText) {
      // Changed source text invalidates stored offsets — clear the analysis.
      await pool.query('DELETE FROM requirements WHERE apl_id = $1', [row.id]);
      await pool.query(
        `UPDATE apls
         SET title = $2, issued_date = $3, source_url = $4, full_text = $5,
             char_length = $6, summary = NULL, analyzed_at = NULL
         WHERE id = $1`,
        [
          row.id,
          meta.title,
          meta.issued_date,
          meta.source_url,
          fullText,
          fullText.length,
        ],
      );
      console.log(
        `updated ${meta.apl_number} (text changed, analysis cleared)`,
      );
    } else {
      await pool.query(
        `UPDATE apls SET title = $2, issued_date = $3, source_url = $4 WHERE id = $1`,
        [row.id, meta.title, meta.issued_date, meta.source_url],
      );
      console.log(`unchanged ${meta.apl_number}`);
    }
  }
}

seed()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
