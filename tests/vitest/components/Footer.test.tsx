import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('next/font/google', () => ({
  Bricolage_Grotesque: () => ({ className: 'mock-font' }),
}));

import Footer from '@/components/Footer';

describe('Footer', () => {
  it('renders the footer', () => {
    render(<Footer />);
    expect(screen.getByAltText('Hope Trust')).toBeInTheDocument();
  });

  it('renders navigation links', () => {
    render(<Footer />);
    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThan(3);
  });

  it('renders social media links', () => {
    render(<Footer />);
    // Footer contains external links to social media
    const links = screen.getAllByRole('link');
    const externalLinks = links.filter((l) => l.getAttribute('target') === '_blank');
    expect(externalLinks.length).toBeGreaterThanOrEqual(1);
  });

  it('offers the newsletter sign-up', () => {
    render(<Footer />);
    expect(screen.getByRole('button', { name: 'Subscribe to our newsletter' })).toBeInTheDocument();
  });
});
