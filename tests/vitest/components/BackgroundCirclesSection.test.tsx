import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/font/google', () => ({
  Bricolage_Grotesque: () => ({ className: 'mock-font' }),
}));

import BackgroundCirclesSection from '@/components/BackgroundCirclesSection';

describe('BackgroundCirclesSection', () => {
  // It was a <button> with no handler: the homepage's second call to action
  // did nothing when tapped.
  it('"Find A Therapist" goes to the booking page', () => {
    render(<BackgroundCirclesSection />);
    const cta = screen.getByRole('link', { name: 'Find A Therapist' });
    expect(cta).toHaveAttribute('href', '/book-your-session/');
  });
});
