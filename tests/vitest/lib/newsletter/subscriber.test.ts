import { describe, it, expect } from 'vitest';
import {
  KNOWN_NOTICE_VERSIONS,
  SIGNUP_NOTICE,
  isValidEmail,
  nameSchema,
  normaliseEmail,
  signupSchema,
} from '@/lib/newsletter/subscriber';

describe('normaliseEmail', () => {
  it('trims and lower-cases, the way the database stores addresses', () => {
    expect(normaliseEmail('  Asha.Rao@Example.COM ')).toBe('asha.rao@example.com');
  });
});

describe('isValidEmail', () => {
  it.each(['asha@example.com', 'a.b+news@sub.example.co.in', ' Asha@Example.com '])('accepts %s', (value) => {
    expect(isValidEmail(value)).toBe(true);
  });

  it.each(['', 'asha', 'asha@', '@example.com', 'asha rao@example.com', 'asha@example', null, 42])(
    'rejects %s',
    (value) => {
      expect(isValidEmail(value)).toBe(false);
    },
  );

  it('accepts 254 characters and rejects 255', () => {
    expect(isValidEmail(`${'a'.repeat(64)}@${'b'.repeat(185)}.com`)).toBe(true);
    expect(isValidEmail(`${'a'.repeat(64)}@${'b'.repeat(186)}.com`)).toBe(false);
  });
});

describe('signupSchema', () => {
  const valid = { full_name: '  Asha Rao ', email: ' Asha@Example.com', page: '/blogs/', notice: '2026-10' };

  it('trims the name and normalises the email', () => {
    const parsed = signupSchema.parse(valid);
    expect(parsed.full_name).toBe('Asha Rao');
    expect(parsed.email).toBe('asha@example.com');
    expect(parsed.page).toBe('/blogs/');
  });

  it('keeps Hindi, Telugu and emoji in names exactly as typed', () => {
    expect(signupSchema.parse({ ...valid, full_name: 'आशा రావు 🌿' }).full_name).toBe('आशा రావు 🌿');
  });

  it('asks for a name of at least two characters', () => {
    const result = signupSchema.safeParse({ ...valid, full_name: 'A' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ path: ['full_name'], message: 'Please enter your full name' });
  });

  it('asks for an email address before complaining about its format', () => {
    const result = signupSchema.safeParse({ ...valid, email: '   ' });
    expect(result.error?.issues[0]).toMatchObject({ path: ['email'], message: 'Please enter your email address' });
  });

  it('falls back to "/" for a page path that is not a site path', () => {
    expect(signupSchema.parse({ ...valid, page: 'javascript:alert(1)' }).page).toBe('/');
    expect(signupSchema.parse({ ...valid, page: undefined }).page).toBe('/');
  });

  // The database can't store \u0000, and no name needs control characters or
  // half of a surrogate pair. Refusing them here keeps the server's answer
  // the same for every address.
  it.each([
    ['NUL', 'Asha\u0000Rao'],
    ['a tab', 'Asha\tRao'],
    ['DEL', 'Asha\u007FRao'],
    ['a C1 control character', 'Asha\u0085Rao'],
    ['a lone high surrogate', 'Asha \uD83C'],
    ['a lone low surrogate', '\uDF3F Asha'],
    ['a high surrogate before a high surrogate', 'Asha \uD83C🌿'],
  ])('refuses a name with %s', (_label, full_name) => {
    const result = signupSchema.safeParse({ ...valid, full_name });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      path: ['full_name'],
      message: "Your name has a character we can't save. Please type it again.",
    });
    expect(nameSchema.safeParse(full_name).success).toBe(false);
  });

  it.each([
    ['NUL', '/blogs/\u0000'],
    ['a C1 control character', '/blogs/\u0085'],
    ['a lone surrogate', '/blogs/\uD83C'],
  ])('refuses a page path with %s instead of replacing it', (_label, page) => {
    const result = signupSchema.safeParse({ ...valid, page });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ path: ['page'], message: 'Please reload the page and try again.' });
  });

  it('lets the honeypot field be left out', () => {
    expect(signupSchema.parse(valid).website).toBeUndefined();
  });
});

describe('SIGNUP_NOTICE', () => {
  it('is a version the sign-up function accepts', () => {
    expect(KNOWN_NOTICE_VERSIONS).toContain(SIGNUP_NOTICE.version);
  });
});
