import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

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

vi.mock('next/font/google', () => ({
  Bricolage_Grotesque: () => ({ className: 'mock-font' }),
}));

import Header from '@/components/Header';

describe('Header', () => {
  it('renders the logo', () => {
    render(<Header />);
    const logos = screen.getAllByAltText('Hope Trust Logo');
    expect(logos.length).toBeGreaterThanOrEqual(1);
  });

  it('renders navigation links', () => {
    render(<Header />);
    expect(screen.getAllByText('About Us').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Mental Health').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Contact Us').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Book Your Session').length).toBeGreaterThanOrEqual(1);
  });

  it('has a mobile menu toggle button', () => {
    render(<Header />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it('renders correct number of nav items', () => {
    render(<Header />);
    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThan(5);
  });
});
