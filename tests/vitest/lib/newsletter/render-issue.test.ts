import { describe, it, expect } from 'vitest';
import {
  UNSUBSCRIBE_PLACEHOLDER,
  esc,
  readingMinutesOf,
  renderIssueHtml,
  shareLinks,
  splitTitle,
  type BookPanel,
  type RenderMode,
  type RenderOptions,
} from '@/lib/newsletter/render';
import type { BodyDoc, IssueForRender } from '@/lib/newsletter/content';

// The Hope Letter: the client's Cream editorial design
// (docs/design/newsletter-2026-10-17-hope-letter.html, variant "1").

const SITE = 'https://hopetrustindia.com';
const IMAGES = 'https://abc.supabase.co/storage/v1/object/public/newsletter-images';
const POST = `${SITE}/blogs/the-most-important-connection-you-can-have-with-yourself/`;
const PHOTO = 'https://images.unsplash.com/photo-1493836512294-502baa1986e2?w=1200&h=750&fit=crop&fm=jpg&q=80';
const TITLE = 'The Most Important Connection You Can Have: With Yourself';
const UTM = 'utm_source=newsletter&amp;utm_medium=email&amp;utm_campaign=2026-10-20';
const INTRO = 'Before you can love, trust, or genuinely know another person, you must first reconcile with yourself.';
const PANEL: BookPanel = {
  eyebrow: 'From Rahul Luther',
  title: 'I, Bhogi',
  text: 'A memoir of addiction, recovery and a life of purpose.',
  linkText: 'Discover the book →',
  url: 'https://example.com/i-bhogi',
};

const blog = (overrides: Partial<IssueForRender> = {}): IssueForRender => ({
  subject: TITLE,
  preheader: 'Strengthen your self-connection.',
  issue_date: '2026-10-20',
  title: TITLE,
  hero_image_url: PHOTO,
  hero_image_alt: TITLE,
  body: { type: 'doc', content: [] },
  share_url: POST,
  kind: 'blog',
  kicker: 'A moment for yourself',
  intro: INTRO,
  question: '',
  reading_minutes: 9,
  issue_number: 7,
  post_slug: 'the-most-important-connection-you-can-have-with-yourself',
  ...overrides,
});

const manual = (overrides: Partial<IssueForRender> = {}): IssueForRender =>
  blog({
    kind: 'manual',
    intro: '',
    reading_minutes: null,
    post_slug: null,
    share_url: null,
    hero_image_url: `${IMAGES}/issues/a/hero.jpg`,
    body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello from the team.' }] }] },
    ...overrides,
  });

const options = (mode: RenderMode, extra: Partial<RenderOptions> = {}): RenderOptions => ({
  mode,
  siteUrl: SITE,
  assetBaseUrl: `${IMAGES}/static`,
  imagePrefixes: [`${IMAGES}/`, 'https://images.unsplash.com/', `${SITE}/`],
  ...extra,
});

const render = (issue: IssueForRender, mode: RenderMode = 'send', extra: Partial<RenderOptions> = {}) =>
  renderIssueHtml(issue, options(mode, extra)).html;
const bodyOf = (html: string) => html.slice(html.indexOf('<body'));

describe('The Hope Letter: a blog issue', () => {
  it("lays out every part in the design's order", () => {
    const body = bodyOf(render(blog()));
    const parts = [
      'The Hope Letter',
      'ISSUE 07',
      'A MOMENT FOR YOURSELF',
      'The Most Important Connection You Can Have:',
      '<em style="font-weight:normal;">With Yourself</em>',
      'BY HOPE TRUST',
      '9 MIN READ',
      `src="${esc(PHOTO)}"`,
      INTRO,
      'Read the article',
      'Share a little hope.',
      'Book session',
      'STAY CONNECTED WITH HOPE TRUST',
      'frontoffice@hopetrustindia.com',
      'Privacy policy',
    ];
    const at = parts.map((part) => body.indexOf(part));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });

  it('puts the round logo in the masthead, and the post photo, with its alt text, linking to the post', () => {
    const html = render(blog());
    expect(html).toContain(`src="${IMAGES}/static/logo-round-v1.png"`);
    expect(html).toContain(`<a href="${POST}?${UTM}" target="_blank"><img src="${esc(PHOTO)}" width="640" alt="${TITLE}"`);
  });

  it('shows the question box only when there is a question', () => {
    expect(render(blog())).not.toContain('A QUESTION TO TAKE WITH YOU');
    const html = render(blog({ question: 'What would change if I spoke to myself as kindly as I speak to a friend?' }));
    expect(html).toContain('A QUESTION TO TAKE WITH YOU');
    expect(html).toContain('What would change if I spoke to myself as kindly as I speak to a friend?');
  });

  it('links Read the article to the post with UTM tags, in Outlook too', () => {
    const html = render(blog());
    expect(html.split(`href="${POST}?${UTM}"`).length - 1).toBe(3); // photo, Outlook button, button
    expect(html.split('<v:roundrect').length - 1).toBe(2); // Read the article, Book session
  });

  it('shares the post four ways, without tracking tags', () => {
    const html = render(blog());
    const links = shareLinks(TITLE, POST);
    for (const link of [links.email, links.whatsapp, links.facebook, links.linkedin]) {
      expect(html).toContain(`href="${esc(link)}"`);
      expect(link).toContain(encodeURIComponent(POST));
    }
  });
});

describe('The Hope Letter: footer, booking and unsubscribe', () => {
  it('links the booking button, the socials and the privacy policy, and says why it came', () => {
    const html = render(blog());
    expect(html).toContain(`href="${SITE}/book-your-session/?${UTM}"`);
    expect(html).toContain('href="https://www.instagram.com/hopetrust/"');
    expect(html).toContain('href="https://www.facebook.com/hopetrust"');
    expect(html).toContain(`href="${SITE}/privacy-policy/?${UTM}"`);
    expect(html).toContain('Banjara Hills');
    expect(html).toContain('The Hope Letter · One thoughtful read, every fortnight.');
    expect(html).toContain('You&#39;re receiving this because you subscribed at hopetrustindia.com.');
    expect(html).toContain('© 2026 Hope Trust');
  });

  it('links Unsubscribe to Resend’s placeholder in send mode, exactly once', () => {
    const html = render(blog());
    expect(html).toContain(`href="${UNSUBSCRIBE_PLACEHOLDER}"`);
    expect(html.split(UNSUBSCRIBE_PLACEHOLDER)).toHaveLength(2);
  });

  it('links Unsubscribe to the website in test and preview mode', () => {
    for (const mode of ['test', 'preview'] as const) {
      const html = render(blog(), mode);
      expect(html).not.toContain(UNSUBSCRIBE_PLACEHOLDER);
      expect(html).toMatch(/<a href="https:\/\/hopetrustindia\.com\/" [^>]*>Unsubscribe<\/a>/);
    }
  });
});

describe('The Hope Letter: numbers and the book panel', () => {
  it("shows the issue's number, else the next one, else no number", () => {
    expect(render(blog({ issue_number: null }), 'preview', { nextIssueNumber: 3 })).toContain('ISSUE 03 &nbsp;/&nbsp; A MOMENT FOR YOURSELF');
    const none = render(blog({ issue_number: null }));
    expect(none).not.toContain('ISSUE ');
    expect(none).toContain('A MOMENT FOR YOURSELF');
  });

  it('shows the book panel only when the settings give one', () => {
    expect(render(blog())).not.toContain('I, Bhogi');
    const html = render(blog(), 'send', { panel: PANEL });
    expect(html).toContain('FROM RAHUL LUTHER');
    expect(html).toContain('>I, Bhogi</h2>');
    expect(html).toContain(PANEL.text);
    expect(html).toContain('href="https://example.com/i-bhogi"');
    expect(html).toContain('Discover the book →</a>');
  });
});

describe('The Hope Letter: a manual issue', () => {
  it('shows the body instead of an intro, and Read the article only with an article link', () => {
    const html = render(manual());
    expect(html).toContain('Hello from the team.');
    expect(html).toContain('1 MIN READ');
    expect(html).not.toContain('Read the article');
    expect(html).toContain(`href="${esc(shareLinks(TITLE, `${SITE}/blogs/`).whatsapp)}"`);
    const linked = render(manual({ share_url: POST }));
    expect(linked).toContain('Read the article');
    expect(linked).toContain(`href="${POST}?${UTM}"`);
  });
});

describe('The Hope Letter: safety', () => {
  it('escapes every field, keeping emoji and Hindi text as typed, and never outputs a script tag', () => {
    const html = render(
      blog({
        title: '"Mind & Body" <Part 2> 🌿 मन',
        kicker: '<script>alert(1)</script>',
        intro: '<script>alert(2)</script>',
        question: '<script>alert(3)</script>',
        subject: '<script>alert(4)</script>',
      }),
    );
    expect(html).toContain('&quot;Mind &amp; Body&quot; &lt;Part 2&gt; 🌿 मन');
    expect(html).not.toMatch(/<script/i);
  });

  it('leaves out a photo from a host the renderer does not allow', () => {
    expect(render(blog({ hero_image_url: 'https://evil.example/x.jpg' }))).not.toContain('evil.example');
  });

  it('uses the preview text, else the intro, else the title, for the inbox preview line', () => {
    expect(render(blog())).toContain('Strengthen your self-connection.&#847;&zwnj;&nbsp;');
    expect(render(blog({ preheader: '' }))).toContain(`${INTRO}&#847;&zwnj;&nbsp;`);
    expect(render(blog({ preheader: '', intro: '' }))).toContain(`${esc(TITLE)}&#847;&zwnj;&nbsp;`);
  });

  it('keeps a 640 px shell for Outlook, and reports the UTF-8 size', () => {
    const { html, bytes } = renderIssueHtml(blog({ title: 'मन 🌿' }), options('send'));
    expect(html).toContain('width="640" align="center" class="email-shell"');
    expect(bytes).toBe(new TextEncoder().encode(html).length);
  });
});

describe('helpers', () => {
  it('splits a title at the first ": " for the italic part', () => {
    expect(splitTitle(TITLE)).toEqual({ lead: 'The Most Important Connection You Can Have:', emphasis: 'With Yourself' });
    expect(splitTitle('No colon here')).toEqual({ lead: 'No colon here', emphasis: null });
    expect(splitTitle('Ends with a colon: ')).toEqual({ lead: 'Ends with a colon:', emphasis: null });
  });

  it('works out a reading time of at least a minute, at 200 words a minute', () => {
    const words = (n: number): BodyDoc => ({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: Array.from({ length: n }, () => 'word').join(' ') }] }],
    });
    expect(readingMinutesOf(words(450))).toBe(3);
    expect(readingMinutesOf({ type: 'doc', content: [] })).toBe(1);
  });

  it('builds the share links the design uses', () => {
    expect(shareLinks(TITLE, POST)).toEqual({
      email:
        'mailto:?subject=The%20Most%20Important%20Connection%20You%20Can%20Have%3A%20With%20Yourself%20%7C%20Hope%20Trust&body=I%20thought%20you%20might%20enjoy%20this%20article%20from%20Hope%20Trust.%0D%0A%0D%0Ahttps%3A%2F%2Fhopetrustindia.com%2Fblogs%2Fthe-most-important-connection-you-can-have-with-yourself%2F',
      whatsapp:
        'https://wa.me/?text=The%20Most%20Important%20Connection%20You%20Can%20Have%3A%20With%20Yourself%20%E2%80%94%20Hope%20Trust%0Ahttps%3A%2F%2Fhopetrustindia.com%2Fblogs%2Fthe-most-important-connection-you-can-have-with-yourself%2F',
      facebook:
        'https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fhopetrustindia.com%2Fblogs%2Fthe-most-important-connection-you-can-have-with-yourself%2F',
      linkedin:
        'https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fhopetrustindia.com%2Fblogs%2Fthe-most-important-connection-you-can-have-with-yourself%2F',
    });
  });
});
