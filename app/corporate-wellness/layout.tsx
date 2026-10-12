import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import JsonLd from '@/components/JsonLd';
import { corporateFaqs } from '@/lib/faqs';
import { getServiceSchema, getBreadcrumbSchema, getFAQSchema } from '@/lib/jsonld';
import { DEFAULT_SHARE_IMAGE } from '@/lib/share-images';

export const metadata: Metadata = {
  title: 'Corporate Wellness & Employee Mental Health',
  description:
    'Corporate wellness programmes supporting employee mental health and reducing workplace stress. Sessions, workshops and structured support in Hyderabad.',
  keywords:
    'corporate wellness, employee mental health, workplace stress, EAP, employee assistance programme, mental health workshops, Hope Trust Hyderabad, team wellbeing',
  alternates: {
    canonical: '/corporate-wellness/',
  },
  openGraph: {
    title: 'Corporate Wellness | Hope Trust',
    description:
      'Corporate wellness programmes to support employee mental health and reduce workplace stress.',
    type: 'website',
    siteName: 'Hope Trust',
    images: [DEFAULT_SHARE_IMAGE],
  },
};

export default function CorporateWellnessLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <JsonLd data={getServiceSchema({
        name: 'Corporate Wellness Programs',
        description: 'Corporate wellness programmes to support employee mental health, reduce workplace stress, and boost team wellbeing in Hyderabad.',
        url: 'https://hopetrustindia.com/corporate-wellness/',
        serviceType: 'Corporate Wellness',
      })} />
      <JsonLd data={getFAQSchema(corporateFaqs)} />
      <JsonLd data={getBreadcrumbSchema([
        { name: 'Home', url: 'https://hopetrustindia.com/' },
        { name: 'Corporate Wellness', url: 'https://hopetrustindia.com/corporate-wellness/' },
      ])} />
      {children}
    </>
  );
}
