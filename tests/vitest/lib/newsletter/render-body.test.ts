import { describe, it, expect } from 'vitest';
import { bodyPreviewText, renderBodyHtml } from '@/lib/newsletter/render';
import type { BlockNode, BodyDoc } from '@/lib/newsletter/content';

const SITE = 'https://hopetrustindia.com';
const IMAGES = 'https://abc.supabase.co/storage/v1/object/public/newsletter-images';
const opts = { siteUrl: SITE, campaign: '2026-10-13', imagePrefixes: [`${IMAGES}/`] };
const doc = (...content: BlockNode[]): BodyDoc => ({ type: 'doc', content });

describe('renderBodyHtml', () => {
  it('renders a paragraph with bold, italic and a tagged site link', () => {
    const html = renderBodyHtml(
      doc({
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Know ' },
          { type: 'text', text: 'thyself', marks: [{ type: 'bold' }, { type: 'italic' }] },
          { type: 'text', text: ' — read more', marks: [{ type: 'link', attrs: { href: '/blogs/x/' } }] },
        ],
      }),
      opts,
    );
    expect(html).toContain(
      '<p style="margin:0 0 16px 0;">Know <em style="font-style:italic;"><strong style="font-weight:700;">thyself</strong></em>',
    );
    expect(html).toContain(
      '<a href="https://hopetrustindia.com/blogs/x/?utm_source=newsletter&amp;utm_medium=email&amp;utm_campaign=2026-10-13" style="color:#00373E;text-decoration:underline;"> — read more</a></p>',
    );
  });

  it('escapes text so it can never become HTML', () => {
    const html = renderBodyHtml(
      doc({ type: 'paragraph', content: [{ type: 'text', text: '<script>alert("x")</script>' }] }),
      opts,
    );
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<script');
  });

  it('keeps the text of an unsafe link but drops the link', () => {
    const html = renderBodyHtml(
      doc({
        type: 'paragraph',
        content: [{ type: 'text', text: 'click me', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }],
      }),
      opts,
    );
    expect(html).toContain('click me');
    expect(html).not.toContain('href=');
    expect(html).not.toContain('javascript');
  });

  it('keeps emoji and Hindi text, and turns hard breaks into <br>', () => {
    const html = renderBodyHtml(
      doc({
        type: 'paragraph',
        content: [{ type: 'text', text: 'मन शांत है' }, { type: 'hardBreak' }, { type: 'text', text: '🌿' }],
      }),
      opts,
    );
    expect(html).toContain('मन शांत है<br>🌿');
  });

  it('sets headings in the design serif, left-aligned, and skips empty headings', () => {
    const html = renderBodyHtml(
      doc(
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'You are a River' }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Humour Helps' }] },
        { type: 'heading', attrs: { level: 2 }, content: [] },
      ),
      opts,
    );
    expect(html).toMatch(/<h2 [^>]*Georgia[^>]*>You are a River<\/h2>/);
    expect(html).not.toContain('text-align:center');
    expect(html).toMatch(/<h3 [^>]*>Humour Helps<\/h3>/);
    expect(html.match(/<h2 /g)).toHaveLength(1);
  });

  it('renders bulleted and numbered lists, indented with margin so Outlook keeps the bullets', () => {
    const html = renderBodyHtml(
      doc({
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Pause' }] },
              {
                type: 'orderedList',
                attrs: { start: 3 },
                content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Breathe' }] }] }],
              },
            ],
          },
        ],
      }),
      opts,
    );
    expect(html).toBe(
      '<ul style="margin:0 0 16px 24px;padding:0;"><li style="margin:0 0 8px 0;">Pause' +
        '<ol start="3" style="margin:0 0 16px 24px;padding:0;"><li style="margin:0 0 8px 0;">Breathe</li></ol>' +
        '</li></ul>',
    );
  });

  it('renders a pull-quote as the question box', () => {
    const html = renderBodyHtml(
      doc({
        type: 'blockquote',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: '“I am large, & I contain multitudes.”' }] },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Walt Whitman', marks: [{ type: 'link', attrs: { href: 'https://en.wikipedia.org/wiki/Walt_Whitman' } }] },
            ],
          },
        ],
      }),
      opts,
    );
    expect(html).toContain('bgcolor="#F7F5EF" style="background-color:#F7F5EF;border-left:3px solid #ED7428;');
    expect(html).toContain(
      '“I am large, &amp; I contain multitudes.”<br><br><a href="https://en.wikipedia.org/wiki/Walt_Whitman" style="color:#00373E;text-decoration:underline;">Walt Whitman</a>',
    );
  });

  it('renders a divider as a thin rule', () => {
    expect(renderBodyHtml(doc({ type: 'horizontalRule' }), opts)).toContain('border-top:1px solid #D8DEDA;');
  });

  it('shows bucket images with their alt text and skips images from anywhere else', () => {
    const html = renderBodyHtml(
      doc(
        { type: 'image', attrs: { src: `${IMAGES}/issues/river.jpg`, alt: 'A mountain river' } },
        { type: 'image', attrs: { src: 'https://evil.example/x.jpg', alt: 'nope' } },
      ),
      opts,
    );
    expect(html).toContain(`<img src="${IMAGES}/issues/river.jpg" alt="A mountain river" width="560"`);
    expect(html).not.toContain('evil.example');
  });

  it('skips unknown content, keeps empty paragraphs as spacing, and survives a missing doc', () => {
    const html = renderBodyHtml(
      {
        type: 'doc',
        content: [
          { type: 'codeBlock', content: [{ type: 'text', text: 'rm -rf /' }] } as unknown as BlockNode,
          { type: 'paragraph' },
        ],
      },
      opts,
    );
    expect(html).not.toContain('rm -rf');
    expect(html).toBe('<p style="margin:0 0 16px 0;">&nbsp;</p>');
    expect(renderBodyHtml(undefined as unknown as BodyDoc, opts)).toBe('');
  });
});

describe('bodyPreviewText', () => {
  it('uses the first paragraph that has text, with spaces tidied', () => {
    expect(
      bodyPreviewText(
        doc(
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Heading' }] },
          { type: 'paragraph' },
          { type: 'paragraph', content: [{ type: 'text', text: '  Before you can   love,' }, { type: 'hardBreak' }, { type: 'text', text: 'trust.' }] },
        ),
      ),
    ).toBe('Before you can love, trust.');
  });

  it('shortens long text to 140 characters with an ellipsis', () => {
    const long = 'word '.repeat(60).trim();
    const preview = bodyPreviewText(doc({ type: 'paragraph', content: [{ type: 'text', text: long }] }));
    expect(preview.length).toBeLessThanOrEqual(140);
    expect(preview.endsWith('…')).toBe(true);
  });

  it('returns an empty string when there is no paragraph text', () => {
    expect(bodyPreviewText(doc())).toBe('');
    expect(bodyPreviewText(undefined)).toBe('');
  });
});
