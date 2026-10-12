import type { Metadata } from 'next';
import JsonLd from '@/components/JsonLd';
import { getBreadcrumbSchema } from '@/lib/jsonld';
import { DEFAULT_SHARE_IMAGE } from '@/lib/share-images';

export const metadata: Metadata = {
  title: 'Contact Us & Book an Appointment',
  description:
    'Book in-clinic or online appointments at Hope Trust, Banjara Hills, Hyderabad. Open 10 AM to 7 PM, Monday to Saturday. Call +91 9000850001.',
  keywords:
    'contact Hope Trust, book appointment, therapy Hyderabad, mental health clinic, Banjara Hills, phone number, email',
  alternates: {
    canonical: '/contact/',
  },
  openGraph: {
    title: 'Contact Us | Hope Trust',
    description:
      'Reach out for in-clinic or online appointments. Office hours 10 AM to 7 PM, Monday to Saturday. Banjara Hills, Hyderabad.',
    type: 'website',
    siteName: 'Hope Trust',
    images: [DEFAULT_SHARE_IMAGE],
  },
};

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <JsonLd data={getBreadcrumbSchema([
        { name: 'Home', url: 'https://hopetrustindia.com/' },
        { name: 'Contact Us', url: 'https://hopetrustindia.com/contact/' },
      ])} />
      {children}
    </>
  );
}
