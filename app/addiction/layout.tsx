import type { Metadata } from 'next';
import JsonLd from '@/components/JsonLd';
import { addictionFaqs } from '@/lib/faqs';
import { getServiceSchema, getBreadcrumbSchema, getFAQSchema } from '@/lib/jsonld';
import { DEFAULT_SHARE_IMAGE } from '@/lib/share-images';

/**
 * Search Console had this page at positions 35–70 for the searches it exists
 * for — "alcohol addiction treatment hyderabad", "drug addiction treatment in
 * hyderabad", "alcohol de addiction treatment" — while a 2018 blog post
 * outranked it. The title now uses the words people search with, including
 * "de-addiction", the term most Indian searchers use.
 */
export const metadata: Metadata = {
  title: 'Alcohol & Drug De-Addiction Treatment in Hyderabad',
  description:
    'Outpatient and online de-addiction treatment in Hyderabad for alcohol, drugs, nicotine and gambling, with counselling, family sessions and psychiatric care.',
  keywords:
    'de-addiction centre Hyderabad, alcohol de-addiction treatment, drug addiction treatment Hyderabad, rehab Hyderabad, nicotine cessation, gambling addiction treatment, Hope Trust',
  alternates: {
    canonical: '/addiction/',
  },
  openGraph: {
    title: 'Alcohol & Drug De-Addiction Treatment in Hyderabad | Hope Trust',
    description:
      'Outpatient and online de-addiction programmes for alcohol, drugs, nicotine and behavioural addictions, with family sessions and psychiatric care.',
    type: 'website',
    url: 'https://hopetrustindia.com/addiction/',
    siteName: 'Hope Trust',
    locale: 'en_IN',
    images: [DEFAULT_SHARE_IMAGE],
  },
};

export default function AddictionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <JsonLd data={getServiceSchema({
        name: 'Alcohol & Drug De-Addiction Treatment',
        description: 'Outpatient and online de-addiction programmes in Hyderabad for alcohol, drug, nicotine and behavioural addictions, with counselling, family sessions, psychiatric consultations and after-care.',
        url: 'https://hopetrustindia.com/addiction/',
        serviceType: 'Addiction Treatment',
      })} />
      <JsonLd data={getFAQSchema(addictionFaqs)} />
      <JsonLd data={getBreadcrumbSchema([
        { name: 'Home', url: 'https://hopetrustindia.com/' },
        { name: 'Addiction Services', url: 'https://hopetrustindia.com/addiction/' },
      ])} />
      {children}
    </>
  );
}
