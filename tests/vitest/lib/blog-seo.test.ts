import { describe, it, expect } from 'vitest';
import { getAllPosts } from '@/lib/blog';

/**
 * The search-result fields and the "In short" summary are hand-written per
 * post. These checks keep them inside the limits that make them work: a title
 * Google shows without truncating, a description it shows whole, and a
 * summary short enough to be quoted as one passage.
 */
const posts = getAllPosts();
const withSeo = posts.filter((p) => p.seoTitle || p.seoDescription || p.summary);

describe('blog search fields', () => {
  it('are set on the highest-traffic posts', () => {
    expect(withSeo.length).toBeGreaterThanOrEqual(20);
  });

  it.each(withSeo.map((p) => [p.slug, p] as const))('%s', (_slug, post) => {
    // Set together: a summary without a matching search title and description
    // is usually a half-finished edit.
    expect(post.seoTitle).toBeTruthy();
    expect(post.seoDescription).toBeTruthy();
    expect(post.summary).toBeTruthy();

    expect(post.seoTitle!.length).toBeLessThanOrEqual(62);
    expect(post.seoDescription!.length).toBeGreaterThanOrEqual(110);
    expect(post.seoDescription!.length).toBeLessThanOrEqual(160);

    const words = post.summary!.split(/\s+/).length;
    expect(words).toBeGreaterThanOrEqual(30);
    expect(words).toBeLessThanOrEqual(90);

    // An edit that adds these is a substantive change, so it carries a date —
    // and never one earlier than publication.
    expect(post.modified.slice(0, 10) >= post.date.slice(0, 10)).toBe(true);
  });
});
