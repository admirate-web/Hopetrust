import dynamic from 'next/dynamic';
import Header from '@/components/Header';
import FadeInSection from '@/components/FadeInSection';

// Code-split home sections so each becomes its own chunk
const HeroSection = dynamic(() => import('@/components/HeroSection'));
const BackgroundCirclesSection = dynamic(
  () => import('@/components/BackgroundCirclesSection')
);
const ScrollingTextBanner = dynamic(
  () => import('@/components/ScrollingTextBanner')
);
const WhatWeOfferSection = dynamic(
  () => import('@/components/WhatWeOfferSection')
);
const RectangleSection = dynamic(() => import('@/components/RectangleSection'));
const ClientsSayingSection = dynamic(
  () => import('@/components/ClientsSayingSection')
);
const ResourcesSection = dynamic(
  () => import('@/components/ResourcesSection')
);
const LargeRectangleSection = dynamic(
  () => import('@/components/LargeRectangleSection')
);
const AffiliationsSection = dynamic(
  () => import('@/components/AffiliationsSection')
);
const Footer = dynamic(() => import('@/components/Footer'));

// The root layout deliberately declares no `alternates`, so the homepage sets
// its own canonical here.
export const metadata = {
  alternates: {
    canonical: '/',
  },
};

export default function Home() {
  return (
    <>
      <Header />
      <main className="min-h-screen">
        <FadeInSection>
          <HeroSection />
        </FadeInSection>
        {/* Let BackgroundCirclesSection handle its own element animations so the background image stays static */}
        <BackgroundCirclesSection />
        <FadeInSection>
          <ScrollingTextBanner />
        </FadeInSection>
        <FadeInSection delay={150}>
          <WhatWeOfferSection />
        </FadeInSection>
        <FadeInSection delay={200}>
          <RectangleSection />
        </FadeInSection>
        <FadeInSection delay={250}>
          <ClientsSayingSection />
        </FadeInSection>
        {/* Let ResourcesSection handle its own staggered card animation */}
        <ResourcesSection />
        <LargeRectangleSection />
        <FadeInSection>
          <AffiliationsSection />
        </FadeInSection>
      </main>
      <Footer />
    </>
  );
}