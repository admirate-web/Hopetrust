import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { pickSlugMatch } from '@/lib/slug-match';

const slugs = fs
  .readdirSync(path.join(process.cwd(), 'content', 'blogs'))
  .filter((f) => f.endsWith('.mdx'))
  .map((f) => f.replace(/\.mdx$/, ''));

describe('pickSlugMatch', () => {
  // Real misspellings from Search Console, each with the post it meant.
  it.each([
    ['9-interesting-traits-of-people-who-rarely-post-on-social-media', '9-interesting-traits-of-people-who-never-post-on-social-media'],
    ['15-things-money-cant-bound-no-matter-how-rich-you-are', '15-things-money-cant-buy-no-matter-how-rich-you-are'],
    ['the-4-ds-to-help-prevent-relapse', 'the-4-ds-to-help-you-prevent-relapse'],
    ['most-commonly-used-drugs-in-the-world', 'most-commonly-abused-drugs-in-the-world'],
    ['what-challenges-do-teens-face-today', 'what-challenges-do-teenagers-face-today'],
  ])('forwards %s to the post it meant', (wanted, expected) => {
    expect(pickSlugMatch(wanted, slugs).forward).toBe(expected);
  });

  it('suggests rather than forwards when the match is only partial', () => {
    const res = pickSlugMatch('15-things-money-cant-buy', slugs);
    expect(res.forward).toBeNull();
    expect(res.suggest[0]).toBe('15-things-money-cant-buy-no-matter-how-rich-you-are');
  });

  it('does not forward a short word to a post that merely contains it', () => {
    // "alcoholism" scores 0.75 against "sex-and-alcoholism" — close, but
    // forwarding there would be a wrong guess presented as an answer.
    expect(pickSlugMatch('alcoholism', slugs).forward).toBeNull();
  });

  it('offers nothing for an unrelated path', () => {
    expect(pickSlugMatch('zzqx-vvwk', slugs)).toEqual({ forward: null, suggest: [] });
  });

  it('survives being inlined as source text', () => {
    // The 404 page embeds the function via toString(); this is the same trip.
    // eslint-disable-next-line no-new-func
    const inlined = new Function(`return (${pickSlugMatch.toString()})`)();
    expect(inlined('the-4-ds-to-help-prevent-relapse', slugs).forward).toBe(
      'the-4-ds-to-help-you-prevent-relapse'
    );
  });
});
