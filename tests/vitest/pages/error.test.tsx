import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('next/font/google', () => ({
  Bricolage_Grotesque: () => ({ className: 'mock-font' }),
}));

import ErrorPage from '@/app/error';

describe('ErrorPage', () => {
  it('renders error message', () => {
    render(<ErrorPage error={new Error('Test error')} reset={() => {}} />);
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it('has a try again button', async () => {
    const mockReset = vi.fn();
    const user = userEvent.setup();
    render(<ErrorPage error={new Error('Test error')} reset={mockReset} />);

    const btn = screen.getByRole('button', { name: /try again/i });
    expect(btn).toBeInTheDocument();
    await user.click(btn);
    expect(mockReset).toHaveBeenCalled();
  });

  it('has a back to home link', () => {
    render(<ErrorPage error={new Error('Test error')} reset={() => {}} />);
    const homeLink = screen.getByRole('link', { name: /back to home/i });
    expect(homeLink).toBeInTheDocument();
    expect(homeLink).toHaveAttribute('href', '/');
  });
});
