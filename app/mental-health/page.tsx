"use client";

import { useState, useRef, useEffect, useCallback, memo } from "react";
import { motion, AnimatePresence, useScroll, useTransform } from "motion/react";
import Image from 'next/image';
import { Bricolage_Grotesque } from 'next/font/google';
import Header from '@/components/Header';
import FadeInSection from '@/components/FadeInSection';
import dynamic from 'next/dynamic';
import { getAssetUrl } from '@/lib/assets';
import FaqSection from '@/components/FaqSection';
import { mentalHealthFaqs } from '@/lib/faqs';

const fadeFrom = (direction: 'left' | 'right' | 'up', delay = 0) => ({
  initial: {
    opacity: 0,
    x: direction === 'left' ? -60 : direction === 'right' ? 60 : 0,
    y: direction === 'up' ? 40 : 0,
  },
  whileInView: { opacity: 1, x: 0, y: 0 },
  viewport: { once: true, amount: 0.25 },
  transition: {
    duration: 0.7,
    ease: [0.22, 0.61, 0.36, 1] as const,
    delay,
  },
});

const Footer = dynamic(() => import('@/components/Footer'));
const ScrollingTextBanner = dynamic(() => import('@/components/ScrollingTextBanner'));

type FocusKey = 'therapy' | 'psychiatry' | 'couples' | 'family';
type AssessmentKey = 'adhd' | 'student' | 'queer';

type FocusConfig = {
  label: string;
  heading: string;
  paragraphs: string[];
  issues: React.ReactNode;
  cardBg: string;
  imageSrc: string;
  imageAlt: string;
  /** A page that covers this service in depth. */
  more?: { label: string; href: string };
};

const FOCUS_SECTIONS: Record<FocusKey, FocusConfig> = {
  therapy: {
    label: 'Therapy',
    heading: 'Therapy',
    paragraphs: [
      'A quiet space to understand what is happening within you.',
      'Therapy helps you notice patterns, make sense of your concerns and move toward clarity and steadiness at your own pace.',
    ],
    issues:
      'Anxiety, Depression, Stress, Anger Management, ADHD, Bipolar Disorder, Schizophrenia',
    cardBg: '#F9E6D0',
    imageSrc: getAssetUrl('mental health therapy.png'),
    imageAlt: 'Therapy illustration',
    more: { label: 'Find a therapist', href: '/book-your-session/' },
  },
  psychiatry: {
    label: 'Medications',
    heading: 'Medications',
    paragraphs: [
      'If medication can support your well-being, our psychiatrists explain it simply. You understand why it is suggested, how it works and what to expect. Your progress is reviewed gently and decisions are made together.',
    ],
    issues:
      'Anxiety, Depression, Stress, Anger Management, Loneliness, Procrastination, Grief, Trauma, Interpersonal Challenges',
    cardBg: '#F8F1BC',
    imageSrc: getAssetUrl('medications.png'),
    imageAlt: 'Medications illustration',
  },
  couples: {
    label: 'Couples Therapy',
    heading: 'Couples Therapy',
    paragraphs: [
      'A space for partners to slow down, talk openly and understand each other with less conflict.',
      'The focus is on communication, trust and rebuilding connection.',
      'Steps: 1. Initial session  2. Individual space for each partner  3. Joint sessions for collaboration.',
    ],
    issues:
      'Communication, Conflict Resolution, Trust Building, Empathy',
    cardBg: '#EDE6B1',
    imageSrc: getAssetUrl('couple therapy.png'),
    imageAlt: 'Couples therapy illustration',
    more: { label: 'Couples & marriage counselling', href: '/couples-counselling/' },
  },
  family: {
    label: 'Family Therapy',
    heading: 'Family Therapy',
    paragraphs: [
      'Family therapy offers a calm space to work through misunderstandings, repeated arguments or changes that feel heavy at home.',
      'The aim is healthier communication and balance.',
    ],
    issues:
      <>Family Conflicts, Boundaries, Generational Gaps,<br />Parent–Child Communication</>,
    cardBg: '#DFD58F',
    imageSrc: getAssetUrl('family therapy.png'),
    imageAlt: 'Family therapy illustration',
  },
};

const ASSESSMENTS: Record<
  AssessmentKey,
  { label: string; paragraphs: string[] }
> = {
  adhd: {
    label: 'ADHD Testing',
    paragraphs: [
      'ADHD evaluations are structured and easy to follow.',
      'You receive a clear explanation of the results and what they mean for day-to-day life.',
      'Next steps are discussed gently so you know how to move forward.',
    ],
  },
  student: {
    label: 'Student Mental Health',
    paragraphs: [
      'Support for school, college, and university students navigating stress, exams, and changes.',
      'We also offer career counselling to help students explore their strengths, make informed decisions, and plan their next steps with confidence.',
      'Sessions focus on building routines, managing expectations, and finding healthy balance.',
      'Parents and caregivers can be included when helpful.',
    ],
  },
  queer: {
    label: 'Queer Affirmative Mental Health',
    paragraphs: [
      'A space that respects and affirms your gender identity and sexual orientation.',
      'Therapists work with you to process stigma, build safety, and honour your lived experience.',
      'Care is collaborative, non-judgmental, and rooted in your context.',
    ],
  },
};

// Single font instance with all needed weights (avoids 4 separate network requests)
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
});

const CAROUSEL_SLIDES = [
  {
    image: getAssetUrl('mental_health_carousel.png'),
    alt: "Addiction and overlapping concerns",
    title: "Addiction and overlapping concerns",
    paragraphs: [
      "Mental health and addiction often affect each other. We support alcohol dependence, nicotine use, behavioral addictions, and dual diagnosis, where emotional or psychiatric concerns and addiction are both present.",
    ],
    bold: "This can include gambling, internet use, gaming, shopping, food-related issues, compulsive work, exercise, and other repeated behaviors that begin to cause harm.",
  },
  {
    image: getAssetUrl('mental_health_carousel_2.png'),
    alt: "Couples and relationship support",
    title: "Couples and relationship support",
    paragraphs: [
      "Couples therapy can help with communication, conflict, trust, intimacy, family pressures, differing values, and the strain of work or health concerns.",
      "The aim is to help both people understand each other better and build a steadier relationship.",
    ],
    bold: "",
  },
  {
    image: getAssetUrl('mental_health_carousel_3.png'),
    alt: "LGBTQIA+ affirmative care",
    title: "LGBTQIA+ affirmative care",
    paragraphs: [
      "We offer supportive and affirmative care for LGBTQIA+ individuals.",
      "This may include identity-related distress, stigma, coming out, relationship concerns, gender dysphoria, anxiety, depression, or the emotional weight of feeling unseen or unsupported.",
    ],
    bold: "",
  },
];

const ConcernsCarousel = memo(function ConcernsCarousel() {
  const [active, setActive] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const startAutoPlay = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setActive((prev) => (prev + 1) % CAROUSEL_SLIDES.length);
    }, 5000);
  }, []);

  useEffect(() => {
    startAutoPlay();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [startAutoPlay]);

  const goTo = (index: number) => {
    setActive(index);
    startAutoPlay();
  };

  const slide = CAROUSEL_SLIDES[active];

  return (
    <section className="w-full bg-[#F7F6F4] px-4 sm:px-8 lg:px-12 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-[1257px] rounded-[28px] sm:rounded-[40px] bg-[#ED7428] overflow-hidden" style={{ minHeight: 517 }}>
        <div className="flex flex-col md:flex-row md:items-stretch min-h-[inherit]">
          {/* Image */}
          <div className="w-full md:w-[40%] relative min-h-[250px] sm:min-h-[300px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={`img-${active}`}
                className="absolute inset-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
              >
                <Image
                  src={slide.image}
                  alt={slide.alt}
                  fill
                  className="object-cover"
                  loading="lazy"
                  sizes="(max-width: 768px) 100vw, 40vw"
                />
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Text */}
          <div className="w-full md:w-[60%] flex flex-col justify-center px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
            {/* Every slide's text is rendered and the inactive ones hidden, so
                all three topics are in the static HTML — not just the first. */}
            {CAROUSEL_SLIDES.map((s, idx) => (
              <div
                key={s.title}
                hidden={idx !== active}
                className={`${idx === active ? "flex animate-fade-in" : "hidden"} flex-col gap-4`}
              >
                <h3 className="text-xl sm:text-2xl lg:text-[32px] font-bold leading-tight text-white">
                  {s.title}
                </h3>
                {s.paragraphs.map((p, i) => (
                  <p
                    key={i}
                    className="text-sm sm:text-base lg:text-lg font-normal leading-relaxed text-white"
                  >
                    {p}
                  </p>
                ))}
                {s.bold && (
                  <p className="text-sm sm:text-base lg:text-lg font-bold leading-relaxed text-white">
                    {s.bold}
                  </p>
                )}
              </div>
            ))}

            {/* Dots */}
            <div className="flex gap-3 mt-6">
              {CAROUSEL_SLIDES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  className={`w-3 h-3 rounded-full transition-all duration-300 ${
                    i === active ? "bg-white scale-110" : "bg-white/40"
                  }`}
                  aria-label={`Go to slide ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});

// Lazy-loaded video component — only loads when scrolled into view
function LazyVideo({ src, className }: { src: string; className: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <video
      ref={ref}
      autoPlay={isVisible}
      muted
      loop
      playsInline
      className={className}
      preload="none"
    >
      {isVisible && <source src={src} type="video/mp4" />}
    </video>
  );
}

export default function MentalHealthPage() {
  const [activeFocus, setActiveFocus] = useState<FocusKey>('therapy');
  const [activeAssessment, setActiveAssessment] =
    useState<AssessmentKey>('adhd');

  const heroRef = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const backgroundY = useTransform(scrollYProgress, [0, 1], ["0%", "20%"]);
  const textY = useTransform(scrollYProgress, [0, 1], ["0%", "-30%"]);

  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#F7F6F4]">
        {/* Hero section with background video. The dark ground keeps the white
            heading readable before the poster arrives. */}
        <section
          ref={heroRef}
          className="relative h-screen w-full overflow-hidden bg-[#00373E]"
        >
          {/* Background video, served from this site so the CDN caches it. It
              is a 720p cut of the original 4K clip with its index at the front
              (1.8 MB, was 6 MB from Supabase storage with no edge caching), and
              the poster is its own first frame, so the swap is seamless. */}
          <motion.video
            style={{ y: backgroundY, willChange: 'transform' }}
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
            preload="auto"
            poster="/images/services/mental-health-hero-poster.webp"
          >
            <source src="/videos/mental-health-hero.mp4" type="video/mp4" />
          </motion.video>

          {/* Dark overlay for readability */}
          <div className="absolute inset-0 bg-black/66" />

          {/* Centered content */}
          <motion.div
            style={{ y: textY, willChange: 'transform' }}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 0.61, 0.36, 1], delay: 0.2 }}
            className="relative z-10 flex h-full w-full flex-col items-center justify-center px-4 sm:px-6 lg:px-8 text-center text-white"
          >
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-7xl font-semibold tracking-[0.18em] uppercase">
              Mental Health{' '}
              <span className="mt-5 block text-base font-medium normal-case tracking-normal sm:text-lg md:text-xl lg:text-2xl">
                Therapy and psychiatry in Hyderabad
              </span>
            </h1>

            {/* Two pairs, a line each on a phone and one line from sm up. The
                browser used to break inside "Family Therapy" or "Couples
                Therapy" and leave "Therapy" alone on a line. */}
            <div className="mt-6 sm:mt-8 text-base sm:text-lg md:text-xl lg:text-2xl font-medium leading-tight">
              <p>
                <span className="block sm:inline">
                  <span>Therapy</span>
                  <span className="mx-1.5 sm:mx-3 text-white/60">|</span>
                  <span>Medications</span>
                </span>
                <span className="hidden sm:inline sm:mx-3 text-white/60">|</span>
                <span className="mt-1 block sm:mt-0 sm:inline">
                  <span className="whitespace-nowrap">Couples Therapy</span>
                  <span className="mx-1.5 sm:mx-3 text-white/60">|</span>
                  <span className="whitespace-nowrap">Family Therapy</span>
                </span>
              </p>
              <p className="mt-2">&amp; more</p>
            </div>
          </motion.div>
        </section>

        {/* Support banner with video background — lazy-loaded */}
        <section className="relative w-full overflow-hidden py-8 sm:py-10 bg-[#00373E]">
          <LazyVideo src={getAssetUrl('348932.mp4')} className="absolute inset-0 h-full w-full object-cover" />
          <motion.div
            {...fadeFrom('up')}
            className="relative z-10 flex flex-col items-center justify-center text-center px-4 sm:px-8"
          >
            <p className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-white leading-snug">
              Support for
              <br />
              the mind, emotions, relationships, &amp; everyday life.
            </p>
          </motion.div>
        </section>

        {/* What we help with section */}
        <section className="w-full bg-[#F7F5EF] py-12 sm:py-16 lg:py-20">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-8 lg:px-12 flex flex-col md:flex-row items-center gap-8 md:gap-14">
            {/* Left: image */}
            <motion.div {...fadeFrom('left')} className="w-full md:w-1/2 rounded-[24px] sm:rounded-[32px] overflow-hidden shadow-lg">
              <Image
                src={getAssetUrl('mental_health_new.png')}
                alt="Therapist working with client"
                width={560}
                height={480}
                className="w-full h-auto object-cover"
                loading="lazy"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            </motion.div>

            {/* Right: text content */}
            <motion.div {...fadeFrom('right', 0.15)} className="w-full md:w-1/2 flex flex-col gap-5">
              <h2 className="text-2xl sm:text-3xl lg:text-[48px] font-semibold leading-normal sm:leading-[58px] tracking-[0.724px] text-[#00373E]">
                What we help with
              </h2>
              <p className="text-sm sm:text-base lg:text-[24px] font-medium leading-normal sm:leading-[29px] tracking-[0.724px] text-black">
                We support people dealing with depression, anxiety, stress, trauma, grief, anger, low self-worth, sleep difficulties, OCD, ADHD, bipolar disorder, phobias, schizophrenia, personality-related concerns, and other mental health difficulties.
              </p>
              <p className="text-sm sm:text-base lg:text-[24px] font-medium leading-normal sm:leading-[29px] tracking-[0.724px] text-black">
                We also support concerns around relationships, emotional disconnection, trust, family conflict, intimacy, parenting, and major life changes.
              </p>
              <div>
                <a
                  href="/book-your-session"
                  className="inline-flex items-center justify-center rounded-full bg-[#ED7428] px-6 sm:px-8 py-2.5 text-sm sm:text-base font-semibold text-white shadow-md hover:bg-[#d4651f] transition-all duration-200 active:scale-95"
                >
                  Find a Therapist
                </a>
              </div>
            </motion.div>
          </div>
        </section>

        <div className="w-full bg-[#F7F5EF]">
          <FadeInSection>
            <ScrollingTextBanner />
          </FadeInSection>
        </div>

        {/* Focus area strip + card */}
        <FadeInSection>
        <section className="w-full bg-[#F7F6F4]">
          <div className="mx-auto flex w-full justify-center px-4 sm:px-8 lg:px-12 pt-10 pb-16">
            {/* Outer card */}
            <div className="flex h-auto md:min-h-[650px] w-full max-w-[1170px] flex-col rounded-[28px] sm:rounded-[44px] md:rounded-[84px] bg-transparent overflow-hidden">
              {/* Top strip with tabs */}
              <div className="flex bg-[#FFE3C7]" role="tablist" aria-label="Mental health services">
                {(Object.keys(FOCUS_SECTIONS) as FocusKey[]).map((key) => {
                  const isActive = key === activeFocus;
                  const activeBgClass =
                    key === "psychiatry"
                      ? "bg-[#F8F1BC]"
                      : key === "couples"
                        ? "bg-[#EDE6B1]"
                        : key === "family"
                          ? "bg-[#DFD58F]"
                          : "bg-[#FFF4D9]";
                  return (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      id={`focus-tab-${key}`}
                      aria-selected={isActive}
                      aria-controls={`focus-panel-${key}`}
                      onClick={() => setActiveFocus(key)}
                      className={`flex-1 px-1 py-2.5 sm:px-2 sm:py-3 md:px-4 md:py-4 text-[9px] sm:text-xs md:text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ED7428]/40 focus-visible:ring-offset-4 ${
                        isActive
                          ? `${activeBgClass} text-[#ED7428]`
                          : "bg-transparent text-[#00373E] hover:bg-[#FFEED2]"
                      }`}
                    >
                      {FOCUS_SECTIONS[key].label}
                    </button>
                  );
                })}
              </div>

              {/* Content cards. All four are rendered and the inactive ones are
                  hidden, rather than only the active one being mounted: the
                  page is statically exported, so anything not in the initial
                  render is not in the HTML. Before this, search engines saw the
                  Therapy panel only — couples therapy, family therapy and
                  medication were invisible to them. */}
              {(Object.keys(FOCUS_SECTIONS) as FocusKey[]).map((key) => {
                const section = FOCUS_SECTIONS[key];
                const isActive = key === activeFocus;
                return (
                  <div
                    key={key}
                    role="tabpanel"
                    id={`focus-panel-${key}`}
                    aria-labelledby={`focus-tab-${key}`}
                    hidden={!isActive}
                    className={`${isActive ? "flex animate-fade-in" : "hidden"} flex-1 px-5 py-8 sm:px-10 sm:py-12 shadow-[0_24px_60px_rgba(0,0,0,0.06)] flex-col md:flex-row items-center gap-6 md:gap-12`}
                    style={{ backgroundColor: section.cardBg }}
                  >
                    {/* Left illustration */}
                    <div className="w-full md:w-[30%] flex justify-center">
                      <div className="relative w-[110px] h-[140px] sm:w-[140px] sm:h-[180px] md:w-[170px] md:h-[210px]">
                        <Image
                          src={section.imageSrc}
                          alt={section.imageAlt}
                          fill
                          className="object-contain"
                          loading="lazy"
                          sizes="(max-width: 768px) 110px, 170px"
                        />
                      </div>
                    </div>

                    {/* Right text */}
                    <div className="w-full md:w-[70%] text-left text-[#00373E] space-y-3 md:space-y-4">
                      <h2
                        className={bricolage.className}
                        style={{
                          color: "#E26B20",
                          fontSize: "clamp(28px, 5vw, 48px)",
                          fontWeight: 600,
                          lineHeight: "normal",
                          letterSpacing: "0.724px",
                          maxWidth: "341px",
                        }}
                      >
                        {section.heading}
                      </h2>
                      <div style={{ maxWidth: "744px" }}>
                        {section.paragraphs.map((para) => (
                          <p
                            key={para}
                            className={bricolage.className}
                            style={{
                              fontSize: "clamp(14px, 2.5vw, 24px)",
                              fontWeight: 500,
                              lineHeight: "normal",
                              letterSpacing: "0.724px",
                              color: "#00373E",
                              marginBottom: "12px",
                            }}
                          >
                            {para}
                          </p>
                        ))}
                      </div>
                      <p
                        className={bricolage.className}
                        style={{
                          fontSize: "clamp(14px, 2.5vw, 24px)",
                          fontWeight: 700,
                          lineHeight: "normal",
                          letterSpacing: "0.724px",
                          color: "#00373E",
                        }}
                      >
                        {section.issues}
                      </p>
                      {section.more && (
                        <a
                          href={section.more.href}
                          className={`${bricolage.className} inline-flex items-center gap-2 rounded-full bg-[#00373E] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#025a66] sm:text-base`}
                        >
                          {section.more.label}
                          <span aria-hidden="true">→</span>
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
        </FadeInSection>

        {/* CTA card */}
        <FadeInSection delay={100}>
        <section className="w-full bg-[#F7F6F4] px-4 sm:px-8 lg:px-12 pb-10">
          <div className="mx-auto w-full max-w-[1170px] rounded-[28px] sm:rounded-[40px] bg-white shadow-[0_24px_60px_rgba(0,0,0,0.04)] py-10 sm:py-14 px-6 sm:px-10 text-center flex flex-col items-center gap-4">
            <h3 className="text-lg sm:text-xl lg:text-2xl font-bold text-[#00373E]">
              You do not have to wait to feel better.
            </h3>
            <p className="text-sm sm:text-base lg:text-lg font-normal text-[#00373E]">
              Take the first step towards support and healing.
            </p>
            <a
              href="/book-your-session"
              className="mt-2 inline-flex items-center justify-center rounded-full bg-[#ED7428] px-6 sm:px-8 py-2.5 text-sm sm:text-base font-semibold text-white shadow-md hover:bg-[#d4651f] transition-all duration-200 active:scale-95"
            >
              Book an appointment
            </a>
          </div>
        </section>
        </FadeInSection>

        {/* Auto-carousel section */}
        <FadeInSection>
          <ConcernsCarousel />
        </FadeInSection>

        {/* Assessment cards section */}
        <section className="w-full bg-[#F7F6F4] pb-16 sm:pb-20">
          <div className="mx-auto w-full max-w-[1225px] px-4 sm:px-6 lg:px-8 pt-10">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
              className="relative rounded-[24px] sm:rounded-[40px] lg:rounded-[63px] bg-white px-6 sm:px-10 lg:px-16 py-10 sm:py-12 shadow-[0_24px_60px_rgba(0,0,0,0.03)]"
            >
              {/* Top tabs */}
              <div className="flex flex-col gap-6 sm:gap-8">
                <div className="flex flex-wrap items-center justify-start gap-4 sm:gap-8 text-sm sm:text-base lg:text-xl font-semibold">
                  {(["adhd", "student", "queer"] as AssessmentKey[]).map(
                    (key) => {
                      const isActive = key === activeAssessment;
                      const label = ASSESSMENTS[key].label;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setActiveAssessment(key)}
                          className={`transition-colors ${
                            isActive
                              ? "text-[#ED7428]"
                              : "text-[#E0DFDD] hover:text-[#ED7428]"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    },
                  )}
                </div>

                {/* Copy for every assessment, inactive ones hidden — so ADHD
                    testing, student mental health and queer affirmative care
                    are all in the static HTML, not just whichever is open. */}
                {(["adhd", "student", "queer"] as AssessmentKey[]).map((key) => (
                  <div
                    key={key}
                    hidden={key !== activeAssessment}
                    className={`${key === activeAssessment ? "block animate-fade-in" : "hidden"} ${bricolage.className} mt-2 max-w-[1058px] text-base sm:text-lg lg:text-[24px] leading-relaxed text-[#5E5E5E] tracking-[0.724px] space-y-4`}
                  >
                    <h3 className="text-xl sm:text-2xl lg:text-[40px] font-semibold tracking-[0.724px] text-[#E26B20]">
                      {ASSESSMENTS[key].label}
                    </h3>
                    {ASSESSMENTS[key].paragraphs.map((p) => (
                      <p key={`${key}-${p}`}>{p}</p>
                    ))}
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        <FaqSection items={mentalHealthFaqs} />
      </main>
      <Footer />
    </>
  );
}

