import { describe, it, expect, vi } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { boxes } from './mp4';

vi.mock('next/font/google', () => ({
  Bricolage_Grotesque: () => ({ className: 'mock-font' }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/mental-health/',
}));

import MentalHealthPage from '@/app/mental-health/page';

// The hero used to stream a 6 MB, 3840x2160 MP4 from Supabase storage
// (Cache-Control: no-cache, so never held at the CDN edge) with its index box
// at the end of the file, behind a poster that was a line drawing of a face.
// Visitors saw a blank screen, then the drawing with white text on white, and
// only seconds later the video.

function heroVideo() {
  const { container } = render(<MentalHealthPage />);
  const video = container.querySelector('main section video');
  expect(video).not.toBeNull();
  return video as HTMLVideoElement;
}

describe('mental health hero video', () => {
  it('plays a file from this site, not from storage', () => {
    const src = heroVideo().querySelector('source')?.getAttribute('src') ?? '';
    expect(src).toMatch(/^\/videos\/.+\.mp4$/);
    expect(existsSync(join('public', src))).toBe(true);
  });

  it('has its index before the media, so playback can start while it downloads', () => {
    const src = heroVideo().querySelector('source')!.getAttribute('src')!;
    const order = boxes(readFileSync(join('public', src)));
    expect(order).toContain('moov');
    expect(order.indexOf('moov')).toBeLessThan(order.indexOf('mdat'));
  });

  it('is small enough for a phone', () => {
    const src = heroVideo().querySelector('source')!.getAttribute('src')!;
    expect(statSync(join('public', src)).size).toBeLessThan(2.5 * 1024 * 1024);
  });

  it('shows a still of the same footage while the video loads', () => {
    const poster = heroVideo().getAttribute('poster') ?? '';
    expect(poster).toMatch(/^\/images\/.+\.(webp|jpg)$/);
    expect(existsSync(join('public', poster))).toBe(true);
  });

  it('sits on a dark background, so the white heading reads before anything loads', () => {
    const hero = heroVideo().closest('section')!;
    expect(hero.className).toMatch(/\bbg-\[#[0-9A-Fa-f]{6}\]/);
  });
});

describe('mental health hero services line', () => {
  it('never breaks inside a two-word service', () => {
    const { container } = render(<MentalHealthPage />);
    const hero = container.querySelector('main section')!;
    for (const label of ['Couples Therapy', 'Family Therapy']) {
      const el = [...hero.querySelectorAll('span')].find((s) => s.textContent === label);
      expect(el, label).toBeDefined();
      expect(el!.className).toMatch(/\bwhitespace-nowrap\b/);
    }
  });
});
