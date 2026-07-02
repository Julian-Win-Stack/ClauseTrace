import { pool } from './pool.js';
import type { ClassifiedRequirement } from '../pipeline/classifyRequirement.js';

export interface AplListItem {
  id: number;
  apl_number: string | null;
  title: string;
  issued_date: string | null;
  is_adhoc: boolean;
  analyzed: boolean;
  created_at: string;
}

export interface AplRow {
  id: number;
  apl_number: string | null;
  title: string;
  issued_date: string | null;
  source_url: string | null;
  full_text: string;
  char_length: number;
  is_adhoc: boolean;
  summary: string | null;
  analyzed_at: string | null;
}

export interface ActionItemDto {
  text: string;
  suggested_owner_department: string;
  priority: 'high' | 'medium' | 'low';
}

export interface RequirementDto {
  ordinal: number;
  requirement_text: string;
  source_quote: string | null;
  status: 'grounded' | 'abstained' | 'excluded';
  verification_method: 'exact' | 'normalized' | 'none';
  source_start_offset: number | null;
  source_end_offset: number | null;
  impacted_departments: string[];
  action_items: ActionItemDto[];
}

export interface AnalysisDto {
  summary: string | null;
  analyzed_at: string | null;
  requirements: RequirementDto[];
}

export async function listApls(): Promise<AplListItem[]> {
  const { rows } = await pool.query<AplListItem>(
    `SELECT id, apl_number, title, issued_date, is_adhoc,
            analyzed_at IS NOT NULL AS analyzed, created_at
     FROM apls
     ORDER BY is_adhoc ASC, apl_number DESC NULLS LAST, created_at DESC`,
  );
  return rows;
}

export async function getApl(id: number): Promise<AplRow | null> {
  const { rows } = await pool.query<AplRow>(
    `SELECT id, apl_number, title, issued_date, source_url, full_text,
            char_length, is_adhoc, summary, analyzed_at
     FROM apls WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function createAdhocApl(
  text: string,
  title: string,
): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO apls (title, full_text, char_length, is_adhoc)
     VALUES ($1, $2, $3, TRUE) RETURNING id`,
    [title, text, text.length],
  );
  const row = rows[0];
  if (!row) throw new Error('insert returned no row');
  return row.id;
}

interface RequirementRow {
  id: number;
  ordinal: number;
  requirement_text: string;
  source_quote: string | null;
  status: 'grounded' | 'abstained' | 'excluded';
  verification_method: 'exact' | 'normalized' | 'none';
  source_start_offset: number | null;
  source_end_offset: number | null;
  impacted_departments: string[];
}

export async function getAnalysis(aplId: number): Promise<AnalysisDto | null> {
  const apl = await pool.query<{
    summary: string | null;
    analyzed_at: string | null;
  }>('SELECT summary, analyzed_at FROM apls WHERE id = $1', [aplId]);
  const aplRow = apl.rows[0];
  if (!aplRow || aplRow.analyzed_at === null) return null;

  const reqs = await pool.query<RequirementRow>(
    `SELECT id, ordinal, requirement_text, source_quote, status,
            verification_method, source_start_offset,
            source_end_offset, impacted_departments
     FROM requirements WHERE apl_id = $1 ORDER BY ordinal`,
    [aplId],
  );
  const items = await pool.query<ActionItemDto & { requirement_id: number }>(
    `SELECT ai.requirement_id, ai.text, ai.suggested_owner_department, ai.priority
     FROM action_items ai
     JOIN requirements r ON r.id = ai.requirement_id
     WHERE r.apl_id = $1
     ORDER BY ai.id`,
    [aplId],
  );

  const itemsByRequirement = new Map<number, ActionItemDto[]>();
  for (const item of items.rows) {
    const list = itemsByRequirement.get(item.requirement_id) ?? [];
    list.push({
      text: item.text,
      suggested_owner_department: item.suggested_owner_department,
      priority: item.priority,
    });
    itemsByRequirement.set(item.requirement_id, list);
  }

  return {
    summary: aplRow.summary,
    analyzed_at: aplRow.analyzed_at,
    requirements: reqs.rows.map((r) => ({
      ordinal: r.ordinal,
      requirement_text: r.requirement_text,
      source_quote: r.source_quote,
      status: r.status,
      verification_method: r.verification_method,
      source_start_offset: r.source_start_offset,
      source_end_offset: r.source_end_offset,
      impacted_departments: r.impacted_departments,
      action_items: itemsByRequirement.get(r.id) ?? [],
    })),
  };
}

/**
 * Persist an analysis, REPLACING any previous one for this APL: delete its
 * requirements (action items cascade), insert the new set, update the
 * summary. One transaction — a failed save leaves the old analysis intact.
 */
export async function saveAnalysis(
  aplId: number,
  summary: string,
  requirements: ClassifiedRequirement[],
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM requirements WHERE apl_id = $1', [aplId]);
    for (const [index, req] of requirements.entries()) {
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO requirements
           (apl_id, ordinal, requirement_text, source_quote, status,
            verification_method, source_start_offset,
            source_end_offset, impacted_departments)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          aplId,
          index + 1,
          req.requirement_text,
          req.source_quote,
          req.status,
          req.verification_method,
          req.source_start_offset,
          req.source_end_offset,
          JSON.stringify(req.impacted_departments),
        ],
      );
      const requirementId = inserted.rows[0]?.id;
      if (requirementId === undefined)
        throw new Error('insert returned no row');
      for (const item of req.action_items) {
        await client.query(
          `INSERT INTO action_items
             (requirement_id, text, suggested_owner_department, priority)
           VALUES ($1, $2, $3, $4)`,
          [
            requirementId,
            item.action_item_text,
            item.suggested_owner_department,
            item.priority,
          ],
        );
      }
    }
    await client.query(
      'UPDATE apls SET summary = $2, analyzed_at = now() WHERE id = $1',
      [aplId, summary],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
