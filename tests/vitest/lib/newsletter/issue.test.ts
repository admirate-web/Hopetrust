import { describe, it, expect } from 'vitest';
import type { IssueForRender } from '@/lib/newsletter/content';
import {
  EMPTY_BODY,
  broadcastName,
  cleanText,
  draftKey,
  issueDraftSchema,
  issueRenderOptions,
  normalizeBody,
  sendProblems,
  toDraft,
  todayInIndia,
} from '@/lib/newsletter/issue';
import { renderIssueHtml } from '@/lib/newsletter/render';

const IMAGES = 'https://abc.supabase.co/storage/v1/object/public/newsletter-images';
const valid = {
  subject: 'Know thyself',
  preheader: '',
  issue_date: '2026-10-14',
  title: 'Know Thyself',
  hero_image_url: `${IMAGES}/issues/a/hero.jpg`,
  hero_image_alt: 'A window',
  body: EMPTY_BODY,
  share_url: null,
};

describe('todayInIndia', () => {
  it('uses the date in India, not in UTC', () => {
    expect(todayInIndia(new Date('2026-10-14T10:00:00Z'))).toBe('2026-10-14');
    // 19:00 UTC is 00:30 the next day in India.
    expect(todayInIndia(new Date('2026-10-14T19:00:00Z'))).toBe('2026-10-15');
  });
});

describe('cleanText', () => {
  it('drops NUL and half of a surrogate pair, and keeps whole emoji', () => {
    expect(cleanText('a\u0000b')).toBe('ab');
    expect(cleanText('x\uD83Dy')).toBe('xy');
    expect(cleanText('x\uDE00y')).toBe('xy');
    expect(cleanText('ok 😀')).toBe('ok 😀');
  });
});

describe('normalizeBody', () => {
  it('keeps every kind of allowed content as it is', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Sub' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Bold', marks: [{ type: 'bold' }] },
            { type: 'hardBreak' },
            { type: 'text', text: 'link', marks: [{ type: 'italic' }, { type: 'link', attrs: { href: 'https://example.com' } }] },
          ],
        },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] }] },
        {
          type: 'orderedList',
          attrs: { start: 3 },
          content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'three' }] }] }],
        },
        { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quote' }] }] },
        { type: 'horizontalRule' },
        { type: 'image', attrs: { src: `${IMAGES}/issues/a/1.jpg`, alt: 'Alt' } },
      ],
    };
    expect(normalizeBody(doc)).toEqual(doc);
  });

  it("drops what the email can't show, keeping the text where it can", () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'codeBlock', content: [{ type: 'text', text: 'code' }] },
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Big' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'struck', marks: [{ type: 'strike' }, { type: 'bold' }] },
            { type: 'text', text: 'bad link', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)', target: '_blank' } }] },
            { type: 'text', text: 'good link', marks: [{ type: 'link', attrs: { href: '/blogs/', rel: 'noopener', class: null } }] },
            { type: 'mention', attrs: { id: 'x' } },
          ],
        },
        {
          type: 'blockquote',
          content: [
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Q' }] },
            { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item' }] }] }] },
          ],
        },
        { type: 'image', attrs: { src: 'https://x.example/y.jpg', alt: 'line\nbreak', title: 'T', width: 10 } },
        { type: 'paragraph' },
        { type: 'paragraph' },
      ],
    };
    expect(normalizeBody(doc)).toEqual({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Big' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'struck', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'bad link' },
            { type: 'text', text: 'good link', marks: [{ type: 'link', attrs: { href: '/blogs/' } }] },
          ],
        },
        {
          type: 'blockquote',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Q' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'item' }] },
          ],
        },
        { type: 'image', attrs: { src: 'https://x.example/y.jpg', alt: 'line break' } },
      ],
    });
  });

  it('limits nesting, and gives an empty doc for anything that is not one', () => {
    expect(normalizeBody(null)).toEqual(EMPTY_BODY);
    expect(normalizeBody({ type: 'paragraph' })).toEqual(EMPTY_BODY);
    const item = (text: string, ...rest: unknown[]) => ({
      type: 'listItem',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }, ...rest],
    });
    let list: unknown = { type: 'bulletList', content: [item('deepest')] };
    for (let n = 0; n < 4; n++) list = { type: 'bulletList', content: [item(`level ${n}`, list)] };
    const json = JSON.stringify(normalizeBody({ type: 'doc', content: [list] }));
    expect(json).toContain('level 3');
    expect(json).toContain('level 1');
    expect(json).not.toContain('level 0');
    expect(json).not.toContain('deepest');
  });
});

describe('issueDraftSchema', () => {
  it('trims and flattens the one-line fields', () => {
    const parsed = issueDraftSchema.parse({ ...valid, subject: '  Hello\nthere \u0000 ', share_url: '  ' });
    expect(parsed.subject).toBe('Hello there');
    expect(parsed.share_url).toBeNull();
  });

  it.each([
    [{ subject: 'x'.repeat(151) }, 'The subject can be at most 150 characters.'],
    [{ title: 'x'.repeat(161) }, 'The title can be at most 160 characters.'],
    [{ issue_date: '2026-02-30' }, 'Choose a real date.'],
    [{ issue_date: '14/10/2026' }, 'Choose the issue date.'],
    [{ share_url: 'javascript:alert(1)' }, 'The Share link must be a web address, such as https://hopetrustindia.com/blogs/…'],
    [{ hero_image_url: 'http://example.com/a.jpg' }, 'The hero photo must be an uploaded image.'],
    [{ kicker: 'x'.repeat(61) }, 'The kicker can be at most 60 characters.'],
    [{ intro: 'x'.repeat(601) }, 'The intro can be at most 600 characters.'],
    [{ question: 'x'.repeat(201) }, 'The question can be at most 200 characters.'],
  ])('rejects %o', (change, message) => {
    const result = issueDraftSchema.safeParse({ ...valid, ...change });
    expect(result.success).toBe(false);
    expect(result.success ? '' : result.error.issues[0].message).toBe(message);
  });

  it('accepts a Share link on the site or anywhere on the web', () => {
    expect(issueDraftSchema.parse({ ...valid, share_url: '/blogs/know-thyself/' }).share_url).toBe('/blogs/know-thyself/');
    expect(issueDraftSchema.parse({ ...valid, share_url: 'https://example.com/a' }).share_url).toBe('https://example.com/a');
  });

  it('keeps the kicker, intro and question trimmed, and empty when a save leaves them out', () => {
    expect(issueDraftSchema.parse(valid)).toMatchObject({ kicker: '', intro: '', question: '' });
    const parsed = issueDraftSchema.parse({
      ...valid,
      kicker: '  A moment for yourself ',
      intro: ' Before you can love, trust or know another person.\n',
      question: ' What would change? ',
    });
    expect(parsed).toMatchObject({
      kicker: 'A moment for yourself',
      intro: 'Before you can love, trust or know another person.',
      question: 'What would change?',
    });
  });
});

describe('toDraft', () => {
  it('includes the kicker, intro and question', () => {
    const issue = { ...valid, kicker: 'K', intro: 'I', question: 'Q' } as unknown as IssueForRender;
    expect(toDraft(issue)).toMatchObject({ kicker: 'K', intro: 'I', question: 'Q' });
  });
});

describe('draftKey', () => {
  it('matches drafts that would save the same, and tells apart ones that would not', () => {
    expect(draftKey({ ...valid, subject: 'Know thyself ' })).toBe(draftKey(valid));
    expect(draftKey({ ...valid, title: 'Other' })).not.toBe(draftKey(valid));
    expect(draftKey(toDraft(valid))).toBe(draftKey(valid));
  });
});

describe('issueRenderOptions', () => {
  it('takes the logo from static/, photos from anywhere in the bucket, and links to the live site', () => {
    expect(issueRenderOptions(`${IMAGES}/`, 'preview')).toEqual({
      mode: 'preview',
      siteUrl: 'https://hopetrustindia.com',
      assetBaseUrl: `${IMAGES}/static`,
      imagePrefixes: [`${IMAGES}/`],
    });
  });
});

describe('sendProblems', () => {
  const opts = issueRenderOptions(IMAGES, 'send');
  const ready: IssueForRender = {
    ...valid,
    body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }] },
  };

  it('has nothing to say about an issue that is ready', () => {
    const { html, bytes } = renderIssueHtml(ready, opts);
    expect(sendProblems({ issue: ready, html, bytes, subscribed: 3, imagePrefixes: opts.imagePrefixes })).toEqual([]);
  });

  it("lists every reason an issue can't go out, in the editor's order", () => {
    expect(
      sendProblems({
        issue: { subject: ' ', title: '', hero_image_url: 'https://elsewhere.example/a.jpg', hero_image_alt: '' },
        html: '<p>no link</p>',
        bytes: 96 * 1024,
        subscribed: 0,
        imagePrefixes: opts.imagePrefixes,
      }),
    ).toEqual([
      'Add a subject.',
      'Add a title.',
      'Add a hero photo.',
      "Describe the hero photo for people who can't see it.",
      'The email is 96.0 KB, over the 95.0 KB limit. Shorten it or remove an image.',
      'The email is missing its Unsubscribe link.',
      'There are no subscribers to send to.',
    ]);
  });
});

describe('broadcastName', () => {
  it('names the broadcast with the subject and the issue id, never splitting an emoji', () => {
    expect(broadcastName({ id: 'abc', subject: ' Know thyself ' })).toBe('Know thyself [issue abc]');
    expect(broadcastName({ id: 'abc', subject: '' })).toBe('Newsletter [issue abc]');
    expect(broadcastName({ id: 'abc', subject: '😀'.repeat(100) })).toBe(`${'😀'.repeat(80)} [issue abc]`);
  });
});
