// Turns an uploaded spreadsheet into newsletter rows (spec §7.4). The admin
// import dialog uses it to preview a file; the subscribers function runs
// cleanRows again on every row it receives.

import { LIMITS, hasUnsafeCharacters, isValidEmail, normaliseEmail } from './subscriber';

export interface ImportRow {
  email: string;
  name: string | null;
}

export interface CleanedRows {
  rows: ImportRow[];
  invalid: number;
  duplicates: number;
}

export interface Sheet {
  headers: string[];
  rows: string[][];
}

/** Rows per request to the subscribers function. */
export const IMPORT_CHUNK = 200;

const cellText = (cell: unknown) => (cell === null || cell === undefined ? '' : String(cell).trim());

function columnLetter(index: number): string {
  let letters = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  }
  return letters;
}

/** The address in "Name <address>" or "mailto:address", normalised. */
export function extractEmail(cell: string): string {
  const inAngles = /<([^<>]+)>/.exec(cell);
  return normaliseEmail((inAngles ? inAngles[1] : cell).replace(/^\s*mailto:/i, ''));
}

/**
 * Splits a grid into a header row and data rows, dropping empty rows. A first
 * row with an address in it is data, and the columns become "Column A"…
 */
export function splitHeader(grid: unknown[][]): Sheet {
  const cleaned = grid
    .map((row) => (Array.isArray(row) ? row.map(cellText) : []))
    .filter((row) => row.some((cell) => cell !== ''));
  if (cleaned.length === 0) return { headers: [], rows: [] };

  const width = Math.max(...cleaned.map((row) => row.length));
  const pad = (row: string[]) => [...row, ...Array<string>(width - row.length).fill('')];
  const firstIsData = cleaned[0].some((cell) => isValidEmail(extractEmail(cell)));
  if (firstIsData) {
    return { headers: Array.from({ length: width }, (_, i) => `Column ${columnLetter(i)}`), rows: cleaned.map(pad) };
  }
  return {
    headers: pad(cleaned[0]).map((header, i) => header || `Column ${columnLetter(i)}`),
    rows: cleaned.slice(1).map(pad),
  };
}

/** Best guess at the email and name columns. */
export function guessColumns(sheet: Sheet): { email: number; name: number | null } {
  const lower = sheet.headers.map((h) => h.toLowerCase().trim());
  let email = lower.findIndex((h) => /e-?mail/.test(h));
  if (email < 0) {
    // No header says "email": take the column with the most addresses in it.
    let best = -1;
    lower.forEach((_, col) => {
      const hits = sheet.rows.filter((row) => isValidEmail(extractEmail(row[col] ?? ''))).length;
      if (hits > best) {
        best = hits;
        email = col;
      }
    });
  }
  let name = lower.findIndex((h, i) => i !== email && /^(full\s*)?name$/.test(h));
  if (name < 0) name = lower.findIndex((h, i) => i !== email && /name/.test(h));
  return { email: Math.max(email, 0), name: name < 0 ? null : name };
}

/** The chosen columns of each data row. */
export function pickColumns(sheet: Sheet, emailCol: number, nameCol: number | null): Array<{ email: string; name: string }> {
  return sheet.rows.map((row) => ({ email: row[emailCol] ?? '', name: nameCol === null ? '' : row[nameCol] ?? '' }));
}

/** Normalises, validates and de-duplicates rows. The first row for an address wins. */
export function cleanRows(input: unknown): CleanedRows {
  const rows: ImportRow[] = [];
  const seen = new Set<string>();
  let invalid = 0;
  let duplicates = 0;
  for (const item of Array.isArray(input) ? input : []) {
    const fields = (item ?? {}) as { email?: unknown; name?: unknown };
    const email = typeof fields.email === 'string' ? extractEmail(fields.email) : '';
    if (!isValidEmail(email)) {
      invalid++;
      continue;
    }
    if (seen.has(email)) {
      duplicates++;
      continue;
    }
    seen.add(email);
    // Cut by characters, not UTF-16 units, so an emoji is never split in half.
    const name = typeof fields.name === 'string' ? Array.from(fields.name.trim()).slice(0, LIMITS.name).join('') : '';
    // A name the database can't store is dropped, like a name that isn't text.
    rows.push({ email, name: name && !hasUnsafeCharacters(name) ? name : null });
  }
  return { rows, invalid, duplicates };
}

export function chunk<T>(items: T[], size = IMPORT_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
