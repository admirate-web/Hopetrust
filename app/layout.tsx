import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import WebVitals from '@/components/WebVitals';
import LenisProvider from '@/components/LenisProvider';
import { Toaster } from 'sonner';
import { getLogoUrl } from '@/lib/assets';
import ChatBubble from '@/components/ChatBubble';
import JsonLd from '@/components/JsonLd';
import { getOrganizationSchema, getWebSiteSchema } from '@/lib/jsonld';
import { siteConfig } from '@/lib/config';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  preload: true,
  fallback: ['system-ui', 'arial'],
});

export const metadata: Metadata = {
  title: {
    default: 'Hope Trust - A place for hope, healing, and renewal',
    template: '%s | Hope Trust',
  },
  description:
    'Hope Trust has been supporting individuals and families on their path to recovery for over 20 years. Our care is respectful, evidence-based, and always personal.',
  keywords:
    'mental health, therapy, counselling, recovery, addiction treatment, Hope Trust, Hyderabad, psychiatrist, psychologist, couples therapy, family therapy',
  authors: [{ name: 'Hope Trust' }],
  robots: 'index, follow',
  metadataBase: new URL(siteConfig.url),
  // NOTE: do not set `alternates` here. In the App Router every route inherits
  // it unless it overrides it, which would silently canonicalise all blog posts
  // and policy pages to `/`. Each route declares its own canonical instead.
  icons: {
    icon: getLogoUrl(),
    apple: getLogoUrl(),
  },
  openGraph: {
    title: 'Hope Trust - A place for hope, healing, and renewal',
    description:
      'Hope Trust has been supporting individuals and families on their path to recovery for over 20 years. Mental health and addiction recovery services in Hyderabad.',
    type: 'website',
    siteName: 'Hope Trust',
    locale: 'en_IN',
    url: siteConfig.url,
    images: [
      {
        url: getLogoUrl(),
        width: 512,
        height: 512,
        alt: 'Hope Trust logo',
      },
    ],
  },
};

// Next.js App Router requires viewport to be exported separately
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="smooth-scroll" data-scroll-behavior="smooth" style={{ position: 'relative' }}>
      <head>
        <link rel="dns-prefetch" href="//fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
          crossOrigin="anonymous"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body className={`${inter.className} antialiased`}>
        <JsonLd data={getOrganizationSchema()} />
        <JsonLd data={getWebSiteSchema()} />
        <LenisProvider>
          {children}
          <WebVitals />
          <Toaster position="top-right" richColors />
          {/* Last inside the provider so it paints above the page, and in the
              layout rather than a page so it reaches every route — a blog post
              is where someone reading about their own problem is most likely
              to want to ask something. It brings the WhatsApp button with it. */}
          <ChatBubble />
        </LenisProvider>
      </body>
    </html>
  );
}