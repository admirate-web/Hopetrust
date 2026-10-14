import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import LargeRectangleSection from '@/components/LargeRectangleSection';

vi.mock('next/font/google', () => ({
  Bricolage_Grotesque: () => ({ className: 'mock-font' }),
  Roboto_Flex: () => ({ className: 'mock-font' }),
}));
vi.mock('next/image', () => ({ default: ({ alt }: { alt: string }) => <img alt={alt} /> }));
vi.mock('@/lib/assets', () => ({ getAssetUrl: (path: string) => `/mock/${path}` }));
vi.mock('@/components/VariableProximity', () => ({ default: ({ label }: { label: string }) => <span>{label}</span> }));
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe('LargeRectangleSection (homepage newsletter card)', () => {
  it('describes the monthly newsletter and carries the sign-up form', () => {
    render(<LargeRectangleSection />);
    expect(screen.getByText('A monthly letter from our team, with ideas you can use between sessions.')).toBeInTheDocument();
    expect(screen.queryByText(/Connect with others, share experiences/)).toBeNull();
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
  });
});
