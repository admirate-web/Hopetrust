// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { MAX_IMPORT_BYTES, readSpreadsheet } from '@/lib/newsletter/read-spreadsheet';

describe('readSpreadsheet', () => {
  it('reads the first sheet of an .xlsx file as text, skipping blank rows', async () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([['Email', 'Name'], ['asha@example.com', 'Asha Rao'], [], ['ravi@example.com', 'రవి']]),
      'List',
    );
    const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    expect(await readSpreadsheet(new File([bytes], 'list.xlsx'))).toEqual([
      ['Email', 'Name'],
      ['asha@example.com', 'Asha Rao'],
      ['ravi@example.com', 'రవి'],
    ]);
  });

  it('reads a UTF-8 CSV, with or without a byte-order mark, keeping Hindi and Telugu names', async () => {
    const csv = '﻿Email,Name\nasha@example.com,आशा\nravi@example.com,రవి\n';
    expect(await readSpreadsheet(new File([csv], 'list.csv', { type: 'text/csv' }))).toEqual([
      ['Email', 'Name'],
      ['asha@example.com', 'आशा'],
      ['ravi@example.com', 'రవి'],
    ]);
  });

  it('refuses files over 5 MB and files that are not .csv or .xlsx', async () => {
    await expect(readSpreadsheet(new File([new Uint8Array(MAX_IMPORT_BYTES + 1)], 'big.csv'))).rejects.toThrow(/5 MB/);
    await expect(readSpreadsheet(new File(['x'], 'list.pdf'))).rejects.toThrow(/\.csv or \.xlsx/);
  });
});
