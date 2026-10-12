import type { Metadata } from 'next';
import JsonLd from '@/components/JsonLd';
import { trainingFaqs } from '@/lib/faqs';
import { getServiceSchema, getBreadcrumbSchema, getFAQSchema } from '@/lib/jsonld';
import { DEFAULT_SHARE_IMAGE } from '@/lib/share-images';

export const metadata: Metadata = {
  title: 'Professional Development & Training Programs',
  description:
    'Professional training and certification in mental health and addiction counselling. Evidence-based methodologies taught by Hope Trust experts.',
  keywords:
    'mental health training, addiction counselling course, therapy certification, professional development, Hope Trust training Hyderabad',
  alternates: {
    canonical: '/training/',
  },
  openGraph: {
    title: 'Training | Hope Trust',
    description:
      'Professional training programs in mental health and addiction counselling by Hope Trust.',
    type: 'website',
    siteName: 'Hope Trust',
    images: [DEFAULT_SHARE_IMAGE],
  },
};

export default function TrainingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <JsonLd data={getServiceSchema({
        name: 'Training Programs',
        description: 'Professional training and certification programs in mental health, addiction counselling, and therapeutic techniques in Hyderabad.',
        url: 'https://hopetrustindia.com/training/',
        serviceType: 'Clinical Training',
      })} />
      <JsonLd data={getFAQSchema(trainingFaqs)} />
      <JsonLd data={getBreadcrumbSchema([
        { name: 'Home', url: 'https://hopetrustindia.com/' },
        { name: 'Training', url: 'https://hopetrustindia.com/training/' },
      ])} />
      {children}
    </>
  );
}
