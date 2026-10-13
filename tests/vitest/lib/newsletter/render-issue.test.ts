import { describe, it, expect } from 'vitest';
import {
  COLORS,
  UNSUBSCRIBE_PLACEHOLDER,
  esc,
  renderIssueHtml,
  type RenderMode,
} from '@/lib/newsletter/render';
import type { IssueForRender } from '@/lib/newsletter/content';

const SITE = 'https://hopetrustindia.com';
const IMAGES = 'https://abc.supabase.co/storage/v1/object/public/newsletter-images';
const HERO = `${IMAGES}/issues/hero.jpg`;

const issue = (overrides: Partial<IssueForRender> = {}): IssueForRender => ({
  subject: 'Subject line',
  preheader: 'Preview line',
  issue_date: '2026-10-13',
  title: 'The Most Important Connection',
  hero_image_url: HERO,
  hero_image_alt: 'A counsellor and a client talking',
  body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello.' }] }] },
  share_url: null,
  ...overrides,
});

const render = (overrides: Partial<IssueForRender> = {}, mode: RenderMode = 'send') =>
  renderIssueHtml(issue(overrides), {
    mode,
    siteUrl: SITE,
    assetBaseUrl: `${IMAGES}/static`,
    imagePrefixes: [`${IMAGES}/`],
  });

const shareHrefFor = (title: string, link: string) =>
  esc(`https://wa.me/?text=${encodeURIComponent(`${title}, from the Hope Trust newsletter: ${link}`)}`);

describe('renderIssueHtml: unsubscribe', () => {
  it('links the Unsubscribe button to Resend’s placeholder in send mode, exactly once', () => {
    const { html } = render();
    expect(html).toContain(`href="${UNSUBSCRIBE_PLACEHOLDER}"`);
    expect(html.split(UNSUBSCRIBE_PLACEHOLDER)).toHaveLength(2);
  });

  it('links the Unsubscribe button to the website in test and preview mode', () => {
    for (const mode of ['test', 'preview'] as const) {
      const { html } = render({}, mode);
      expect(html).not.toContain(UNSUBSCRIBE_PLACEHOLDER);
      expect(html).toMatch(/<a href="https:\/\/hopetrustindia\.com\/" [^>]*><span[^>]*>Unsubscribe<\/span><\/a>/);
    }
  });
});

describe('renderIssueHtml: header and hero', () => {
  it('shows the date with a raised ordinal, as in the design', () => {
    expect(render().html).toContain(
      '13<sup style="font-size:60%;line-height:0;vertical-align:super;">th</sup> October, 2026',
    );
  });

  it('shows the raw date text instead of failing when the date is malformed', () => {
    expect(render({ issue_date: 'soon' }).html).toContain('>soon</td>');
  });

  it('puts the photo behind the banner, with an Outlook fallback and the alt text for screen readers', () => {
    const { html } = render();
    expect(html).toContain(`background-image:url('${HERO}')`);
    expect(html).toContain(`<v:fill type="frame" src="${HERO}"`);
    expect(html).toContain('role="img" aria-label="A counsellor and a client talking"');
    expect(html).toContain(`src="${IMAGES}/static/logo-v1.png"`);
  });

  it.each([
    ['no photo', null],
    ['a photo from outside the bucket', 'https://evil.example/hero.jpg'],
  ])('falls back to a darker orange behind the banner when there is %s', (_label, url) => {
    const { html } = render({ hero_image_url: url });
    expect(html).not.toContain('background-image');
    expect(html).not.toContain('v:rect');
    expect(html).not.toContain('evil.example');
    expect(html).toContain(`bgcolor="${COLORS.heroFallback}"`);
  });

  it('escapes the title, keeping emoji and Hindi text as typed', () => {
    const title = '"Mind & Body" <Part 2> 🌿 मन';
    const { html } = render({ title });
    expect(html).toContain('&quot;Mind &amp; Body&quot; &lt;Part 2&gt; 🌿 मन');
    expect(html).not.toContain('<Part 2>');
  });

  it('shows a title at the 160-character limit in full', () => {
    const title = 'Connection '.repeat(15).slice(0, 160).trim();
    expect(render({ title }).html).toContain(`>${title}</td>`);
  });

  it('never outputs a script tag, whatever the input', () => {
    const { html } = render({
      title: '<script>alert(1)</script>',
      subject: '<script>alert(2)</script>',
      preheader: '<script>alert(3)</script>',
    });
    expect(html).not.toMatch(/<script/i);
  });
});

describe('renderIssueHtml: inbox preview line', () => {
  it('uses the preview text when one is set', () => {
    expect(render().html).toContain('Preview line&#847;&zwnj;&nbsp;');
  });

  it('falls back to the first paragraph, then to the title', () => {
    expect(render({ preheader: '' }).html).toContain('Hello.&#847;&zwnj;&nbsp;');
    expect(render({ preheader: '', body: { type: 'doc', content: [] } }).html).toContain(
      'The Most Important Connection&#847;&zwnj;&nbsp;',
    );
  });
});

describe('renderIssueHtml: links', () => {
  it('links BOOK YOUR SESSION to the booking page with UTM tags', () => {
    const { html } = render();
    expect(html).toContain(
      'href="https://hopetrustindia.com/book-your-session/?utm_source=newsletter&amp;utm_medium=email&amp;utm_campaign=2026-10-13"',
    );
    expect(html).toContain('>BOOK YOUR SESSION</a>');
  });

  it('links the footer to the phone number, Instagram and the website', () => {
    const { html } = render();
    expect(html).toContain('href="tel:+919000850001"');
    expect(html).toContain('>+91 90008 50001</span>');
    expect(html).toContain('href="https://www.instagram.com/hopetrust/"');
    expect(html).toContain(
      'href="https://hopetrustindia.com/?utm_source=newsletter&amp;utm_medium=email&amp;utm_campaign=2026-10-13"',
    );
    expect(html).toContain('>hopetrustindia.com</span>');
    expect(html).toContain('You&#39;re receiving this because you subscribed at hopetrustindia.com.');
  });

  it('shares the blog home on WhatsApp when no blog link is set', () => {
    expect(render().html).toContain(
      `href="${shareHrefFor('The Most Important Connection', 'https://hopetrustindia.com/blogs/')}"`,
    );
  });

  it('shares the issue’s blog link when one is set, and ignores unusable ones', () => {
    const post = 'https://hopetrustindia.com/blogs/the-most-important-connection-you-can-have-with-yourself/';
    expect(render({ share_url: post }).html).toContain(`href="${shareHrefFor('The Most Important Connection', post)}"`);
    expect(render({ share_url: 'javascript:alert(1)' }).html).toContain(
      `href="${shareHrefFor('The Most Important Connection', 'https://hopetrustindia.com/blogs/')}"`,
    );
  });
});

describe('renderIssueHtml: size', () => {
  it('reports the UTF-8 size of the HTML', () => {
    const { html, bytes } = render({ title: 'मन 🌿' });
    expect(bytes).toBe(new TextEncoder().encode(html).length);
  });
});
