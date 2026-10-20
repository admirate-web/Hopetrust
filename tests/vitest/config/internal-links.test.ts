import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Every page lives at a trailing-slash URL (`trailingSlash: true`), and Netlify
// answers the slashless form with a 301. Next's <Link> adds the slash itself,
// but a plain <a href="/book-your-session"> is published exactly as written —
// so the main buttons on the home page and /mental-health/ sent every visitor
// and every Googlebot crawl through a redirect, and Search Console counted the
// slashless URL under "Page with redirect".

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx$/.test(entry)) out.push(full);
  }
  return out;
}

// `[^<]*?` rather than `[^>]*?`: an arrow function in an earlier prop
// (`onClick={() => ...}`) contains a `>` that would otherwise end the match.
const PLAIN_ANCHOR_HREF = /<a\s[^<]*?\bhref=["'](\/[^"'#?]*)["']/g;

/** A page path that Netlify would redirect: no trailing slash, not a file. */
function redirects(path: string): boolean {
  if (path.endsWith('/')) return false;
  if (/\.[a-z0-9]{2,5}$/i.test(path)) return false;
  return !/^\/(api|_next|\.netlify)\//.test(path);
}

const offenders: string[] = [];
for (const file of [...sourceFiles('app'), ...sourceFiles('components')]) {
  for (const m of readFileSync(file, 'utf8').matchAll(PLAIN_ANCHOR_HREF)) {
    if (redirects(m[1])) offenders.push(`${file}: <a href="${m[1]}">`);
  }
}

describe('plain <a> links to site pages', () => {
  it('end in a slash, so they reach the page without a redirect', () => {
    expect(offenders).toEqual([]);
  });
});
