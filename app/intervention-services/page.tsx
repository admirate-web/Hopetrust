'use client';

import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import Image from 'next/image';
import { Bricolage_Grotesque } from 'next/font/google';
import Header from '@/components/Header';
import FadeInSection from '@/components/FadeInSection';
import dynamic from 'next/dynamic';
import FaqSection from '@/components/FaqSection';
import { interventionFaqs } from '@/lib/faqs';

const Footer = dynamic(() => import('@/components/Footer'));

const introFont = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['400'],
});

const heroFont = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['600'],
});

const listFont = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['500'],
});

export default function InterventionServicesPage() {
  const heroRef = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const backgroundY = useTransform(scrollYProgress, [0, 1], ['0%', '20%']);
  const textY = useTransform(scrollYProgress, [0, 1], ['0%', '-30%']);

  return (
    <>
      <Header />
      <main className="min-h-screen bg-white">
        {/* Hero section with parallax background image */}
        <section
          ref={heroRef}
          className="relative h-screen w-full overflow-hidden"
        >
          {/* Background image with parallax */}
          <motion.div style={{ y: backgroundY }} className="absolute inset-0 h-[120%] w-full">
            <Image
              src="/images/services/intervention-hero.webp"
              alt="Lush botanical background with pine and yellow flowers"
              fill
              className="object-cover"
              priority
            />
          </motion.div>

          {/* Dark overlay for readability */}
          <div className="absolute inset-0 bg-black/65" />

          {/* Centered content */}
          <motion.div
            style={{ y: textY }}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 0.61, 0.36, 1], delay: 0.2 }}
            className="relative z-10 flex h-full w-full flex-col items-center justify-center px-4 sm:px-6 lg:px-8 text-center text-white"
          >
            <h1 className={`${heroFont.className} mx-auto max-w-[616px] w-full text-[26px] leading-tight sm:text-[36px] lg:text-[48px] lg:leading-[58px] tracking-[0.724138px] font-semibold text-[#F6F6F6] text-center`}>
              Guiding Families Toward Healing
            </h1>
          </motion.div>
        </section>

        {/* Intro blurb */}
        <section className="relative w-full overflow-hidden py-14 sm:py-20">
          {/* Background video */}
          <video
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
            src="/videos/gradient-background.mp4"
            poster="/images/posters/gradient-background.webp"
          />
          <FadeInSection>
            <div className="relative z-10 mx-auto max-w-[1226px] px-6 sm:px-10 text-center">
              <p className={`${introFont.className} text-[15px] leading-relaxed sm:text-[18px] lg:text-[24px] lg:leading-[29px] tracking-[0.724138px] font-normal text-black`}>
                Hope Trust offers professional Intervention Services to help your loved one seek
                treatment for alcohol or drug misuse, gambling, internet addiction, or other addictive behaviours
                before the situation worsens.
              </p>
            </div>
          </FadeInSection>
        </section>

        {/* Why / What / How content */}
        <section className="w-full bg-[#F7F5EF] py-14 sm:py-20">
          <div className="mx-auto max-w-[1143px] px-6 sm:px-10 lg:px-12 flex flex-col gap-12">

            {/* Why intervention? */}
            <FadeInSection>
              <div className="flex flex-col gap-4">
                <h2 className={`${heroFont.className} text-[26px] leading-tight sm:text-[36px] lg:text-[48px] lg:leading-[58px] tracking-[0.724138px] font-semibold text-[#00373E]`}>
                  Why intervention?
                </h2>
                <p className={`${introFont.className} text-[15px] leading-relaxed sm:text-[18px] lg:text-[24px] lg:leading-[29px] tracking-[0.724138px] font-normal text-black`}>
                  Denial is a common part of addiction. The person often does not recognise the harm caused and believes they can control the behaviour.
                </p>
                <p className={`${introFont.className} text-[15px] leading-relaxed sm:text-[18px] lg:text-[24px] lg:leading-[29px] tracking-[0.724138px] font-normal text-black`}>
                  A structured intervention helps break denial, helps the person face reality, and encourages them to accept professional treatment.
                </p>
              </div>
            </FadeInSection>

            {/* What is an intervention? */}
            <FadeInSection delay={100}>
              <div className="flex flex-col gap-4">
                <h2 className={`${heroFont.className} text-[26px] leading-tight sm:text-[36px] lg:text-[48px] lg:leading-[58px] tracking-[0.724138px] font-semibold text-[#00373E]`}>
                  What is an intervention?
                </h2>
                <div className={`${introFont.className} flex flex-col gap-1 text-[15px] leading-relaxed sm:text-[18px] lg:text-[24px] lg:leading-[29px] tracking-[0.724138px] font-normal text-black`}>
                  <p>An intervention is a planned process conducted by family and friends with the guidance of a professional.</p>
                  <p>During the intervention:</p>
                </div>
                <ul className={`${introFont.className} flex flex-col gap-1 text-[15px] leading-relaxed sm:text-[18px] lg:text-[24px] lg:leading-[29px] tracking-[0.724138px] font-normal text-black`}>
                  <li className="flex items-start gap-2"><span>·</span><span>Loved ones share how the addiction has affected them</span></li>
                  <li className="flex items-start gap-2"><span>·</span><span>A clear treatment plan is presented</span></li>
                  <li className="flex items-start gap-2"><span>·</span><span>Consequences are explained if treatment is refused</span></li>
                </ul>
              </div>
            </FadeInSection>

            {/* How a Typical Intervention Works */}
            <FadeInSection delay={150}>
              <div className="rounded-[32px] bg-white px-8 sm:px-12 py-10 shadow-[0_4px_24px_rgba(0,0,0,0.05)]">
                <h2 className={`${heroFont.className} text-[22px] leading-tight sm:text-[34px] lg:text-[48px] lg:leading-normal tracking-[0.724138px] font-semibold text-[#ED7428] mb-4 lg:mb-6`}>
                  How a Typical Intervention Works
                </h2>
                <ol className={`${listFont.className} flex flex-col gap-3 text-[15px] leading-relaxed sm:text-[20px] lg:text-[32px] lg:leading-normal tracking-[0.724138px] font-medium text-black`}>
                  <li className="flex items-start gap-3"><span className="shrink-0">1.</span><span>Planning with Hope Trust professionals</span></li>
                  <li className="flex items-start gap-3"><span className="shrink-0">2.</span><span>Gathering background information and treatment options</span></li>
                  <li className="flex items-start gap-3"><span className="shrink-0">3.</span><span>Forming an intervention team (4–6 close people)</span></li>
                  <li className="flex items-start gap-3"><span className="shrink-0">4.</span><span>Preparing what each person will say</span></li>
                  <li className="flex items-start gap-3"><span className="shrink-0">5.</span><span>Conducting the intervention and asking for an immediate decision</span></li>
                  <li className="flex items-start gap-3"><span className="shrink-0">6.</span><span>Starting treatment immediately if they agree</span></li>
                </ol>
              </div>
            </FadeInSection>

            {/* If Your Loved One Refuses Help */}
            <FadeInSection delay={100}>
              <div className="flex flex-col gap-4">
                <h2 className={`${heroFont.className} text-[26px] leading-tight sm:text-[36px] lg:text-[48px] lg:leading-[58px] tracking-[0.724138px] font-semibold text-[#00373E]`}>
                  If Your Loved One Refuses Help
                </h2>
                <p className={`${introFont.className} text-[15px] leading-relaxed sm:text-[18px] lg:text-[24px] lg:leading-[29px] tracking-[0.724138px] font-normal text-black`}>
                  Interventions may not always work immediately. If treatment is refused, it is important to follow through with the consequences decided and seek support for yourself and your family.
                </p>
              </div>
            </FadeInSection>

            {/* Image */}
            <FadeInSection delay={150}>
              <div className="w-full overflow-hidden rounded-[24px]">
                <Image
                  src="/images/services/intervention-support.webp"
                  alt="Support during addiction intervention"
                  width={860}
                  height={480}
                  className="w-full h-auto object-cover"
                />
              </div>
            </FadeInSection>

            {/* Hope Trust Intervention Services */}
            <FadeInSection delay={100}>
              <div className="flex flex-col gap-4">
                <h2 className={`${heroFont.className} text-[26px] leading-tight sm:text-[36px] lg:text-[48px] lg:leading-[58px] tracking-[0.724138px] font-semibold text-[#00373E]`}>
                  Hope Trust Intervention Services
                </h2>
                <p className={`${introFont.className} text-[15px] leading-relaxed sm:text-[18px] lg:text-[24px] lg:leading-[29px] tracking-[0.724138px] font-normal text-black`}>
                  Hope Trust has over 20 years of experience. Our team includes addiction counsellors, psychologists, psychiatrists, and physicians.
                </p>
                <p className={`${introFont.className} text-[15px] leading-relaxed sm:text-[18px] lg:text-[24px] lg:leading-[29px] tracking-[0.724138px] font-normal text-black`}>
                  We provide professional intervention services at home to make it easier for families to get help.
                </p>
                <p className={`${introFont.className} text-[15px] leading-relaxed sm:text-[18px] lg:text-[24px] lg:leading-[29px] tracking-[0.724138px] font-normal text-black`}>
                  Hope Trust Intervention Services are available at your doorstep.
                </p>
              </div>
            </FadeInSection>

          </div>
        </section>
        <FaqSection items={interventionFaqs} />
      </main>
      <Footer />
    </>
  );
}
