/**
 * Picks the post a misspelt article URL was most likely meant to reach.
 *
 * Search Console records a steady trickle of requests for blog slugs that are
 * almost right — "…people-who-rarely-post-on-social-media", "…money-cant-bound…"
 * — mostly from links on other sites and from AI answers quoting a URL from
 * memory. The known ones are 301-redirected in netlify.toml; the 404 page uses
 * this to catch the rest.
 *
 * Scoring is the Sørensen–Dice coefficient over character bigrams: 1 for
 * identical slugs, 0 for nothing in common. The thresholds were calibrated on
 * the misspellings Search Console recorded — genuine near-misses score
 * 0.87–0.97 against the right post, while the closest wrong match seen
 * ("alcoholism" → "sex-and-alcoholism") scores 0.75. Forwarding also needs a
 * clear winner, so two similar slugs are never decided by a coin toss.
 *
 * Self-contained on purpose: the 404 page inlines this function's source into
 * a <script>, so it must not reference anything outside its own body, and it
 * sticks to syntax that compiles to itself (no destructuring or spread).
 */
export function pickSlugMatch(
  wanted: string,
  slugs: string[]
): { forward: string | null; suggest: string[] } {
  var FORWARD_AT = 0.86;
  var FORWARD_MARGIN = 0.2;
  var SUGGEST_AT = 0.45;

  function bigrams(s: string): Map<string, number> {
    var out = new Map<string, number>();
    var clean = s.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (var i = 0; i < clean.length - 1; i++) {
      var g = clean.slice(i, i + 2);
      out.set(g, (out.get(g) || 0) + 1);
    }
    return out;
  }

  function similarity(a: string, b: string): number {
    var A = bigrams(a);
    var B = bigrams(b);
    var shared = 0;
    var total = 0;
    A.forEach(function (n, g) {
      shared += Math.min(n, B.get(g) || 0);
      total += n;
    });
    B.forEach(function (n) {
      total += n;
    });
    return total === 0 ? 0 : (2 * shared) / total;
  }

  var ranked = slugs
    .map(function (slug) {
      return { slug: slug, score: similarity(wanted, slug) };
    })
    .filter(function (r) {
      return r.score >= SUGGEST_AT;
    })
    .sort(function (a, b) {
      return b.score - a.score;
    });

  var best = ranked[0];
  var runnerUp = ranked[1];
  if (
    best &&
    best.score >= FORWARD_AT &&
    best.score - (runnerUp ? runnerUp.score : 0) >= FORWARD_MARGIN
  ) {
    return { forward: best.slug, suggest: [] };
  }
  return {
    forward: null,
    suggest: ranked.slice(0, 3).map(function (r) {
      return r.slug;
    }),
  };
}
