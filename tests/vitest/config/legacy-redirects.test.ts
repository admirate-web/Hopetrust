import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// netlify.toml carries the old WordPress site's URLs over to this one. The
// failure it can't show by itself is a redirect into a 404: `/blog/:slug` sends
// every old post URL to `/blogs/:slug/` whether or not that post still exists
// under the same slug, and Search Console files the old URL under "Page with
// redirect" while Google lands on a 404 and drops whatever the URL had earned.
// This resolves URLs through netlify.toml the way Netlify does (first match
// wins, trailing slash optional, `*` and `:name` placeholders) and checks where
// they end up.

type Rule = { from: string; to: string; status: number };

const rules: Rule[] = readFileSync('netlify.toml', 'utf8')
  .split(/^\s*\[\[redirects\]\]\s*$/m)
  .slice(1)
  // Everything after the last redirect block is headers config, and a
  // commented-out block is not a redirect.
  .map((block) => block.split(/^\s*\[\[/m)[0])
  .map((block) => ({
    from: block.match(/^\s*from\s*=\s*"([^"]+)"/m)?.[1],
    to: block.match(/^\s*to\s*=\s*"([^"]+)"/m)?.[1],
    status: Number(block.match(/^\s*status\s*=\s*(\d+)/m)?.[1] ?? 301),
  }))
  .filter((r): r is Rule => Boolean(r.from && r.to));

const strip = (p: string) => (p.length > 1 ? p.replace(/\/$/, '') : p);

function resolve(path: string): { to: string; status: number } | null {
  const target = strip(path);
  for (const rule of rules) {
    const from = strip(rule.from);
    const params: Record<string, string> = {};
    let matched = false;
    if (from.endsWith('/*')) {
      const base = from.slice(0, -2);
      if (target.startsWith(base + '/')) {
        params.splat = target.slice(base.length + 1);
        matched = true;
      }
    } else if (from === '/*') {
      params.splat = target.slice(1);
      matched = true;
    } else {
      const a = from.split('/');
      const b = target.split('/');
      matched =
        a.length === b.length &&
        a.every((seg, i) => {
          if (seg.startsWith(':')) return (params[seg.slice(1)] = b[i]), true;
          return seg === b[i];
        });
    }
    if (matched) {
      const to = rule.to.replace(/:(\w+)/g, (_, name) => params[name] ?? `:${name}`);
      return { to, status: rule.status };
    }
  }
  return null;
}

/** Does a page exist at this site path? Answered from source, not from a build. */
function pageExists(path: string): boolean {
  const p = path.split('?')[0];
  if (p === '/') return existsSync('app/page.tsx');
  const post = p.match(/^\/blogs\/([^/]+)\/$/);
  if (post && post[1] !== 'p' && post[1] !== 'category') {
    return existsSync(join('content', 'blogs', `${post[1]}.mdx`));
  }
  const therapist = p.match(/^\/therapists\/([^/]+)\/$/);
  if (therapist) {
    const { doctors } = JSON.parse(readFileSync('data/doctors-snapshot.json', 'utf8'));
    return doctors.some(
      (d: { name: string }) =>
        d.name
          .replace(/^(Mrs?\.?|Ms\.?|Dr\.?|Prof\.?)\s+/i, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') === therapist[1]
    );
  }
  return existsSync(join('app', p.replace(/^\/|\/$/g, ''), 'page.tsx'));
}

describe('netlify.toml redirects', () => {
  const permanent = rules.filter((r) => r.status === 301 && !r.to.includes(':'));

  it('finds the redirects to check', () => {
    expect(permanent.length).toBeGreaterThan(50);
  });

  it('send every 301 to a page that exists', () => {
    const broken = permanent.filter((r) => !pageExists(r.to)).map((r) => `${r.from} -> ${r.to}`);
    expect(broken).toEqual([]);
  });
});

// Old URLs Google still requests, from Search Console's 16-month page report
// (2025-06-20 to 2026-10-18) and the Wayback Machine's index of the WordPress
// site. Each used to fall through to a 404, directly or after a redirect.
const OLD_URLS = [
  // Posts whose slug changed: /blog/:slug alone forwards them to a 404.
  '/blog/rehabilitation-for-drug-abuse/',
  '/blog/why-people-drink-alcohol/',
  '/blog/why-people-drink-alcohol-2-11-2023/',
  '/blog/why-do-people-drink-alcohol/',
  '/blog/everything-you-need-to-know-about-depression/',
  '/blog/gambling-addiction-treatment-in-india/',
  '/blog/gambling-addiction-helpline-india/',
  '/blog/gambling-addiction-in-india-treatment/',
  '/blog/gambling-addiction-in-india/',
  '/blog/i-think-im-in-love-but-am-i-hopetrustindia-com-4806387',
  '/blog/iq-doesnt-equal-success-focus-on-your-eq/',
  '/blog/being-silent-can-make-you-more-powerful-successful-and-charismatic-558840035000',
  '/blog/why-some-people-talk-too-muchand-how-to-manage-them/',
  '/blog/why-do-some-people-talk-too-much-and-how-to-manage-them/',
  '/blog/crystal-meth-addiction-treatment-and-rehabilitation-process/',
  '/blog/forget-the-butterflies-why-real-love-feels-like-home-12997207',
  '/blog/top-10-reasons-for-divorce-in-india',
  '/blog/addiction-how-family-suffers-and-what-it-can-do/',
  '/blog/helping-addicts/',
  '/blog/why-emotional-wellness-is-important-for-you-2/',
  // WordPress pages that ranked until the site moved.
  '/adhd-clinic/',
  '/corporate-wellness-csr/',
  '/online-counselling-therapists/',
  '/specialised-addiction-services/',
  '/testimonials/',
  '/terms-conditions/',
  '/psychiatrists-therapist/',
  '/psychologists/',
  '/psychiatrists/',
  '/counselling-therapists/',
  '/therapist-list-2/',
  '/assessments/what-are-psychological-assessments/',
  '/assessments/neuropsychological-assessments/',
  '/assessments/for-adults/',
  '/assessments/for-children-and-adolescents/',
  '/uncategorized/burnout-and-stress-the-new-epidemic/',
];

describe('old WordPress URLs', () => {
  it.each(OLD_URLS)('%s is redirected to a page that exists', (url) => {
    const hit = resolve(url);
    expect(hit?.status).toBe(301);
    expect(pageExists(hit!.to)).toBe(true);
  });
});
