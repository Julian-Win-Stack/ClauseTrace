import type { KeyItem } from './types.js';

/**
 * Parse RFC-4180 CSV into rows of string fields. Handles quoted fields, ""
 * escapes, and commas / CR / LF *inside* quoted fields — regulatory quotes are
 * full of commas, so a naïve split(',') would shred them.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let started = false; // any content seen in the current record?

  const pushField = (): void => {
    row.push(field);
    field = '';
  };
  const pushRow = (): void => {
    pushField();
    rows.push(row);
    row = [];
    started = false;
  };

  // A spreadsheet may prepend a UTF-8 BOM; skip it.
  let start = 0;
  if (text.charCodeAt(0) === 0xfeff) start = 1;

  for (let i = start; i < text.length; i++) {
    const ch = text[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      started = true;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      started = true;
    } else if (ch === ',') {
      pushField();
      started = true;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      pushRow();
    } else {
      field += ch;
      started = true;
    }
  }
  // Flush a final record that didn't end in a newline.
  if (started || field.length > 0 || row.length > 0) pushRow();
  return rows;
}

export interface ParsedKey {
  items: KeyItem[];
  errors: string[];
}

/**
 * Read an answer-key CSV with `id` and `quote` columns into key items,
 * collecting every structural problem (missing columns, duplicate ids, empty
 * cells) so they surface loudly instead of silently dropping a requirement.
 */
export function parseKey(csvText: string): ParsedKey {
  const rows = parseCsv(csvText);
  if (rows.length === 0) return { items: [], errors: ['key file is empty'] };

  const header = (rows[0] as string[]).map((h) => h.trim().toLowerCase());
  const idCol = header.indexOf('id');
  const quoteCol = header.indexOf('quote');
  if (idCol === -1 || quoteCol === -1) {
    return {
      items: [],
      errors: [
        `header row must contain "id" and "quote" columns; got: ${header.join(', ')}`,
      ],
    };
  }

  const items: KeyItem[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r] as string[];
    const id = (cols[idCol] ?? '').trim();
    const quote = (cols[quoteCol] ?? '').trim();
    const line = r + 1; // 1-based file line for the human
    if (id === '' && quote === '') continue; // blank row
    if (id === '') {
      errors.push(`line ${line}: missing id`);
      continue;
    }
    if (quote === '') {
      errors.push(`line ${line}: id "${id}" has an empty quote`);
      continue;
    }
    if (seen.has(id)) {
      errors.push(`line ${line}: duplicate id "${id}"`);
      continue;
    }
    seen.add(id);
    items.push({ id, quote });
  }
  return { items, errors };
}
