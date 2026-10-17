// Writes lib/newsletter/posts.generated.json: every blog post as The Hope Letter
// needs it (fortnightly spec §5.7). `npm run build` runs this first, so a new
// post joins the newsletter with the deploy that adds it. The functions bundle
// the file; the committed copy keeps local runs and tests working.
//
// Run: npm run newsletter:posts   (Node's built-in TypeScript, no build step)

import { writeFileSync } from 'node:fs';
import { getAllPosts } from '../lib/blog.ts';
import { toNewsletterPost } from '../lib/newsletter/posts.ts';

const posts = getAllPosts()
  .map(toNewsletterPost)
  .sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));

writeFileSync(new URL('../lib/newsletter/posts.generated.json', import.meta.url), `${JSON.stringify(posts, null, 2)}\n`);
console.log(`newsletter posts: ${posts.length}, ${posts.filter((p) => p.image).length} with a usable photo`);
