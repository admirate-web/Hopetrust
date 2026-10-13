import { describe, it, expect } from 'vitest';
import {
  allowedImageUrl,
  esc,
  formatIssueDate,
  newsletterImagesBase,
  resolveHref,
  withUtm,
} from '@/lib/newsletter/render';

const SITE = 'https://hopetrustindia.com';
const IMAGES = 'https://abc.supabase.co/storage/v1/object/public/newsletter-images';

describe('esc', () => {
  it('escapes HTML special characters', () => {
    expect(esc(`<a href="x">Tom & Jerry's</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;',
    );
  });

  it('keeps emoji and Hindi or Telugu text as typed', () => {
    expect(esc('मन शांत है 🌿 మనసు')).toBe('मन शांत है 🌿 మనసు');
  });

  it('treats null and undefined as empty text', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
});

describe('formatIssueDate', () => {
  it.each([
    ['2026-10-13', '13th October, 2026'],
    ['2026-10-01', '1st October, 2026'],
    ['2026-10-02', '2nd October, 2026'],
    ['2026-10-03', '3rd October, 2026'],
    ['2026-10-11', '11th October, 2026'],
    ['2026-10-12', '12th October, 2026'],
    ['2026-10-22', '22nd October, 2026'],
    ['2026-12-31', '31st December, 2026'],
  ])('%s becomes %s', (input, expected) => {
    expect(formatIssueDate(input)).toBe(expected);
  });

  it('rejects anything that is not a YYYY-MM-DD date', () => {
    expect(() => formatIssueDate('13/10/2026')).toThrow(RangeError);
    expect(() => formatIssueDate('2026-13-01')).toThrow(RangeError);
    expect(() => formatIssueDate('')).toThrow(RangeError);
  });
});

describe('resolveHref', () => {
  it('keeps https, http, mailto and tel links', () => {
    expect(resolveHref('https://en.wikipedia.org/wiki/Rumi', SITE)).toBe('https://en.wikipedia.org/wiki/Rumi');
    expect(resolveHref('http://example.com/', SITE)).toBe('http://example.com/');
    expect(resolveHref('mailto:frontoffice@hopetrustindia.com', SITE)).toBe('mailto:frontoffice@hopetrustindia.com');
    expect(resolveHref('tel:+919000850001', SITE)).toBe('tel:+919000850001');
  });

  it('turns site-relative paths into full links', () => {
    expect(resolveHref('/blogs/x/', SITE)).toBe('https://hopetrustindia.com/blogs/x/');
    expect(resolveHref('/blogs/x/', `${SITE}/`)).toBe('https://hopetrustindia.com/blogs/x/');
  });

  it('drops javascript:, data: and protocol-relative links', () => {
    expect(resolveHref('javascript:alert(1)', SITE)).toBeNull();
    expect(resolveHref('  JAVASCRIPT:alert(1)', SITE)).toBeNull();
    expect(resolveHref('data:text/html,hi', SITE)).toBeNull();
    expect(resolveHref('//evil.example/x', SITE)).toBeNull();
    expect(resolveHref(undefined, SITE)).toBeNull();
  });
});

describe('withUtm', () => {
  it('tags links to the Hope Trust site', () => {
    expect(withUtm('https://hopetrustindia.com/blogs/x/', '2026-10-13', SITE)).toBe(
      'https://hopetrustindia.com/blogs/x/?utm_source=newsletter&utm_medium=email&utm_campaign=2026-10-13',
    );
  });

  it('tags www links and keeps existing query parameters', () => {
    expect(withUtm('https://www.hopetrustindia.com/contact/?a=1', '2026-10-13', SITE)).toBe(
      'https://www.hopetrustindia.com/contact/?a=1&utm_source=newsletter&utm_medium=email&utm_campaign=2026-10-13',
    );
  });

  it('leaves other sites, mailto links and already-tagged links alone', () => {
    expect(withUtm('https://en.wikipedia.org/wiki/Rumi', '2026-10-13', SITE)).toBe('https://en.wikipedia.org/wiki/Rumi');
    expect(withUtm('mailto:frontoffice@hopetrustindia.com', '2026-10-13', SITE)).toBe(
      'mailto:frontoffice@hopetrustindia.com',
    );
    const tagged = 'https://hopetrustindia.com/?utm_source=whatsapp';
    expect(withUtm(tagged, '2026-10-13', SITE)).toBe(tagged);
  });
});

describe('allowedImageUrl', () => {
  const prefixes = [`${IMAGES}/`];

  it('accepts images in the newsletter bucket', () => {
    expect(allowedImageUrl(`${IMAGES}/issues/a.jpg`, prefixes)).toBe(`${IMAGES}/issues/a.jpg`);
  });

  it('rejects other hosts, look-alike buckets, http and path tricks', () => {
    expect(allowedImageUrl('https://evil.example/a.jpg', prefixes)).toBeNull();
    expect(
      allowedImageUrl('https://abc.supabase.co/storage/v1/object/public/newsletter-images-x/a.jpg', prefixes),
    ).toBeNull();
    expect(allowedImageUrl(`${IMAGES}/../other-bucket/a.jpg`, prefixes)).toBeNull();
    expect(allowedImageUrl(`${IMAGES.replace('https:', 'http:')}/a.jpg`, prefixes)).toBeNull();
    expect(allowedImageUrl(null, prefixes)).toBeNull();
    expect(allowedImageUrl('', prefixes)).toBeNull();
  });
});

describe('newsletterImagesBase', () => {
  it('builds the public bucket URL', () => {
    expect(newsletterImagesBase('https://abc.supabase.co/')).toBe(IMAGES);
  });
});
