import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('next/font/google', () => ({
  Bricolage_Grotesque: () => ({ className: 'mock-font' }),
}));

vi.mock('@/lib/assets', () => ({
  getAssetUrl: (path: string) => `/mock/${path}`,
}));

import BackgroundCirclesSection from '@/components/BackgroundCirclesSection';
import ClientsSayingSection from '@/components/ClientsSayingSection';

// Google writes its own result snippet from page text whenever it thinks the
// meta description fits the search less well — and for "hope trust hyderabad"
// the homepage's only full sentences were thirty testimonials, most of them
// about one therapist. The result under the site's name read "Rajeshwari has
// been an invaluable support…", in India and abroad.

describe('homepage text Google can quote', () => {
  it('starts with a paragraph about the clinic, naming the city', () => {
    const { container } = render(<BackgroundCirclesSection />);
    const about = [...container.querySelectorAll('p')].find((p) =>
      p.textContent?.startsWith('Hope Trust is')
    );
    expect(about).toBeDefined();
    expect(about!.textContent).toMatch(/Hyderabad/);
    expect(about!.textContent).toMatch(/since 2002/i);
  });

  it('keeps the testimonials out of search snippets', () => {
    const { container } = render(<ClientsSayingSection />);
    // Google honours data-nosnippet on section, div and span only.
    const section = container.querySelector('section');
    expect(section).toHaveAttribute('data-nosnippet');
    expect(section!.textContent).toMatch(/Rajeshwari/);
  });
});
