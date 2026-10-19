'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'motion/react';
import type { TrainingProgram } from '@/lib/training-programs';
import { fetchTrainingPrograms } from '@/lib/training-programs';
import Image from 'next/image';
import { Bricolage_Grotesque } from 'next/font/google';
import Header from '@/components/Header';
import FadeInSection from '@/components/FadeInSection';
import dynamic from 'next/dynamic';
import FaqSection from '@/components/FaqSection';
import { trainingFaqs } from '@/lib/faqs';
// PAYMENT DISABLED — uncomment when Razorpay is integrated
// import EnrollmentModal from '@/components/EnrollmentModal';

const Footer = dynamic(() => import('@/components/Footer'));
const ScrollingTextBanner = dynamic(() => import('@/components/ScrollingTextBanner'));

// PAYMENT DISABLED — uncomment when Razorpay is integrated
// interface EnrollTarget {
//   programId: string;
//   programTitle: string;
//   levelIndex?: number;
//   levelLabel?: string;
//   priceDisplay?: string;
// }

const heroFont = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['600'],
});

const introFont = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['400'],
});

const boldFont = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['700'],
});

export default function TrainingPage() {
  const heroRef = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const backgroundY = useTransform(scrollYProgress, [0, 1], ['0%', '20%']);
  const textY = useTransform(scrollYProgress, [0, 1], ['0%', '-30%']);

  const [programs, setPrograms] = useState<TrainingProgram[]>([]);
  // PAYMENT DISABLED — uncomment when Razorpay is integrated
  // const [enrollTarget, setEnrollTarget] = useState<EnrollTarget | null>(null);

  useEffect(() => {
    fetchTrainingPrograms().then(setPrograms).catch(() => {});
  }, []);

  const internships = programs.filter((p) => p.category === 'internship');
  const traineeships = programs.filter((p) => p.category === 'traineeship');

  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#F7F5EF]">
        {/* Hero section with parallax background image */}
        <section
          ref={heroRef}
          className="relative h-screen w-full overflow-hidden"
        >
          {/* Background image with parallax */}
          <motion.div style={{ y: backgroundY }} className="absolute inset-0 h-[120%] w-full">
            <Image
              src="/images/services/training-hero.webp"
              alt="Sunset over the ocean with a silhouette representing guidance and growth"
              fill
              className="object-cover"
              priority
            />
          </motion.div>

          {/* Orange overlay for readability */}
          <div className="absolute inset-0 bg-[#ED7428]/60" />

          {/* Centered content */}
          <motion.div
            style={{ y: textY }}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 0.61, 0.36, 1], delay: 0.2 }}
            className="relative z-10 flex h-full w-full flex-col items-center justify-center px-4 sm:px-6 lg:px-8 text-center text-white"
          >
            <h1 className={`${heroFont.className} mx-auto max-w-[90%] w-full text-[24px] leading-tight sm:max-w-[616px] sm:text-[36px] lg:text-[48px] lg:leading-[58px] tracking-[0.724138px] font-semibold text-[#F6F6F6] text-center`}>
              Learn with care,
              <br />
              practice with guidance.
            </h1>
          </motion.div>
        </section>

        {/* Intro section */}
        <FadeInSection>
          <section className="w-full bg-[#F7F5EF] py-14 sm:py-20 lg:py-24">
            <div className="mx-auto flex w-full max-w-[1100px] flex-col items-center gap-6 px-5 sm:gap-8 sm:px-8 lg:flex-row lg:items-center lg:gap-16 lg:px-12">
              {/* Left — text */}
              <div className="w-full lg:w-1/2">
                <p className={`${introFont.className} text-[15px] leading-relaxed text-black sm:text-[18px] sm:leading-[24px] lg:text-[24px] lg:leading-[29px] tracking-[0.724138px]`}>
                  We offer training for students and early career mental health professionals who want deeper clinical exposure, stronger foundations, and thoughtful supervision.
                </p>
                <p className={`${introFont.className} mt-5 text-[15px] leading-relaxed text-black sm:text-[18px] sm:leading-[24px] lg:text-[24px] lg:leading-[29px] tracking-[0.724138px]`}>
                  With over two decades of work in mental health and addiction care, Hope Trust, in partnership with AHIER, offers learning spaces that are practical, ethical, and grounded in real clinical work.
                </p>
              </div>

              {/* Right — image */}
              <div className="w-full lg:w-1/2">
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl sm:rounded-3xl">
                  <Image
                    src="/images/services/training-teamwork.webp"
                    alt="Team of professionals joining hands together representing collaboration and support"
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
              </div>
            </div>
          </section>
        </FadeInSection>

        {/* What we give */}
        <FadeInSection>
          <section className="w-full bg-[#F9E6D0] py-14 sm:py-20 lg:py-24">
            <div className="mx-auto w-full max-w-[1100px] px-4 sm:px-8 lg:px-12">
              <h2 className={`${heroFont.className} mb-10 text-center text-[26px] font-semibold text-[#00373E] sm:mb-14 sm:text-[36px] lg:text-[48px] lg:leading-[58px] tracking-[0.724138px]`}>
                What we give
              </h2>

              <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 sm:gap-12 lg:gap-20">
                {/* Clinical internships */}
                <div className="flex flex-col items-start">
                  <div className="relative mb-5 h-[90px] w-[78px] sm:h-[110px] sm:w-[96px] lg:h-[139px] lg:w-[121px]">
                    <Image
                      src="/images/services/training-icon-1.webp"
                      alt="Clinical internships icon"
                      fill
                      className="object-contain"
                      unoptimized
                    />
                  </div>
                  <h3 className={`${heroFont.className} text-[20px] font-semibold text-[#00373E] sm:text-[28px] lg:text-[36px] lg:leading-[43px] tracking-[0.724138px]`}>
                    Clinical internships
                  </h3>
                  <p className={`${introFont.className} mt-3 text-[15px] leading-relaxed text-[#00373E] sm:text-[18px] sm:leading-[24px] lg:text-[24px] lg:leading-[29px] tracking-[0.724138px]`}>
                    For undergraduate and postgraduate students looking to build understanding in counselling, clinical psychology, and addiction care.
                  </p>
                </div>

                {/* Clinical traineeship */}
                <div className="flex flex-col items-start">
                  <div className="relative mb-5 h-[90px] w-[64px] sm:h-[112px] sm:w-[80px] lg:h-[142px] lg:w-[100px]">
                    <Image
                      src="/images/services/training-icon-2.webp"
                      alt="Clinical traineeship icon"
                      fill
                      className="object-contain"
                      unoptimized
                    />
                  </div>
                  <h3 className={`${heroFont.className} text-[20px] font-semibold text-[#00373E] sm:text-[28px] lg:text-[36px] lg:leading-[43px] tracking-[0.724138px]`}>
                    Clinical traineeship
                  </h3>
                  <p className={`${introFont.className} mt-3 text-[15px] leading-relaxed text-[#00373E] sm:text-[18px] sm:leading-[24px] lg:text-[24px] lg:leading-[29px] tracking-[0.724138px]`}>
                    For postgraduates who want more advanced learning through supervised casework, assessments, and hands-on clinical experience.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </FadeInSection>

        {/* Internship Pathways */}
        <InternshipPathways heroFont={heroFont} introFont={introFont} />

        {/* Clinical Traineeship */}
        <FadeInSection>
          <section className="w-full bg-[#F7F5EF] py-14 sm:py-20 lg:py-24">
            <div className="mx-4 w-auto max-w-[1240px] rounded-[20px] bg-white px-5 py-8 shadow-[0_18px_40px_rgba(0,0,0,0.06)] sm:mx-auto sm:w-full sm:rounded-[28px] sm:px-[60px] sm:py-14 lg:rounded-[40px] lg:px-[100px] lg:py-16">
              <h2 className={`${heroFont.className} text-center text-[26px] font-semibold text-[#ED7428] sm:text-[36px] lg:text-[48px] lg:leading-[58px] tracking-[0.724138px]`}>
                Clinical Traineeship
              </h2>
              <p className={`${introFont.className} mx-auto mt-4 max-w-[976px] text-center text-[15px] leading-relaxed text-black sm:text-[18px] sm:leading-[24px] lg:text-[24px] lg:leading-[29px] tracking-[0.724138px]`}>
                Our three-month traineeship is designed for early career psychologists who are ready for more direct clinical learning.
              </p>

              {/* Icon */}
              <div className="my-8 flex justify-center sm:my-10">
                <div className="relative h-[80px] w-[117px] sm:h-[105px] sm:w-[154px] lg:h-[129px] lg:w-[189px]">
                  <Image
                    src="/images/services/training-icon-3.webp"
                    alt="Clinical traineeship icon"
                    fill
                    className="object-contain"
                    unoptimized
                  />
                </div>
              </div>

              <p className={`${introFont.className} mx-auto max-w-[976px] text-center text-[15px] leading-relaxed text-black sm:text-[18px] sm:leading-[24px] lg:text-[24px] lg:leading-[29px] tracking-[0.724138px]`}>
                Trainees receive supervised exposure to intake work, assessments, interventions, psychotherapy processes, case discussions, and report writing. They also learn to work within an interdisciplinary team that may include psychiatrists, psychologists, counsellors, and addiction professionals.
              </p>
            </div>
          </section>
        </FadeInSection>

        {/* Clinical Internship Programme — Pricing */}
        <FadeInSection>
          <section className="w-full bg-[#F7F5EF] py-14 sm:py-20 lg:py-24">
            <div className="mx-auto w-full max-w-[1100px] px-5 sm:px-8 lg:px-12">
              {/* Heading */}
              <h2 className={`${heroFont.className} text-[24px] font-semibold text-[#00373E] sm:text-[36px] lg:text-[48px] lg:leading-[58px] tracking-[0.724138px]`}>
                Clinical Internship Programme
              </h2>
              <p className={`${heroFont.className} mt-1 text-[18px] font-semibold text-[#00373E] sm:mt-2 sm:text-[28px] lg:text-[36px] lg:leading-[43px] tracking-[0.724138px]`}>
                For UG and PG students
              </p>

              {/* Two-column internship cards — dynamic */}
              <div className="mt-8 grid grid-cols-1 gap-6 sm:mt-10 sm:grid-cols-2 sm:gap-10">
                {internships.map((prog, idx) => (
                  <div key={prog.id} className="rounded-xl bg-white p-5 shadow-[0_2px_16px_rgba(0,55,62,0.06)] sm:rounded-2xl sm:p-6 lg:rounded-[24px] lg:p-8">
                    <h3 className={`${boldFont.className} text-[16px] font-bold text-black sm:text-[18px] lg:text-[24px] lg:leading-[29px] tracking-[0.724138px]`}>
                      {prog.title}
                    </h3>
                    <p className={`${introFont.className} mt-2 text-[15px] leading-relaxed text-black sm:text-[18px] sm:leading-[24px] lg:text-[24px] lg:leading-[29px] tracking-[0.724138px]`}>
                      {prog.description}
                    </p>

                    {prog.levels && prog.levels.length > 0 && (
                      <div className="mt-5 space-y-3">
                        {prog.levels.map((level, li) => (
                          <div
                            key={li}
                            className={`flex flex-col gap-2 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:rounded-full sm:px-5 sm:py-2.5 ${li === 0 && idx === 0 ? 'border-[#00373E]' : 'border-[#ED7428]'}`}
                          >
                            <span className={`${boldFont.className} text-[13px] font-bold text-black sm:text-[16px] lg:text-[20px] lg:leading-[26px] tracking-[0.724138px]`}>
                              {level.label} — {level.hours} — {level.price}
                            </span>
                            {/* PAYMENT DISABLED — uncomment when Razorpay is integrated
                            <button
                              type="button"
                              onClick={() => setEnrollTarget({
                                programId: prog.id,
                                programTitle: prog.title,
                                levelIndex: li,
                                levelLabel: `${level.label} — ${level.hours}`,
                                priceDisplay: level.price,
                              })}
                              className={`${heroFont.className} shrink-0 rounded-full bg-[#00373E] px-5 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#024a53] sm:text-[14px]`}
                            >
                              Enroll
                            </button>
                            */}
                          </div>
                        ))}
                      </div>
                    )}
                    {prog.format && (
                      <p className={`${introFont.className} mt-3 text-[14px] text-black sm:text-[16px] lg:text-[18px] tracking-[0.724138px]`}>
                        {prog.format}
                      </p>
                    )}
                    <a
                      href={`mailto:training@hopetrustindia.com?subject=Enquiry about ${encodeURIComponent(prog.title)}`}
                      className={`${heroFont.className} mt-5 inline-block rounded-full bg-[#00373E] px-6 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#024a53] sm:text-[15px]`}
                    >
                      Enquire Now
                    </a>
                  </div>
                ))}
              </div>

              {/* Clinical Traineeship details — dynamic */}
              {traineeships.map((tp) => (
                <div key={tp.id} className="mt-10 sm:mt-14 lg:mt-20">
                  <h2 className={`${heroFont.className} text-[24px] font-semibold text-[#00373E] sm:text-[36px] lg:text-[48px] lg:leading-[58px] tracking-[0.724138px]`}>
                    {tp.title}
                  </h2>
                  <p className={`${heroFont.className} mt-1 text-[18px] font-semibold text-[#00373E] sm:mt-2 sm:text-[28px] lg:text-[36px] lg:leading-[43px] tracking-[0.724138px]`}>
                    For Postgraduates
                  </p>

                  <div className="mt-6 flex flex-col gap-6 rounded-xl bg-white p-5 shadow-[0_2px_16px_rgba(0,55,62,0.06)] sm:mt-8 sm:gap-8 sm:rounded-2xl sm:p-6 lg:rounded-[24px] lg:flex-row lg:items-start lg:gap-16 lg:p-8">
                    <div className="w-full lg:w-1/2">
                      <p className={`${introFont.className} text-[15px] leading-relaxed text-black sm:text-[18px] sm:leading-[24px] lg:text-[24px] lg:leading-[29px] tracking-[0.724138px]`}>
                        {tp.description}
                      </p>
                    </div>

                    <div className="w-full lg:w-1/2">
                      <ul className={`${boldFont.className} space-y-2 text-[15px] font-bold text-black sm:text-[18px] lg:text-[24px] lg:leading-[29px] tracking-[0.724138px]`}>
                        {tp.duration && <li>Duration — {tp.duration}</li>}
                        {tp.fee && <li>Fee — {tp.fee}</li>}
                        {tp.format && <li>Format — {tp.format}</li>}
                      </ul>
                      <a
                        href={`mailto:training@hopetrustindia.com?subject=Enquiry about ${encodeURIComponent(tp.title)}`}
                        className={`${heroFont.className} mt-6 inline-block rounded-full bg-[#00373E] px-8 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-[#024a53] sm:text-[18px] lg:text-[20px]`}
                      >
                        Enquire Now
                      </a>
                      {/* PAYMENT DISABLED — uncomment when Razorpay is integrated
                      <button
                        type="button"
                        onClick={() => setEnrollTarget({
                          programId: tp.id,
                          programTitle: tp.title,
                          priceDisplay: tp.fee || undefined,
                        })}
                        className={`${heroFont.className} mt-6 inline-block rounded-full bg-[#00373E] px-8 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-[#024a53] sm:text-[18px] lg:text-[20px]`}
                      >
                        Enroll now
                      </button>
                      */}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </FadeInSection>

        {/* What you gain / Who it is for */}
        <FadeInSection>
          <section className="w-full bg-[#F7F5EF] py-14 sm:py-20 lg:py-24">
            <div className="mx-auto flex w-full max-w-[1185px] flex-col gap-8 px-4 sm:px-8">
              {/* What you gain */}
              <WhatYouGainCard heroFont={heroFont} introFont={introFont} />

              {/* Who it is for */}
              <div className="rounded-2xl bg-[#00373E] p-5 sm:rounded-[31px] sm:p-[31px]">
                <h3 className={`${heroFont.className} text-[24px] font-semibold text-[#ED7428] sm:text-[32px] lg:text-[40px] lg:leading-[48px] tracking-[0.724138px]`}>
                  Who it is for
                </h3>
                <p className={`${introFont.className} mt-3 text-[15px] leading-relaxed text-[#F9E6D0] sm:text-[18px] sm:leading-[24px] lg:text-[24px] lg:leading-[29px] tracking-[0.724138px]`}>
                  Internships are open to psychology students at undergraduate and postgraduate levels. The traineeship is for those with a full time Master&apos;s degree in psychology or counselling who are ready for more focused clinical work.
                </p>
              </div>

            </div>
          </section>
        </FadeInSection>

        {/* Scrolling marquee banner */}
        <ScrollingTextBanner />

        {/* A steady place to begin — gradient video bg */}
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
          <div className="relative z-10 mx-auto max-w-[1100px] px-5 sm:px-10">
            <div className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:gap-12 sm:py-10">
              <h2 className={`${heroFont.className} w-full text-[22px] font-semibold leading-tight text-white sm:w-auto sm:shrink-0 sm:text-[32px] lg:text-[40px] lg:leading-[48px] tracking-[0.724138px]`}>
                A steady place to begin
              </h2>
              <p className={`${introFont.className} max-w-[686px] text-[15px] leading-relaxed text-white sm:text-[18px] sm:leading-[24px] lg:text-[24px] lg:leading-[29px] tracking-[0.724138px]`}>
                Training is not only about theory. It is about learning how to listen, observe, understand, and respond with care. That is the kind of learning we try to offer here.
              </p>
            </div>
          </div>
        </section>
        <FaqSection items={trainingFaqs} />
      </main>
      <Footer />

      {/* PAYMENT DISABLED — uncomment when Razorpay is integrated
      <EnrollmentModal
        open={enrollTarget !== null}
        onClose={() => setEnrollTarget(null)}
        programType="training"
        programId={enrollTarget?.programId ?? ''}
        programTitle={enrollTarget?.programTitle ?? ''}
        levelIndex={enrollTarget?.levelIndex}
        levelLabel={enrollTarget?.levelLabel}
        priceDisplay={enrollTarget?.priceDisplay}
      />
      */}
    </>
  );
}

function InternshipPathways({
  heroFont,
  introFont,
}: {
  heroFont: { className: string };
  introFont: { className: string };
}) {
  return (
    <section className="w-full bg-[#F7F5EF] py-8 sm:py-12 md:py-14 lg:py-20">
      <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8">
        {/* White rounded card wrapping the whole section */}
        <div className="relative overflow-hidden rounded-2xl bg-[#FBF9F7] px-5 py-8 shadow-sm sm:rounded-3xl sm:px-8 sm:py-12 md:px-10 md:py-14 lg:rounded-[32px] lg:px-16 lg:py-20">
          {/* Decorative footsteps video — tablet (md) up, grows on wider screens */}
          <video
            src="/videos/training-footsteps.mp4"
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            aria-hidden="true"
            style={{ clipPath: 'inset(0 4px 0 0)' }}
            className="pointer-events-none absolute right-0 top-24 -bottom-4 hidden w-[48%] max-w-[460px] bg-transparent object-contain object-right-bottom opacity-90 md:block lg:top-48 lg:-bottom-8 lg:w-[95%] lg:max-w-[1120px] lg:opacity-95"
          />

          {/* Heading */}
          <h2
            className={`${heroFont.className} relative mb-6 text-[24px] font-semibold text-[#00373E] sm:mb-10 sm:text-[32px] md:mb-12 md:text-[36px] lg:text-[48px] lg:leading-[58px] tracking-[0.724138px]`}
          >
            Internship Pathways
          </h2>

          <div className="relative flex w-full max-w-full flex-col gap-4 sm:gap-6 md:max-w-[480px] md:gap-7 lg:max-w-[620px] lg:gap-8">
            {/* Card 1 — Addiction Treatment Internship */}
            <div className="rounded-2xl bg-[#ED7428] p-5 sm:p-6 md:rounded-3xl md:p-7 lg:rounded-[31px] lg:p-[31px]">
              <h3
                className={`${introFont.className} text-[22px] font-normal leading-tight text-[#00373E] sm:text-[28px] md:text-[30px] lg:text-[40px] lg:leading-[48px] tracking-[0.724138px]`}
              >
                Addiction Treatment
                <br className="hidden sm:inline" />
                <span className="sm:hidden"> </span>
                Internship
              </h3>
              <p
                className={`${introFont.className} mt-3 text-[14px] leading-relaxed text-[#F9E6D0] sm:text-[16px] sm:leading-[22px] md:text-[17px] md:leading-[24px] lg:text-[24px] lg:leading-[29px] tracking-[0.724138px]`}
              >
                Focused on addiction, recovery, and co-occurring concerns in a therapeutic setting.
              </p>
            </div>

            {/* Card 2 — General Clinical Internship */}
            <div className="rounded-2xl bg-[#00373E] p-5 sm:p-6 md:rounded-3xl md:p-7 lg:rounded-[31px] lg:p-[31px]">
              <h3
                className={`${introFont.className} text-[22px] font-normal leading-tight text-[#ED7428] sm:text-[28px] md:text-[30px] lg:text-[40px] lg:leading-[48px] tracking-[0.724138px]`}
              >
                General Clinical
                <br className="hidden sm:inline" />
                <span className="sm:hidden"> </span>
                Internship
              </h3>
              <p
                className={`${introFont.className} mt-3 text-[14px] leading-relaxed text-[#F9E6D0] sm:text-[16px] sm:leading-[22px] md:text-[17px] md:leading-[24px] lg:text-[24px] lg:leading-[29px] tracking-[0.724138px]`}
              >
                Focused on counselling psychology, clinical psychology, and addiction-related work through classes and experiential learning.
              </p>
            </div>
          </div>

          {/* Bottom note */}
          <p
            className={`${introFont.className} relative mt-8 max-w-full text-[14px] leading-relaxed text-black sm:mt-10 sm:text-[16px] sm:leading-[22px] md:mt-12 md:max-w-[480px] md:text-[17px] md:leading-[24px] lg:mt-14 lg:max-w-[595px] lg:text-[24px] lg:leading-[29px] tracking-[0.724138px]`}
          >
            Both options are available in different levels, with online and on-site formats depending on the programme.
          </p>
        </div>
      </div>
    </section>
  );
}

const GAIN_TEXTS = [
  'Hands-on clinical exposure',
  'Supervision and case discussion',
  'Training in assessments and evidence-based interventions',
  'Peer learning and ongoing skill building',
  'A clearer sense of how to work with clients in real settings',
];

function WhatYouGainCard({
  heroFont,
  introFont,
}: {
  heroFont: { className: string };
  introFont: { className: string };
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % GAIN_TEXTS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="rounded-2xl bg-[#ED7428] p-5 sm:rounded-[31px] sm:p-[31px]">
      <h3 className={`${heroFont.className} text-[24px] font-semibold text-white sm:text-[32px] lg:text-[40px] lg:leading-[48px] tracking-[0.724138px]`}>
        What you gain
      </h3>
      <div className="relative mt-3 h-[52px] sm:h-[28px] lg:h-[29px] overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.p
            key={index}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }}
            className={`${introFont.className} absolute text-[15px] leading-relaxed text-[#F9E6D0] sm:text-[18px] sm:leading-[24px] lg:text-[24px] lg:leading-[29px] tracking-[0.724138px]`}
          >
            {GAIN_TEXTS[index]}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
