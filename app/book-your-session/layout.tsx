import type { Metadata } from 'next';
import JsonLd from '@/components/JsonLd';
import { getBreadcrumbSchema } from '@/lib/jsonld';

/**
 * This page draws more search impressions than any other on the site — about
 * 67,000 in the 90 days to 2026-10-08 — almost all of them for "psychologist
 * hyderabad", "therapist near me", "best psychologist in hyderabad" and their
 * variants, at an average position of 7–9. The title and heading used to say
 * only "Book Your Session", which matches none of those searches; they now
 * name what the page is.
 */
export const metadata: Metadata = {
  title: 'Psychologists & Therapists in Hyderabad',
  description:
    'Book a clinical psychologist, psychiatrist or counsellor at Hope Trust, Banjara Hills, Hyderabad. Compare expertise and languages, and meet in person or online.',
  keywords:
    'psychologist in Hyderabad, therapist in Hyderabad, clinical psychologist Hyderabad, psychiatrist Hyderabad, counsellor Hyderabad, Banjara Hills, online therapy, Hope Trust',
  alternates: {
    canonical: '/book-your-session/',
  },
  openGraph: {
    title: 'Psychologists & Therapists in Hyderabad | Hope Trust',
    description:
      'Choose a clinical psychologist, psychiatrist or counsellor and book an in-clinic or online session at Hope Trust, Banjara Hills, Hyderabad.',
    type: 'website',
    url: 'https://hopetrustindia.com/book-your-session/',
    siteName: 'Hope Trust',
    locale: 'en_IN',
  },
};

export default function BookYourSessionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <JsonLd data={getBreadcrumbSchema([
        { name: 'Home', url: 'https://hopetrustindia.com/' },
        { name: 'Psychologists & Therapists', url: 'https://hopetrustindia.com/book-your-session/' },
      ])} />
      {children}
    </>
  );
}
