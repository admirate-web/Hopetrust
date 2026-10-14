// Reads an uploaded CSV or Excel file into a grid of cell text, in the
// browser. SheetJS loads only when someone imports a file.

/** Files over this are refused before they're read. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export async function readSpreadsheet(file: File): Promise<string[][]> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error('This file is over 5 MB. Split it into smaller files.');
  const isCsv = /\.csv$/i.test(file.name);
  if (!isCsv && !/\.xlsx$/i.test(file.name)) throw new Error('Choose a .csv or .xlsx file.');

  const XLSX = await import('xlsx');
  const workbook = isCsv
    ? // Read CSV as text: the browser decodes UTF-8, so Hindi and Telugu names survive.
      XLSX.read(await file.text(), { type: 'string', raw: true })
    : XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
  const first = workbook.SheetNames[0];
  if (!first) return [];
  return XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[first], {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
  });
}
