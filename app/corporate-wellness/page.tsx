'use client';

import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import Image from 'next/image';
import { Bricolage_Grotesque } from 'next/font/google';
import Header from '@/components/Header';
import { siteConfig } from '@/lib/config';
import dynamic from 'next/dynamic';
import FaqSection from '@/components/FaqSection';
import { corporateFaqs } from '@/lib/faqs';

const Footer = dynamic(() => import('@/components/Footer'));
const ScrollingTextBanner = dynamic(() => import('@/components/ScrollingTextBanner'));

const heroFont = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['600'],
});

const introFont = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['400'],
});

const boldBodyFont = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['700'],
});

function ScrollArrow({ side }: { side: 'left' | 'right' }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start 0.9', 'end 0.4'],
  });
  const pathLength = useTransform(scrollYProgress, [0, 0.85], [0, 1], { clamp: true });
  const tipOpacity = useTransform(scrollYProgress, [0.7, 0.9], [0, 1], { clamp: true });

  const curvePath = side === 'left'
    ? 'M 85 8 C 85 55, 15 55, 15 108'
    : 'M 15 8 C 15 55, 85 55, 85 108';
  const tipPath = side === 'left'
    ? 'M 4 93 L 15 108 L 28 95'
    : 'M 72 95 L 85 108 L 96 93';

  return (
    <div ref={ref} className={`relative h-24 sm:h-40 w-full pointer-events-none`}>
      <svg
        viewBox="0 0 100 116"
        fill="none"
        className={`absolute top-0 w-16 h-20 sm:w-[160px] sm:h-[186px] ${side === 'left' ? 'left-[4%] sm:left-[6%]' : 'right-[4%] sm:right-[6%]'}`}
        overflow="visible"
      >
        <motion.path
          d={curvePath}
          stroke="#1a1a1a"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          style={{ pathLength }}
        />
        <motion.path
          d={tipPath}
          stroke="#1a1a1a"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          style={{ opacity: tipOpacity }}
        />
      </svg>
    </div>
  );
}

export default function CorporateWellnessPage() {
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
              src="/images/services/corporate-wellness-hero.webp"
              alt="Countryside at sunset representing workplace wellness"
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
            <h1 className={`${heroFont.className} mx-auto max-w-[827px] w-full text-[26px] leading-tight sm:text-[36px] lg:text-[48px] lg:leading-[58px] tracking-[0.724138px] font-semibold text-[#F6F6F6] text-center`}>
              Support for workplaces and teams
            </h1>
          </motion.div>
        </section>

        {/* What we give section */}
        <section className="w-full bg-[#F7F5EF] py-16 sm:py-24">

          {/* Heading + text — staggered reveal */}
          <div className="mx-auto max-w-[1143px] px-6 sm:px-10 text-center">
            <motion.h2
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 0.6, ease: [0.22, 0.61, 0.36, 1] }}
              className={`${heroFont.className} text-[26px] leading-tight sm:text-[36px] lg:text-[48px] lg:leading-[58px] tracking-[0.724138px] font-semibold text-[#00373E]`}
            >
              What we give
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.6, ease: [0.22, 0.61, 0.36, 1], delay: 0.18 }}
              className={`${introFont.className} mt-5 text-[15px] leading-relaxed sm:text-[18px] lg:text-[24px] lg:leading-[29px] tracking-[0.724138px] font-normal text-black`}
            >
              We offer mental health and wellness support for organisations that want to care for their people with more intention.
            </motion.p>
            <motion.p
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.6, ease: [0.22, 0.61, 0.36, 1], delay: 0.34 }}
              className={`${introFont.className} mt-3 text-[15px] leading-relaxed sm:text-[18px] lg:text-[24px] lg:leading-[29px] tracking-[0.724138px] font-normal text-black`}
            >
              Our work includes <strong>sessions, workshops, and structured support</strong> for employees and teams.
            </motion.p>
          </div>

          {/* Cards + scroll-drawn arrows */}
          <div className="relative mx-auto mt-14 max-w-[860px] px-6 sm:px-10 flex flex-col">

            {/* Card 1 — Orange */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.65, ease: [0.22, 0.61, 0.36, 1] }}
              className="mx-auto w-full max-w-[708px] sm:min-h-[269px] rounded-[20px] sm:rounded-[31px] bg-[#ED7428] p-5 sm:p-6 lg:p-[31px] text-center flex flex-col justify-center"
            >
              <h3 className={`${heroFont.className} text-[20px] leading-tight sm:text-[28px] lg:text-[40px] lg:leading-normal tracking-[0.724138px] font-semibold text-[#00373E]`}>
                One-time sessions
              </h3>
              <p className={`${boldBodyFont.className} mt-3 mx-auto max-w-[595px] text-[14px] leading-relaxed sm:text-[18px] lg:text-[24px] lg:leading-normal tracking-[0.724138px] font-bold text-[#F9E6D0]`}>
                A simple way to begin conversations around mental health, stress, balance, and well-being.
              </p>
            </motion.div>

            {/* Arrow 1 — draws left-side on scroll */}
            <ScrollArrow side="left" />

            {/* Card 2 — Cream */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.65, ease: [0.22, 0.61, 0.36, 1] }}
              className="mx-auto w-full max-w-[708px] sm:min-h-[269px] rounded-[20px] sm:rounded-[31px] bg-[#F9E6D0] p-5 sm:p-6 lg:p-[31px] text-center flex flex-col justify-center"
            >
              <h3 className={`${heroFont.className} text-[20px] leading-tight sm:text-[28px] lg:text-[40px] lg:leading-normal tracking-[0.724138px] font-semibold text-[#00373E]`}>
                Ongoing support
              </h3>
              <p className={`${boldBodyFont.className} mt-3 mx-auto max-w-[595px] text-[14px] leading-relaxed sm:text-[18px] lg:text-[24px] lg:leading-normal tracking-[0.724138px] font-bold text-[#ED7428]`}>
                Regular sessions or workshops for teams that need continued care and guidance.
              </p>
            </motion.div>

            {/* Arrow 2 — draws right-side on scroll */}
            <ScrollArrow side="right" />

            {/* Card 3 — Dark teal */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.65, ease: [0.22, 0.61, 0.36, 1] }}
              className="mx-auto w-full max-w-[708px] sm:min-h-[269px] rounded-[20px] sm:rounded-[31px] bg-[#00373E] p-5 sm:p-6 lg:p-[31px] text-center flex flex-col justify-center"
            >
              <h3 className={`${heroFont.className} text-[20px] leading-tight sm:text-[28px] lg:text-[40px] lg:leading-normal tracking-[0.724138px] font-semibold text-[#ED7428]`}>
                Employee Assistance Programmes
              </h3>
              <p className={`${boldBodyFont.className} mt-3 mx-auto max-w-[595px] text-[14px] leading-relaxed sm:text-[18px] lg:text-[24px] lg:leading-normal tracking-[0.724138px] font-bold text-[#F9E6D0]`}>
                Structured support for employees through confidential sessions over time.
              </p>
            </motion.div>

          </div>
        </section>

        {/* How we work section */}
        <section className="relative w-full overflow-hidden py-10 sm:py-16">
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
          <div className="relative z-10 mx-auto max-w-[1100px] px-6 sm:px-10">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.65, ease: [0.22, 0.61, 0.36, 1] }}
              className="bg-white rounded-[32px] px-10 sm:px-16 py-10 sm:py-12 text-center"
            >
              <h2 className={`${heroFont.className} text-[24px] sm:text-[36px] lg:text-[48px] leading-tight sm:leading-[58px] tracking-[0.724138px] font-semibold text-[#ED7428]`}>
                How we work
              </h2>
              <p className={`${introFont.className} mt-4 text-[15px] leading-relaxed sm:text-[18px] lg:text-[24px] lg:leading-[29px] tracking-[0.724138px] font-normal text-black`}>
                Support can be offered online or in person in Hyderabad.
              </p>
              <p className={`${introFont.className} mt-1 text-[15px] leading-relaxed sm:text-[18px] lg:text-[24px] lg:leading-[29px] tracking-[0.724138px] font-normal text-black`}>
                Each programme is shaped around the needs of the organisation.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Scrolling marquee banner */}
        <ScrollingTextBanner />

        {/* Get in touch section */}
        <section className="w-full bg-[#F7F5EF] py-14 sm:py-20">
          <div className="mx-auto max-w-[1143px] px-6 sm:px-10 lg:px-12">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.6, ease: [0.22, 0.61, 0.36, 1] }}
            >
              <h2 className={`${heroFont.className} text-[24px] sm:text-[36px] lg:text-[48px] leading-tight sm:leading-[58px] tracking-[0.724138px] font-semibold text-[#00373E]`}>
                Get in touch
              </h2>
              <p className={`${introFont.className} mt-3 text-[15px] leading-relaxed sm:text-[18px] lg:text-[24px] lg:leading-[29px] tracking-[0.724138px] font-normal text-black`}>
                Support can be offered online or in person in Hyderabad.
              </p>
              <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-8">
                <div>
                  <p className={`${heroFont.className} text-[15px] sm:text-[20px] leading-tight tracking-[0.5px] font-semibold text-[#00373E]`}>
                    Email
                  </p>
                  <p className={`${introFont.className} mt-1 text-[14px] sm:text-[20px] leading-relaxed sm:leading-[29px] tracking-[0.5px] font-normal text-black`}>
                    {siteConfig.contact.email}
                  </p>
                </div>
                <div>
                  <p className={`${heroFont.className} text-[15px] sm:text-[20px] leading-tight tracking-[0.5px] font-semibold text-[#00373E]`}>
                    Phone
                  </p>
                  <p className={`${introFont.className} mt-1 text-[14px] sm:text-[20px] leading-relaxed sm:leading-[29px] tracking-[0.5px] font-normal text-black`}>
                    {siteConfig.contact.phone} / {siteConfig.contact.phone2}
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </section>
        <FaqSection items={corporateFaqs} />
      </main>
      <Footer />
    </>
  );
}
