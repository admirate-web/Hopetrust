import { describe, it, expect } from 'vitest';
import { chunk, cleanRows, extractEmail, guessColumns, pickColumns, splitHeader } from '@/lib/newsletter/import';

describe('extractEmail', () => {
  it('takes the address out of "Name <address>" and mailto: links, normalised', () => {
    expect(extractEmail('Asha Rao <Asha@Example.com>')).toBe('asha@example.com');
    expect(extractEmail('mailto:ravi@example.com')).toBe('ravi@example.com');
    expect(extractEmail('  plain@example.com ')).toBe('plain@example.com');
  });
});

describe('splitHeader', () => {
  it('uses the first row as headers and drops empty rows', () => {
    expect(splitHeader([['Email', 'Name'], ['', ''], ['a@example.com', 'Asha'], [null, undefined]])).toEqual({
      headers: ['Email', 'Name'],
      rows: [['a@example.com', 'Asha']],
    });
  });

  it('treats a first row with an address in it as data, naming the columns', () => {
    expect(splitHeader([['a@example.com', 'Asha'], ['b@example.com']])).toEqual({
      headers: ['Column A', 'Column B'],
      rows: [['a@example.com', 'Asha'], ['b@example.com', '']],
    });
  });

  it('copes with an empty sheet', () => {
    expect(splitHeader([])).toEqual({ headers: [], rows: [] });
  });
});

describe('guessColumns', () => {
  it('finds email and name headers', () => {
    expect(guessColumns({ headers: ['Phone', 'Full Name', 'E-mail'], rows: [] })).toEqual({ email: 2, name: 1 });
  });

  it('without an email header, picks the column holding the most addresses', () => {
    const sheet = { headers: ['Column A', 'Column B'], rows: [['Asha', 'a@example.com'], ['Ravi', 'b@example.com']] };
    expect(guessColumns(sheet)).toEqual({ email: 1, name: null });
  });
});

describe('cleanRows', () => {
  it('normalises, validates and de-duplicates, keeping the first row for an address', () => {
    const sheet = splitHeader([
      ['Email', 'Name'],
      [' Asha@Example.com ', 'Asha Rao'],
      ['not an email', 'Nobody'],
      ['asha@example.com', 'Asha again'],
      ['Ravi <ravi@example.com>', '  రవి  '],
      ['meena@example.com', ''],
    ]);
    expect(cleanRows(pickColumns(sheet, 0, 1))).toEqual({
      rows: [
        { email: 'asha@example.com', name: 'Asha Rao' },
        { email: 'ravi@example.com', name: 'రవి' },
        { email: 'meena@example.com', name: null },
      ],
      invalid: 1,
      duplicates: 1,
    });
  });

  it('cuts names at 200 characters without splitting an emoji', () => {
    const long = `${'a'.repeat(199)}🌿🌿`;
    const [row] = cleanRows([{ email: 'a@example.com', name: long }]).rows;
    expect(Array.from(row.name!)).toHaveLength(200);
    expect(row.name!.endsWith('🌿')).toBe(true);
  });

  it('drops a name the database could not store, as it drops a name that is not text', () => {
    const { rows } = cleanRows([
      { email: 'a@example.com', name: 'Asha\u0000Rao' },
      { email: 'b@example.com', name: 'Ravi \uD83C' },
      { email: 'c@example.com', name: 'Meena\u0085' },
      { email: 'd@example.com', name: 42 },
    ]);
    expect(rows).toEqual([
      { email: 'a@example.com', name: null },
      { email: 'b@example.com', name: null },
      { email: 'c@example.com', name: null },
      { email: 'd@example.com', name: null },
    ]);
  });

  it('counts anything that is not a row with a string email as invalid', () => {
    expect(cleanRows([{ email: 42 }, null, 'x', { name: 'No email' }])).toEqual({ rows: [], invalid: 4, duplicates: 0 });
    expect(cleanRows('not a list')).toEqual({ rows: [], invalid: 0, duplicates: 0 });
  });
});

describe('chunk', () => {
  it('splits into groups of 200 by default', () => {
    expect(chunk(Array.from({ length: 450 }, (_, i) => i)).map((c) => c.length)).toEqual([200, 200, 50]);
  });
});
