import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Confirm your subscription',
  description: 'Confirm your subscription to the Hope Trust newsletter.',
  robots: { index: false, follow: false },
  alternates: { canonical: '/newsletter/confirm/' },
};

export default function NewsletterConfirmLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
