import type { Metadata } from 'next';
import JsonLd from '@/components/JsonLd';
import { getBreadcrumbSchema } from '@/lib/jsonld';
import { DEFAULT_SHARE_IMAGE } from '@/lib/share-images';

export const metadata: Metadata = {
  title: 'About Us — Our Story, Team & Approach',
  description:
    'Hope Trust has offered a calm, steady space for healing since 2002. Meet our 30+ multidisciplinary team and our evidence-based approach to recovery.',
  keywords:
    'Hope Trust, about us, mental health clinic Hyderabad, addiction recovery, therapy team, evidence-based treatment, wellness coaching',
  alternates: {
    canonical: '/about/',
  },
  openGraph: {
    title: 'About Us | Hope Trust',
    description:
      'From one family\'s journey to a global network of care — Hope Trust stands for recovery, healing, and rebuilding meaningful lives.',
    type: 'website',
    siteName: 'Hope Trust',
    images: [DEFAULT_SHARE_IMAGE],
  },
};

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <JsonLd data={getBreadcrumbSchema([
        { name: 'Home', url: 'https://hopetrustindia.com/' },
        { name: 'About Us', url: 'https://hopetrustindia.com/about/' },
      ])} />
      {children}
    </>
  );
}
