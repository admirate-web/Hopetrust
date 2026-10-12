import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { DEFAULT_SHARE_IMAGE, SITE_ICONS } from '@/lib/share-images';

// What a link looks like outside the site: the picture WhatsApp, LinkedIn and
// Facebook show beside a shared link (og:image), and the icon Google prints
// next to the site name in its results. Both used to be the round logo from
// Supabase storage — an 846x855 PNG whose transparent corners are stored as
// transparent black. Google requires a square favicon, and once it flattened
// that image the corners came out black.

function publicFile(url: string): string {
  return join('public', url.replace(/^\//, ''));
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** The `{ ... }` that follows each `openGraph:` in a file. */
function openGraphBlocks(text: string): string[] {
  const blocks: string[] = [];
  for (const m of text.matchAll(/openGraph:\s*\{/g)) {
    let depth = 0;
    const start = m.index! + m[0].length - 1;
    for (let i = start; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}' && --depth === 0) {
        blocks.push(text.slice(start, i + 1));
        break;
      }
    }
  }
  return blocks;
}

describe('default share image', () => {
  it('is a 1200x630 file served from this site', async () => {
    expect(DEFAULT_SHARE_IMAGE.url).toMatch(/^\//);
    const file = publicFile(DEFAULT_SHARE_IMAGE.url);
    expect(existsSync(file)).toBe(true);

    const meta = await sharp(file).metadata();
    expect([meta.width, meta.height]).toEqual([1200, 630]);
    expect([DEFAULT_SHARE_IMAGE.width, DEFAULT_SHARE_IMAGE.height]).toEqual([1200, 630]);
  });

  it('is small enough for WhatsApp to show (it drops previews over ~300 KB)', () => {
    expect(statSync(publicFile(DEFAULT_SHARE_IMAGE.url)).size).toBeLessThan(300 * 1024);
  });
});

// Next.js replaces a parent's `openGraph` object wholesale rather than merging
// it, so a layout that sets `openGraph` without `images` publishes no og:image
// at all — /mental-health/, /addiction/, /about/, /contact/ and the rest shared
// as bare text.
describe('every page that sets openGraph also sets an image', () => {
  const files = [...sourceFiles('app'), ...sourceFiles('components')].filter((f) =>
    readFileSync(f, 'utf8').includes('openGraph:')
  );

  it('finds the pages to check', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files)('%s', (file) => {
    for (const block of openGraphBlocks(readFileSync(file, 'utf8'))) {
      expect(block).toMatch(/\bimages\s*:/);
      // `post.featuredImage ? [...] : []` leaves posts without a picture bare.
      expect(block).not.toMatch(/images\s*:[^\n]*:\s*\[\s*\]/);
    }
  });
});

describe('site icons', () => {
  const icons = [...SITE_ICONS.icon, ...SITE_ICONS.apple];

  it('are served from this site, not from storage', () => {
    for (const icon of icons) {
      expect(icon.url).toMatch(/^\//);
      expect(existsSync(publicFile(icon.url))).toBe(true);
    }
  });

  it('include /favicon.ico, which browsers and crawlers request on their own', () => {
    expect(SITE_ICONS.icon.map((i) => i.url)).toContain('/favicon.ico');
  });

  it.each(
    [...SITE_ICONS.icon, ...SITE_ICONS.apple].filter((i) => i.url.endsWith('.png'))
  )('$url is square, the size it claims, and opaque in the corners', async (icon) => {
    const file = publicFile(icon.url);
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(info.height);
    expect(`${info.width}x${info.height}`).toBe(icon.sizes);

    // A transparent corner is what Google rendered as black.
    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];
    const last = info.width - 1;
    for (const [x, y] of [[0, 0], [last, 0], [0, last], [last, last]]) {
      expect(alphaAt(x, y)).toBe(255);
    }
  });

  it('give Google a PNG icon of at least 48px, in a multiple of 48', () => {
    const png = SITE_ICONS.icon.find((i) => i.url.endsWith('.png'));
    expect(png).toBeDefined();
    const size = Number(png!.sizes.split('x')[0]);
    expect(size).toBeGreaterThanOrEqual(48);
    expect(size % 48).toBe(0);
  });

  it('ship favicon.ico as a real ICO file', () => {
    const ico = readFileSync('public/favicon.ico');
    // ICONDIR: reserved 0, type 1 (icon), at least one image.
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBeGreaterThan(0);
  });
});
