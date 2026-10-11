import './globals.css';
import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
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

/**
 * The homepage title used to be the tagline alone ("A place for hope, healing,
 * and renewal"), which says nothing about what Hope Trust is. It ranked at
 * position ~1.4 for "mental health rehabilitation centres in hyderabad" and
 * drew no clicks. The default now names the service and the city; the tagline
 * stays on the page.
 */
const HOME_TITLE = 'Hope Trust | Mental Health & De-Addiction Centre in Hyderabad';
const HOME_DESCRIPTION =
  'Since 2002, Hope Trust in Banjara Hills, Hyderabad has offered therapy, psychiatry, couples counselling and de-addiction treatment, in person and online.';

export const metadata: Metadata = {
  title: {
    default: HOME_TITLE,
    template: '%s | Hope Trust',
  },
  description: HOME_DESCRIPTION,
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
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
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

        {/* Google Analytics 4 (gtag.js). Production builds only, so local
            development doesn't send visits to the live property. GA4's enhanced
            measurement records the client-side navigations between pages, so
            one tag in the root layout covers every route. The CSP in
            public/_headers allows the Google hosts this needs. */}
        {process.env.NODE_ENV === 'production' && siteConfig.gaMeasurementId && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${siteConfig.gaMeasurementId}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${siteConfig.gaMeasurementId}');`}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}