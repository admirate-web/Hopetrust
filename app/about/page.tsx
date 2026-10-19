'use client';

import React from 'react';
import Header from '@/components/Header';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { motion } from 'motion/react';
import { Bricolage_Grotesque } from 'next/font/google';
import ProximityText from '@/components/ProximityText';
import OurTeamSection from '@/components/OurTeamSection';
import FadeInSection from '@/components/FadeInSection';

// Re-use CTA via code-split chunk
const Footer = dynamic(() => import('@/components/Footer'));
const ScrollingTextBanner = dynamic(() => import('@/components/ScrollingTextBanner'));

const aboutHeadingFont = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['600'],
});

const aboutStoryLabelFont = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['400'],
});

const aboutStoryHeadingFont = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600"],
});

const aboutStoryBodyFont = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['500'],
});

const aboutStoryBodyRegularFont = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['400'],
});

const aboutStoryBodyBoldFont = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['700'],
});

export default function About() {
  return (
    <>
      <Header />
      <main className="min-h-screen">
        {/* First section */}
        <section className="relative min-h-screen w-full overflow-hidden">
          <div className="relative z-10 flex h-full w-full flex-col justify-between px-4 sm:px-8 lg:px-16 py-12 gap-10">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 lg:flex-row lg:items-center">
              {/* Left column: text content */}
              <motion.div
                className="w-full lg:w-1/2 text-[#00373E]"
                initial={{ opacity: 0, x: -40 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.6, ease: [0.22, 0.61, 0.36, 1] }}
              >
                {/* ABOUT US heading */}
                <h1
                  className={`${aboutHeadingFont.className} mb-6 self-stretch text-3xl sm:text-4xl lg:text-[48px] font-semibold leading-normal tracking-[0.724px] text-black`}
                >
                  ABOUT US
                </h1>

                {/* Our Story label */}
                <p
                  className={`${aboutStoryLabelFont.className} mb-4 self-stretch text-lg sm:text-xl lg:text-[24px] font-normal uppercase leading-normal tracking-[0.724px] text-[#00373E]`}
                >
                  OUR STORY
                </p>

                {/* Main subheading */}
                <h2
                  className={`${aboutStoryHeadingFont.className} mb-5 w-full text-[28px] font-semibold leading-normal text-[#00373E] sm:w-[542px] sm:text-[36px]`}
                >
                  <ProximityText
                    text={"Hope Trust began in 2002\nwith a simple intention"}
                    radius={140}
                    liftPx={6}
                  />
                </h2>

                {/* Body copy */}
                <p
                  className={`${aboutStoryBodyFont.className} mt-2 self-stretch text-base sm:text-lg lg:text-[24px] font-medium leading-normal tracking-[0.724px] text-[#00373E]`}
                >
                  To offer a calm and steady space for healing. People come to
                  us with different struggles.
                </p>
                <p
                  className={`${aboutStoryBodyFont.className} mt-4 self-stretch text-base sm:text-lg lg:text-[24px] font-medium leading-normal tracking-[0.724px] text-[#00373E]`}
                >
                  We meet them with patience.
                  <br />
                  We support them with care.
                  <br />
                  One person at a time.
                </p>
              </motion.div>

              {/* Right column: image card sitting over the background circles */}
              <motion.div
                className="w-full lg:w-1/2 flex justify-center lg:justify-end"
                initial={{ opacity: 0, x: 40 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{
                  duration: 0.6,
                  delay: 0.1,
                  ease: [0.22, 0.61, 0.36, 1],
                }}
              >
                <div className="relative w-full max-w-2xl lg:max-w-3xl aspect-square">
                  <Image
                    src="/images/about/therapist.webp"
                    alt="Hope Trust therapist"
                    fill
                    className="object-contain"
                    priority
                  />
                </div>
              </motion.div>
            </div>

            {/* Bottom-centered Our Team strip removed */}
          </div>
          <FadeInSection>
            <ScrollingTextBanner />
          </FadeInSection>
        </section>

        <FadeInSection>
          <OurTeamSection />
        </FadeInSection>

        {/* Our Story detailed section */}
        <section className="w-full bg-[#FFF9F4] py-16 sm:py-20">
          <div className="mx-auto w-full max-w-5xl px-4 sm:px-8 lg:px-0 flex flex-col gap-16 sm:gap-20">
            {/* Heading */}
            <motion.h2
              className={`${aboutHeadingFont.className} text-center text-3xl sm:text-4xl lg:text-[48px] font-semibold leading-normal tracking-[0.724px] text-[#00373E]`}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.6, ease: [0.22, 0.61, 0.36, 1] }}
            >
              Our story
            </motion.h2>

            {/* Row 1: image left, text right */}
            <div className="flex flex-col md:flex-row items-center gap-8 md:gap-14">
              <motion.div
                className="w-full md:w-1/2 rounded-[28px] sm:rounded-[40px] overflow-hidden shadow-lg"
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.6, ease: [0.22, 0.61, 0.36, 1] }}
              >
                <Image
                  src="/images/about/story.webp"
                  alt="Hope Trust story"
                  width={560}
                  height={400}
                  className="w-full h-auto object-cover"
                />
              </motion.div>
              <motion.div
                className="w-full md:w-1/2"
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 0.61, 0.36, 1] }}
              >
                <p
                  className={`${aboutStoryBodyFont.className} text-base sm:text-lg lg:text-[20px] font-medium leading-relaxed sm:leading-[32px] tracking-[0.5px] text-[#00373E]`}
                >
                  Hope Trust was born from a family&apos;s long and painful journey through
                  addiction and recovery. After 25 years of struggle and healing, one belief
                  emerged: no one should have to walk this path alone. That belief led to the
                  founding of Hope Trust in 2002.
                </p>
              </motion.div>
            </div>

            {/* Row 2: text left, image right */}
            <div className="flex flex-col-reverse md:flex-row items-center gap-8 md:gap-14">
              <motion.div
                className="w-full md:w-1/2"
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.6, ease: [0.22, 0.61, 0.36, 1] }}
              >
                <p
                  className={`${aboutStoryBodyFont.className} text-base sm:text-lg lg:text-[20px] font-medium leading-relaxed sm:leading-[32px] tracking-[0.5px] text-[#00373E]`}
                >
                  What began as an in-patient center grew into a trusted provider of ethical,
                  evidence-based mental health and addiction treatment. Today, with a
                  multidisciplinary team of over 30 professionals and both in-clinic and
                  online services, Hope Trust is more than a treatment center—it is a community
                  built on healing, trust, and the belief that recovery is possible.
                </p>
              </motion.div>
              <motion.div
                className="w-full md:w-1/2 rounded-[28px] sm:rounded-[40px] overflow-hidden shadow-lg"
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 0.61, 0.36, 1] }}
              >
                <Image
                  src="/images/about/community.webp"
                  alt="Hope Trust community"
                  width={560}
                  height={400}
                  className="w-full h-auto object-cover"
                />
              </motion.div>
            </div>

            {/* Bottom quote */}
            <motion.p
              className={`${aboutStoryBodyFont.className} mx-auto max-w-[1092px] text-center text-base sm:text-lg lg:text-[24px] font-medium leading-normal sm:leading-[29px] tracking-[0.724px] text-[#ED7428]`}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.6, ease: [0.22, 0.61, 0.36, 1] }}
            >
              From one family&apos;s journey to a global network of care, Hope Trust stands for one simple
              belief: recovery is possible, and a meaningful life can be rebuilt—with the right support.
            </motion.p>
          </div>

          <FadeInSection>
            <ScrollingTextBanner />
          </FadeInSection>
        </section>
        <section className="w-full bg-white py-16">
          <div className="mx-auto w-full max-w-[1246px] px-4 sm:px-8 lg:px-0 flex flex-col gap-10">
            {/* Three colored cards (Frame 37 layout) */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-11">
              {/* Left card */}
              <motion.div
                className="flex flex-col items-center justify-center gap-4 sm:gap-6 rounded-[32px] sm:rounded-[45px] bg-[#F9E6D0] px-6 sm:px-10 py-10 sm:py-16 shadow-sm w-full sm:w-[386px] sm:h-[367px] text-center cursor-default"
                initial={{ opacity: 0, x: -40 }}
                whileInView={{ opacity: 1, x: 0 }}
                whileHover={{
                  y: -8,
                  boxShadow:
                    "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
                }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.6, ease: [0.22, 0.61, 0.36, 1] }}
              >
                <Image
                  src="/images/about/icon-listener.webp"
                  alt="Listener icon"
                  width={96}
                  height={96}
                  className="object-contain"
                />
                <p
                  className={`${aboutStoryBodyFont.className} self-stretch text-center text-lg sm:text-xl lg:text-[24px] font-medium leading-normal tracking-[0.724px] text-[#00373E]`}
                >
                  People who listen
                  <br />
                  without judgment.
                </p>
              </motion.div>

              {/* Middle card */}
              <motion.div
                className="flex flex-col items-center justify-center gap-4 sm:gap-6 rounded-[32px] sm:rounded-[45px] bg-[#00373E] px-6 sm:px-10 py-10 sm:py-16 shadow-sm w-full sm:w-[386px] sm:h-[367px] text-center cursor-default"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                whileHover={{
                  y: -8,
                  boxShadow:
                    "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
                }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{
                  duration: 0.6,
                  delay: 0.08,
                  ease: [0.22, 0.61, 0.36, 1],
                }}
              >
                <Image
                  src="/images/about/icon-guidance.webp"
                  alt="Guidance icon"
                  width={96}
                  height={96}
                  className="object-contain"
                />
                <p
                  className={`${aboutStoryBodyFont.className} self-stretch text-center text-lg sm:text-xl lg:text-[24px] font-medium leading-normal tracking-[0.724px] text-white`}
                >
                  People who guide
                  <br />
                  with clarity.
                </p>
              </motion.div>

              {/* Right card */}
              <motion.div
                className="flex flex-col items-center justify-center gap-4 sm:gap-6 rounded-[32px] sm:rounded-[45px] bg-[#FFFBF6] px-6 sm:px-10 py-10 sm:py-16 shadow-sm ring-1 ring-black/5 w-full sm:w-[386px] sm:h-[367px] text-center cursor-default"
                initial={{ opacity: 0, x: 40 }}
                whileInView={{ opacity: 1, x: 0 }}
                whileHover={{
                  y: -8,
                  boxShadow:
                    "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
                }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{
                  duration: 0.6,
                  delay: 0.16,
                  ease: [0.22, 0.61, 0.36, 1],
                }}
              >
                <Image
                  src="/images/about/icon-process.webp"
                  alt="Process icon"
                  width={96}
                  height={96}
                  className="object-contain"
                />
                <p
                  className={`${aboutStoryBodyFont.className} self-stretch text-center text-lg sm:text-xl lg:text-[24px] font-medium leading-normal tracking-[0.724px] text-[#00373E]`}
                >
                  People who stay with
                  <br />
                  you through the process.
                </p>
              </motion.div>
            </div>

            {/* Long rounded rectangle with text + Frame 5 illustration */}
            <div className="mx-auto w-full max-w-[1240px]">
              <div className="relative w-full rounded-[32px] bg-white shadow-[0_30px_80px_rgba(0,0,0,0.18)] overflow-hidden">
                <div className="flex flex-col md:flex-row items-center md:items-stretch gap-8 md:gap-0 pl-8 pr-0 sm:pl-10 sm:pr-0 lg:pl-14 lg:pr-0 py-10 lg:py-12">
                  {/* Left text column */}
                  <motion.div
                    className="w-full md:w-1/2 text-left"
                    initial={{ opacity: 0, x: -40 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, amount: 0.15 }}
                    transition={{ duration: 0.6, ease: [0.22, 0.61, 0.36, 1] }}
                  >
                    <h3
                      className={`${aboutHeadingFont.className} mb-4 w-full max-w-[515px] text-2xl sm:text-3xl lg:text-[40px] font-semibold leading-normal tracking-[0.5px] text-[#00373E]`}
                    >
                      Wellness coaching
                    </h3>
                    <p
                      className={`${aboutStoryBodyRegularFont.className} mb-4 w-full max-w-[617px] text-sm sm:text-base lg:text-[20px] font-normal leading-[26px] tracking-[0.5px] text-[#00373E]`}
                    >
                      Personalized guidance to help you build healthier habits,
                      manage stress, and achieve balance in all areas of your
                      life.
                    </p>
                    <p
                      className={`${aboutStoryBodyRegularFont.className} mb-6 w-full max-w-[617px] text-sm sm:text-base lg:text-[20px] font-normal leading-[26px] tracking-[0.5px] text-[#00373E]`}
                    >
                      Our wellness coaches support you in creating sustainable
                      routines for mental, emotional, and physical well-being.
                    </p>
                    <button className="inline-flex items-center justify-center rounded-full bg-[#00373E] px-6 sm:px-8 py-2.5 text-sm sm:text-base font-semibold text-white shadow-md hover:bg-[#024a53] transition-all duration-200 active:scale-95">
                      Learn More
                    </button>
                  </motion.div>

                  {/* Right illustration */}
                  <motion.div
                    className="w-full md:w-1/2 relative min-h-[200px] sm:min-h-[260px] lg:min-h-[300px]"
                    initial={{ opacity: 0, x: 40 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, amount: 0.15 }}
                    transition={{
                      duration: 0.6,
                      delay: 0.1,
                      ease: [0.22, 0.61, 0.36, 1],
                    }}
                  >
                    <Image
                      src="/images/about/wellness-coaching.webp"
                      alt="Wellness coaching illustration"
                      fill
                      className="object-contain md:object-cover md:object-right"
                      priority={false}
                    />
                  </motion.div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How it Works section */}
        <section className="w-full bg-white py-20">
          <div className="mx-auto w-full max-w-[1240px] px-4 sm:px-8 lg:px-0 flex flex-col gap-10">
            {/* Heading */}
            <motion.div
              className="text-center"
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.55, ease: [0.22, 0.61, 0.36, 1] }}
            >
              <h2
                className={`${aboutHeadingFont.className} mx-auto inline-block text-center text-3xl sm:text-4xl lg:text-[48px] font-semibold leading-normal tracking-[0.724px] text-[#00373E]`}
              >
                How it works
              </h2>
              <p
                className={`${aboutStoryBodyFont.className} mx-auto mt-3 w-full max-w-[306px] text-center text-sm sm:text-base lg:text-[20px] font-medium leading-normal tracking-[0.724px] text-[#00373E]`}
              >
                Choose how you want to start. Online or in person.
              </p>
            </motion.div>

            {/* Three step cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
              {/* Step 1 */}
              <motion.div
                className="flex flex-col items-center text-center justify-between gap-6 rounded-[24px] bg-[#FFEBD7] px-6 sm:px-8 lg:px-10 py-6 sm:py-8 lg:py-10 shadow-sm h-full cursor-default"
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                whileHover={{
                  y: -4,
                  boxShadow:
                    "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
                }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.6, ease: [0.22, 0.61, 0.36, 1] }}
              >
                <p
                  className={`${aboutStoryBodyFont.className} w-full max-w-[325px] text-center text-base sm:text-lg lg:text-[24px] font-medium leading-normal tracking-[0.724px] text-[#00373E]`}
                >
                  Book through WhatsApp or the website.
                  <br />
                  Select the therapist you feel right with.
                </p>
                <Image
                  src="/images/about/icon-booking.webp"
                  alt="Booking via WhatsApp or website"
                  width={80}
                  height={80}
                  className="object-contain"
                />
              </motion.div>

              {/* Step 2 */}
              <motion.div
                className="flex flex-col items-center text-center justify-between gap-6 rounded-[24px] bg-[#FFEBD7] px-6 sm:px-8 lg:px-10 py-6 sm:py-8 lg:py-10 shadow-sm h-full cursor-default"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                whileHover={{
                  y: -4,
                  boxShadow:
                    "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
                }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{
                  duration: 0.6,
                  delay: 0.08,
                  ease: [0.22, 0.61, 0.36, 1],
                }}
              >
                <p
                  className={`${aboutStoryBodyFont.className} w-full max-w-[325px] text-center text-base sm:text-lg lg:text-[24px] font-medium leading-normal tracking-[0.724px] text-[#00373E]`}
                >
                  Pick a date and a time
                  <br />
                  that works for you.
                </p>
                <Image
                  src="/images/about/icon-date-time.webp"
                  alt="Pick a date and time"
                  width={80}
                  height={80}
                  className="object-contain"
                />
              </motion.div>

              {/* Step 3 */}
              <motion.div
                className="flex flex-col items-center text-center justify-between gap-6 rounded-[24px] bg-[#FFEBD7] px-6 sm:px-8 lg:px-10 py-6 sm:py-8 lg:py-10 shadow-sm h-full cursor-default"
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                whileHover={{
                  y: -4,
                  boxShadow:
                    "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
                }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{
                  duration: 0.6,
                  delay: 0.16,
                  ease: [0.22, 0.61, 0.36, 1],
                }}
              >
                <p
                  className={`${aboutStoryBodyFont.className} w-full max-w-[325px] text-center text-base sm:text-lg lg:text-[24px] font-medium leading-normal tracking-[0.724px] text-[#00373E]`}
                >
                  If online, a private link is shared
                  <br />
                  through mail or WhatsApp.
                  <br />
                  If in person, you arrive at the centre
                  <br />
                  for your session.
                </p>
                <Image
                  src="/images/about/icon-session.webp"
                  alt="Online or in-person session"
                  width={80}
                  height={80}
                  className="object-contain"
                />
              </motion.div>
            </div>

            {/* Bottom orange strip */}
            <div className="mx-auto w-full max-w-[1240px]">
              <motion.div
                className="rounded-[32px] bg-[#F06D00] text-white px-8 sm:px-14 py-8 text-center"
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{
                  duration: 0.6,
                  delay: 0.12,
                  ease: [0.22, 0.61, 0.36, 1],
                }}
              >
                <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-12 mb-6 border-b border-white/40 pb-6">
                  <div>
                    <p className="text-xl sm:text-2xl font-semibold">50 minutes</p>
                    <p
                      className={`${aboutStoryBodyFont.className} mt-1 text-sm sm:text-base lg:text-[20px] font-medium`}
                    >
                      Individual therapy
                    </p>
                  </div>

                  <div>
                    <p className="text-xl sm:text-2xl font-semibold">90 minutes</p>
                    <p
                      className={`${aboutStoryBodyFont.className} mt-1 text-sm sm:text-base lg:text-[20px] font-medium`}
                    >
                      Couples therapy
                    </p>
                  </div>

                  <div>
                    <p className="text-xl sm:text-2xl font-semibold">15 minutes</p>
                    <p
                      className={`${aboutStoryBodyFont.className} mt-1 text-sm sm:text-base lg:text-[20px] font-medium`}
                    >
                      Psychiatry
                    </p>
                  </div>
                </div>

                <p
                  className={`${aboutStoryBodyFont.className} text-sm sm:text-base lg:text-[20px] font-medium`}
                >
                  Your progress continues after each session.
                  <br />
                  One step at a time.
                </p>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Final CTA + footer-style links section (last section on page) */}
      </main>
      <Footer />
    </>
  );
}