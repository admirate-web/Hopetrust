import { describe, it, expect } from 'vitest';
import { SIZE_WARN_BYTES, newsletterImagesBase, renderIssueHtml } from '@/lib/newsletter/render';
import { buildSampleIssue } from '@/lib/newsletter/sample-issue';

const IMAGES = newsletterImagesBase('https://mjgbotzrjmwggzwkoovi.supabase.co');
const result = renderIssueHtml(buildSampleIssue(IMAGES), {
  mode: 'send',
  siteUrl: 'https://hopetrustindia.com',
  assetBaseUrl: `${IMAGES}/static`,
  imagePrefixes: [`${IMAGES}/`],
});

describe('sample issue (design PDF, October 2026)', () => {
  it('stays under the 80 KB warning size', () => {
    expect(result.bytes).toBeLessThan(SIZE_WARN_BYTES);
  });

  it('has every section heading from the design', () => {
    for (const heading of [
      'You are a River, not a Rock',
      'Listening to Yourself—Without the Static',
      'Face the Inner Shadows',
      'Humour Helps, Seriously',
    ]) {
      expect(result.html).toContain(heading);
    }
  });

  it('turns the PDF’s raw “(https://…)” links into named links', () => {
    expect(result.html).not.toMatch(/\(https?:\/\//);
    for (const name of ['Carl Rogers', 'mindfulness', 'Carl Jung', 'Rumi']) {
      expect(result.html).toContain(`>${name}</a>`);
    }
  });

  it('uses the sample photo from the bucket and the pull-quote from the design', () => {
    expect(result.html).toContain(`${IMAGES}/static/sample-hero-2026-10.jpg`);
    expect(result.html).toContain('“I am large, &amp; I contain multitudes.”');
  });

  it('matches the saved snapshot', () => {
    expect(result.html).toMatchSnapshot();
  });
});
