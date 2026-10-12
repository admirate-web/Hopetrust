import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import JsonLd from '@/components/JsonLd';
import { interventionFaqs } from '@/lib/faqs';
import { getServiceSchema, getBreadcrumbSchema, getFAQSchema } from '@/lib/jsonld';
import { DEFAULT_SHARE_IMAGE } from '@/lib/share-images';

export const metadata: Metadata = {
  title: 'Professional Addiction Intervention',
  description:
    'Professional intervention services at your doorstep. Help a loved one seek treatment for alcohol, drug, gambling or internet addiction.',
  keywords:
    'addiction intervention, professional intervention, drug intervention, alcohol intervention, family intervention, Hope Trust intervention, Hyderabad, intervention services',
  alternates: {
    canonical: '/intervention-services/',
  },
  openGraph: {
    title: 'Intervention Services | Hope Trust',
    description:
      'Professional intervention services to help loved ones seek addiction treatment.',
    type: 'website',
    siteName: 'Hope Trust',
    images: [DEFAULT_SHARE_IMAGE],
  },
};

export default function InterventionServicesLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <JsonLd data={getServiceSchema({
        name: 'Intervention Services',
        description: 'Professional addiction intervention services at your doorstep to help loved ones seek treatment in Hyderabad.',
        url: 'https://hopetrustindia.com/intervention-services/',
        serviceType: 'Addiction Intervention',
      })} />
      <JsonLd data={getFAQSchema(interventionFaqs)} />
      <JsonLd data={getBreadcrumbSchema([
        { name: 'Home', url: 'https://hopetrustindia.com/' },
        { name: 'Intervention Services', url: 'https://hopetrustindia.com/intervention-services/' },
      ])} />
      {children}
    </>
  );
}
