import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import PrivacyPolicyPage from '@/app/privacy-policy/page';

vi.mock('next/font/google', () => ({ Bricolage_Grotesque: () => ({ className: 'mock-font' }) }));
vi.mock('@/lib/assets', () => ({ getAssetUrl: (path: string) => `/mock/${path}` }));
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/privacy-policy/' }));

describe('privacy policy', () => {
  // The sign-up form's notice links here (spec §7.1).
  it('has a newsletter section that says what is kept, who sends it and how to leave', () => {
    const { container } = render(<PrivacyPolicyPage />);
    const section = container.querySelector('#newsletter');
    expect(section).not.toBeNull();
    const text = section!.textContent ?? '';
    expect(text).toMatch(/name and email address/);
    expect(text).toMatch(/IP address/);
    expect(text).toMatch(/Resend/);
    expect(text).toMatch(/unsubscribe at any time/i);
    expect(text).toMatch(/30 days/);
    expect(section!.querySelector('a[href="mailto:frontoffice@hopetrustindia.com"]')).not.toBeNull();
  });
});
