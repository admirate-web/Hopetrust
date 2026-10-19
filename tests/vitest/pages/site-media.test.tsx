import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactElement } from 'react';
import { boxes } from './mp4';

vi.mock('next/font/google', () => ({
  Bricolage_Grotesque: () => ({ className: 'mock-font' }),
  Roboto_Flex: () => ({ className: 'mock-font' }),
}));

// next.config.js sets images.unoptimized, so next/image renders its src as
// given; a plain <img> does the same here.
vi.mock('next/image', () => ({
  default: ({ fill, priority, ...rest }: Record<string, unknown>) => {
    return <img {...rest} data-fill={fill ? 'true' : undefined} />;
  },
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

// The program lists load in the browser; no image or video depends on them.
vi.mock('@/lib/programs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/programs')>()),
  fetchPrograms: async () => [],
}));
vi.mock('@/lib/training-programs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/training-programs')>()),
  fetchTrainingPrograms: async () => [],
}));

import HeroSection from '@/components/HeroSection';
import BackgroundCirclesSection from '@/components/BackgroundCirclesSection';
import WhatWeOfferSection from '@/components/WhatWeOfferSection';
import RectangleSection from '@/components/RectangleSection';
import ResourcesSection from '@/components/ResourcesSection';
import LargeRectangleSection from '@/components/LargeRectangleSection';
import AffiliationsSection from '@/components/AffiliationsSection';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ChatBubble from '@/components/ChatBubble';
import AboutPage from '@/app/about/page';
import AddictionPage from '@/app/addiction/page';
import CorporateWellnessPage from '@/app/corporate-wellness/page';
import InterventionServicesPage from '@/app/intervention-services/page';
import MentalHealthPage from '@/app/mental-health/page';
import TrainingPage from '@/app/training/page';
import CancellationPolicyPage from '@/app/cancellation-policy/page';
import PrivacyPolicyPage from '@/app/privacy-policy/page';
import TermsAndConditionsPage from '@/app/terms-and-conditions/page';

// These pages used to load ~45 images and videos from Supabase storage: a
// 1-hour cache, 0.4-3 s before each file started arriving, and ~62 MB of video
// on the homepage alone (two 4K/60 fps hero loops started before any scroll).
// The site's own files come from the Netlify edge, cached for a year.

const MB = 1024 * 1024;

type Media = { kind: 'image' | 'video'; src: string };

function mediaIn(root: HTMLElement): Media[] {
  const found: Media[] = [];
  root.querySelectorAll('img[src]').forEach((img) => found.push({ kind: 'image', src: img.getAttribute('src')! }));
  root.querySelectorAll('video').forEach((video) => {
    const own = video.getAttribute('src');
    if (own) found.push({ kind: 'video', src: own });
    video.querySelectorAll('source[src]').forEach((s) => found.push({ kind: 'video', src: s.getAttribute('src')! }));
    const poster = video.getAttribute('poster');
    if (poster) found.push({ kind: 'image', src: poster });
  });
  return found;
}

// LazyVideo holds back its src until an IntersectionObserver reports it in
// view, and the shared setup's observer never fires. Report everything in view.
class InViewObserver {
  constructor(private callback: IntersectionObserverCallback) {}
  observe(target: Element) {
    this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
const setupObserver = globalThis.IntersectionObserver;
// jsdom has no matchMedia; the about page's text effect asks for the motion
// preference.
const setupMatchMedia = window.matchMedia;
beforeAll(() => {
  globalThis.IntersectionObserver = InViewObserver as unknown as typeof IntersectionObserver;
  window.matchMedia = ((media: string) => ({
    matches: false,
    media,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
afterAll(() => {
  globalThis.IntersectionObserver = setupObserver;
  window.matchMedia = setupMatchMedia;
});

const PAGES: [string, () => ReactElement][] = [
  ['homepage hero', () => <HeroSection />],
  ['homepage intro', () => <BackgroundCirclesSection />],
  ['homepage services', () => <WhatWeOfferSection />],
  ['homepage video band', () => <RectangleSection />],
  ['homepage resources', () => <ResourcesSection />],
  ['homepage community band', () => <LargeRectangleSection />],
  ['homepage affiliations', () => <AffiliationsSection />],
  ['header', () => <Header />],
  ['footer', () => <Footer />],
  ['about page', () => <AboutPage />],
  ['addiction page', () => <AddictionPage />],
  ['corporate wellness page', () => <CorporateWellnessPage />],
  ['intervention services page', () => <InterventionServicesPage />],
  ['mental health page', () => <MentalHealthPage />],
  ['training page', () => <TrainingPage />],
  ['cancellation policy page', () => <CancellationPolicyPage />],
  ['privacy policy page', () => <PrivacyPolicyPage />],
  ['terms and conditions page', () => <TermsAndConditionsPage />],
];

describe.each(PAGES)('%s', (_name, page) => {
  let media: Media[] = [];
  beforeAll(() => {
    media = mediaIn(render(page()).container);
  });

  it('loads every image and video from this site, not from storage', () => {
    expect(media.length).toBeGreaterThan(0);
    for (const { src } of media) {
      expect(src, src).toMatch(/^\/(?!\/)/);
      expect(existsSync(join('public', src)), `${src} is missing from public/`).toBe(true);
    }
  });

  it('keeps every image under 300 KB', () => {
    for (const { src } of media.filter((m) => m.kind === 'image' && existsSync(join('public', m.src)))) {
      expect(statSync(join('public', src)).size, src).toBeLessThan(300 * 1024);
    }
  });

  it('plays only videos that can start while downloading and are small enough for a phone', () => {
    for (const { src } of media.filter((m) => m.kind === 'video')) {
      const file = join('public', src);
      expect(existsSync(file), `${src} is missing from public/`).toBe(true);
      const order = boxes(readFileSync(file));
      expect(order.indexOf('moov'), `${src} has no moov box`).toBeGreaterThan(-1);
      expect(order.indexOf('moov'), `${src} keeps its index after the media`).toBeLessThan(order.indexOf('mdat'));
      expect(statSync(file).size, src).toBeLessThan(2.5 * MB);
    }
  });
});

describe('homepage hero', () => {
  it('shows a still of each video while it loads', () => {
    const videos = render(<HeroSection />).container.querySelectorAll('video');
    expect(videos).toHaveLength(2);
    videos.forEach((video) => {
      const poster = video.getAttribute('poster') ?? '';
      expect(poster).toMatch(/^\/images\/.+\.webp$/);
      expect(existsSync(join('public', poster))).toBe(true);
    });
  });
});

describe('chat bubble', () => {
  it('shows the logo from this site', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reply: 'Hello, and welcome to Hope Trust.', links: [], state: { step: 'ASK_NAME' } }),
    }));
    render(<ChatBubble />);
    fireEvent.click(screen.getByRole('button', { name: /chat/i }));
    await screen.findByRole('log');
    const media = mediaIn(document.body);
    expect(media.length).toBeGreaterThan(0);
    for (const { src } of media) {
      expect(src, src).toMatch(/^\/(?!\/)/);
      expect(existsSync(join('public', src)), `${src} is missing from public/`).toBe(true);
    }
    vi.unstubAllGlobals();
  });
});
