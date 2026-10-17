import { describe, it, expect } from 'vitest';
import type { BlogPost } from '@/lib/blog';
import {
  DEFAULT_KICKER,
  chooseNextPost,
  emailImageUrl,
  firstParagraph,
  introFor,
  kickerFor,
  toNewsletterPost,
  type NewsletterPost,
} from '@/lib/newsletter/posts';

const LONG =
  'Before you can love, trust, or genuinely know another person, you must first reconcile with yourself. ' +
  'Every relationship in your life is built on how you relate to yourself.';

describe('emailImageUrl', () => {
  it('asks Unsplash for a fixed JPEG 1,200 px wide, never auto=format', () => {
    expect(emailImageUrl('https://images.unsplash.com/photo-1?w=800&h=500&fit=crop&auto=format')).toBe(
      'https://images.unsplash.com/photo-1?w=1200&h=750&fit=crop&fm=jpg&q=80',
    );
  });

  it('puts JPEG and PNG site images on the live site, and refuses WebP and nothing', () => {
    expect(emailImageUrl('/images/blog/a.jpg')).toBe('https://hopetrustindia.com/images/blog/a.jpg');
    expect(emailImageUrl('/images/blog/b.PNG')).toBe('https://hopetrustindia.com/images/blog/b.PNG');
    expect(emailImageUrl('https://hopetrustindia.com/images/blog/c.jpeg')).toBe('https://hopetrustindia.com/images/blog/c.jpeg');
    expect(emailImageUrl('/images/blog/a.webp')).toBeNull();
    expect(emailImageUrl('https://elsewhere.example/a.jpg')).toBeNull();
    expect(emailImageUrl('')).toBeNull();
    expect(emailImageUrl(undefined)).toBeNull();
  });
});

describe('firstParagraph', () => {
  it('skips headings, lists, images, quotes, quotations and short lines', () => {
    const markdown = [
      '## Why it matters',
      '- a list item that is long enough to count if it were a paragraph, which it is not, so it is skipped',
      '![A window](/images/a.jpg)',
      '> A pull quote that is long enough to count if it were a paragraph, which it is not, so it is skipped.',
      '“Three changes of the spirit do I show you: how the spirit turns into a camel, the camel into a lion.” —Nietzsche',
      'Too short to be an intro.',
      LONG,
    ].join('\n\n');
    expect(firstParagraph(markdown)).toBe(LONG);
  });

  it('keeps the text of links and drops bare (https://…) text and emphasis marks', () => {
    const markdown =
      'As **Carl Rogers** said in [On Becoming a Person](https://example.com/book), the curious paradox (https://x.example/y) ' +
      'is that when I accept myself just as I am, then I can change. That idea runs through everything that follows here.';
    expect(firstParagraph(markdown)).toBe(
      'As Carl Rogers said in On Becoming a Person, the curious paradox is that when I accept myself just as I am, then I can change. ' +
        'That idea runs through everything that follows here.',
    );
  });

  it('cuts at the last sentence end within 320 characters', () => {
    const one = `${'a'.repeat(149)}.`;
    const two = ` ${'b'.repeat(148)}.`;
    const three = ` ${'c'.repeat(98)}.`;
    expect(firstParagraph(one + two + three)).toBe(one + two);
  });

  it('cuts at a word with an ellipsis when no sentence ends within 320 characters', () => {
    const words = Array.from({ length: 80 }, () => 'word').join(' ');
    const cut = firstParagraph(`${words}.`);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(321);
    expect(cut).not.toMatch(/\s…$/);
  });

  it('is empty when nothing qualifies', () => {
    expect(firstParagraph('## Only a heading\n\nShort.')).toBe('');
  });
});

describe('introFor', () => {
  it('prefers the first paragraph, then the summary, then the excerpt', () => {
    expect(introFor({ content: LONG, summary: 'S', excerpt: 'E' })).toBe(LONG);
    expect(introFor({ content: 'Short.', summary: 'The summary.', excerpt: 'E' })).toBe('The summary.');
    expect(introFor({ content: 'Short.', excerpt: 'Discover the excerpt.' })).toBe('Discover the excerpt.');
  });
});

describe('kickerFor', () => {
  it("uses the first category unless it is the generic 'Blog'", () => {
    expect(kickerFor(['Blog'])).toBe(DEFAULT_KICKER);
    expect(kickerFor(['Addiction', 'Blog'])).toBe('Addiction');
    expect(kickerFor([])).toBe(DEFAULT_KICKER);
    expect(DEFAULT_KICKER).toBe('A moment for yourself');
  });
});

describe('toNewsletterPost', () => {
  it('keeps what the newsletter needs', () => {
    const post = {
      slug: 'the-most-important-connection-you-can-have-with-yourself',
      title: 'The Most Important Connection You Can Have: With Yourself',
      date: '2025-12-20T11:30:02',
      excerpt: 'Strengthen your self-connection.',
      categories: ['Blog'],
      featuredImage: 'https://images.unsplash.com/photo-1493836512294-502baa1986e2?w=800&h=500&fit=crop&auto=format',
      content: LONG,
      readingTime: '9 min read',
    } as unknown as BlogPost;
    expect(toNewsletterPost(post)).toEqual({
      slug: 'the-most-important-connection-you-can-have-with-yourself',
      title: 'The Most Important Connection You Can Have: With Yourself',
      date: '2025-12-20T11:30:02',
      excerpt: 'Strengthen your self-connection.',
      intro: LONG,
      kicker: DEFAULT_KICKER,
      image: 'https://images.unsplash.com/photo-1493836512294-502baa1986e2?w=1200&h=750&fit=crop&fm=jpg&q=80',
      readingMinutes: 9,
      url: 'https://hopetrustindia.com/blogs/the-most-important-connection-you-can-have-with-yourself/',
    });
  });
});

describe('chooseNextPost', () => {
  const post = (slug: string, date: string, image: string | null): NewsletterPost => ({
    slug,
    title: slug,
    date,
    excerpt: '',
    intro: '',
    kicker: DEFAULT_KICKER,
    image,
    readingMinutes: 5,
    url: `https://hopetrustindia.com/blogs/${slug}/`,
  });
  const posts = [
    post('older', '2025-11-01T10:00:00', 'https://x/1.jpg'),
    post('newest', '2025-12-20T11:30:02', 'https://x/2.jpg'),
    post('no-photo', '2025-12-25T09:00:00', null),
    post('middle', '2025-12-01T10:00:00', 'https://x/3.jpg'),
  ];

  it('picks the newest post with a photo', () => {
    expect(chooseNextPost(posts, [], [])?.slug).toBe('newest');
  });

  it('passes over sent posts, and posts whose photo went out in the last issues', () => {
    expect(chooseNextPost(posts, ['newest'], [])?.slug).toBe('middle');
    expect(chooseNextPost(posts, [], ['https://x/2.jpg'])?.slug).toBe('middle');
    expect(chooseNextPost(posts, ['newest', 'middle'], ['https://x/1.jpg'])).toBeNull();
  });
});
