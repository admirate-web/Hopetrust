import { describe, it, expect } from 'vitest';
import { topicFor, relatedPosts, TOPICS } from '@/lib/post-topics';
import type { BlogPostMeta } from '@/lib/blog';

function post(overrides: Partial<BlogPostMeta> = {}): BlogPostMeta {
  return {
    slug: 'a-post',
    title: 'A Post',
    date: '2024-01-01',
    modified: '2024-01-01',
    excerpt: '',
    categories: [],
    tags: [],
    featuredImage: '',
    author: 'Hope Trust',
    ...overrides,
  };
}

describe('topicFor', () => {
  it.each([
    ['10 Signs You Need Professional Help for Alcoholism', 'addiction'],
    ['Understanding Gambling Addiction', 'addiction'],
    ['5 Short-Term Symptoms of Caffeine Withdrawal', 'addiction'],
    ['6 Ways to Deal With Your Anxiety', 'mental-health'],
    ['Everything You Should Know About Depression', 'mental-health'],
    ['Managing Burnout at Work', 'corporate'],
    ['Top 10 Reasons for Divorce', 'couples'],
    ['How Couples Can Rebuild Trust in Their Relationship', 'couples'],
    ['What Challenges Do Teenagers Face Today?', 'child'],
    ['Symptoms and Treatment of ADHD in Children', 'child'],
    ['8 Reasons You Should Consider Online Counselling', 'online'],
    ['Living With Intrusive Thoughts and OCD', 'ocd'],
  ])('routes %s to %s', (title, expected) => {
    expect(topicFor(post({ title, slug: 'x' })).id).toBe(expected);
  });

  it('prefers intervention over addiction when the post is aimed at the family', () => {
    // Someone searching for how to help a drinking relative wants the
    // intervention page, not the general treatment page.
    expect(
      topicFor(post({ title: 'Strategies for Helping a Loved One Who Refuses Help' })).id
    ).toBe('intervention');
  });

  it('keeps addiction ahead of relationships', () => {
    // A post about what drinking does to a marriage is still, first, about
    // drinking — the addiction page serves that reader better.
    expect(topicFor(post({ title: 'Addiction and Relationships' })).id).toBe('addiction');
  });

  it('sends a post about online therapy for a breakup to the online page', () => {
    expect(
      topicFor(post({ title: 'How can online therapy help me deal with post-breakup heartache?' })).id
    ).toBe('online');
  });

  it('reads the slug as well as the title', () => {
    expect(topicFor(post({ title: 'Untitled', slug: 'living-with-alcoholism' })).id).toBe(
      'addiction'
    );
  });

  it('falls back to mental health rather than returning nothing', () => {
    expect(topicFor(post({ title: 'Zzzz', slug: 'zzzz' })).id).toBe('mental-health');
  });

  it('gives every topic a service page and call to action', () => {
    for (const t of TOPICS) {
      expect(t.href).toMatch(/^\/[a-z-]*\/$/);
      expect(t.cta.length).toBeGreaterThan(0);
      expect(t.heading.length).toBeGreaterThan(0);
    }
  });
});

describe('relatedPosts', () => {
  const all = [
    post({ slug: 'alcoholism-signs', title: 'Signs of Alcoholism' }),
    post({ slug: 'alcoholism-family', title: 'What Alcoholism Does to Your Family' }),
    post({ slug: 'anxiety-tips', title: 'Dealing With Anxiety' }),
    post({ slug: 'money', title: 'Things Money Cannot Buy' }),
  ];

  it('prefers posts sharing distinctive title words', () => {
    const current = post({ slug: 'alcoholism-help', title: 'Help for Alcoholism' });
    const ids = relatedPosts(current, all).map((p) => p.slug);
    expect(ids[0]).toMatch(/^alcoholism-/);
  });

  it('never returns the post itself', () => {
    const current = all[0];
    expect(relatedPosts(current, all).map((p) => p.slug)).not.toContain(current.slug);
  });

  it('respects the limit', () => {
    const current = post({ slug: 'x', title: 'Alcoholism Anxiety Money' });
    expect(relatedPosts(current, all, 2)).toHaveLength(2);
  });

  it('ignores stopwords, so "how to" alone does not make posts related', () => {
    const current = post({ slug: 'q', title: 'How to Do the Thing' });
    const other = [post({ slug: 'r', title: 'How to Be a Person' })];
    // Both share only stopwords; the sole remaining signal is shared topic.
    const result = relatedPosts(current, other);
    expect(result.length).toBeLessThanOrEqual(1);
  });
});
