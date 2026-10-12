import type { Metadata } from 'next';
import JsonLd from '@/components/JsonLd';
import { mentalHealthFaqs } from '@/lib/faqs';
import { getServiceSchema, getBreadcrumbSchema, getFAQSchema } from '@/lib/jsonld';
import { DEFAULT_SHARE_IMAGE } from '@/lib/share-images';

export const metadata: Metadata = {
  title: 'Therapy, Counselling & Psychiatry in Hyderabad',
  description:
    'Therapy, psychiatry, couples and family therapy in Banjara Hills, Hyderabad, for anxiety, depression, trauma, ADHD, OCD and grief. In-clinic or online.',
  keywords:
    'mental health, therapy, psychiatry, couples therapy, family therapy, anxiety, depression, ADHD, OCD, trauma, counselling Hyderabad, Hope Trust',
  alternates: {
    canonical: '/mental-health/',
  },
  openGraph: {
    title: 'Therapy, Counselling & Psychiatry in Hyderabad | Hope Trust',
    description:
      'Support for the mind, emotions, relationships, and everyday life. Therapy, medications, couples therapy, family therapy, and more.',
    type: 'website',
    url: 'https://hopetrustindia.com/mental-health/',
    siteName: 'Hope Trust',
    locale: 'en_IN',
    images: [DEFAULT_SHARE_IMAGE],
  },
};

export default function MentalHealthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <JsonLd data={getServiceSchema({
        name: 'Mental Health Services',
        description: 'Comprehensive mental health support including therapy, psychiatry, couples therapy, and family therapy in Hyderabad.',
        url: 'https://hopetrustindia.com/mental-health/',
        serviceType: 'Mental Health Therapy',
      })} />
      <JsonLd data={getFAQSchema(mentalHealthFaqs)} />
      <JsonLd data={getBreadcrumbSchema([
        { name: 'Home', url: 'https://hopetrustindia.com/' },
        { name: 'Mental Health', url: 'https://hopetrustindia.com/mental-health/' },
      ])} />
      {children}
    </>
  );
}
