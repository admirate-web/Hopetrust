import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Check, Clock, Languages, MapPin, Phone, Video } from 'lucide-react';
import { Bricolage_Grotesque } from 'next/font/google';
import Header from '@/components/Header';
import FadeInSection from '@/components/FadeInSection';
import FaqSection from '@/components/FaqSection';
import JsonLd from '@/components/JsonLd';
import Reveal from '@/components/specialty/Reveal';
import SpecialtyHero from '@/components/specialty/SpecialtyHero';
import { getDoctorsForBuild, languagesSpoken } from '@/lib/doctors';
import { getBreadcrumbSchema, getFAQSchema, getServiceSchema } from '@/lib/jsonld';
import { siteConfig } from '@/lib/config';
import type { Specialty, SpecialtySection } from '@/lib/specialties';

const Footer = dynamic(() => import('@/components/Footer'));
const ScrollingTextBanner = dynamic(() => import('@/components/ScrollingTextBanner'));

// The service pages' type: Bricolage Grotesque for headings and body.
const headingFont = Bricolage_Grotesque({ subsets: ['latin'], weight: ['600'] });
const bodyFont = Bricolage_Grotesque({ subsets: ['latin'], weight: ['400'] });
const mediumFont = Bricolage_Grotesque({ subsets: ['latin'], weight: ['500'] });

const H2 = `${headingFont.className} text-[26px] leading-tight sm:text-[36px] lg:text-[44px] lg:leading-[54px] tracking-[0.724138px] font-semibold text-[#00373E]`;
const BODY = `${bodyFont.className} text-[15px] leading-relaxed sm:text-[18px] lg:text-[20px] lg:leading-[32px] tracking-[0.3px] text-[#1a1a1a]`;

/** Metadata for a specialty route. The root template appends " | Hope Trust". */
export function specialtyMetadata(s: Specialty): Metadata {
  const path = `/${s.slug}/`;
  return {
    title: s.metaTitle,
    description: s.metaDescription,
    alternates: { canonical: path },
    openGraph: {
      title: `${s.metaTitle} | Hope Trust`,
      description: s.metaDescription,
      type: 'website',
      url: `${siteConfig.url}${path}`,
      siteName: 'Hope Trust',
      locale: 'en_IN',
      images: [{ url: `${siteConfig.url}${s.heroImage.src}`, alt: s.heroImage.alt }],
    },
  };
}

/** The body of a section, by kind, in the type and colour of the service pages. */
function SectionContent({ section }: { section: SpecialtySection }) {
  switch (section.kind) {
    case 'text':
      return (
        <>
          <h2 className={H2}>{section.heading}</h2>
          <div className="mt-5 space-y-4">
            {section.paragraphs.map((p) => (
              <p key={p} className={BODY}>
                {p}
              </p>
            ))}
          </div>
        </>
      );

    case 'list':
      return (
        <>
          <h2 className={H2}>{section.heading}</h2>
          {section.intro && <p className={`mt-5 ${BODY}`}>{section.intro}</p>}
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {section.items.map((item) => (
              <li key={item} className={`${mediumFont.className} flex items-start gap-3 text-[15px] text-[#1a1a1a] sm:text-[17px]`}>
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FFF1E6]">
                  <Check className="h-3.5 w-3.5 text-[#ED7428]" aria-hidden="true" />
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          {section.outro && (
            <p className={`${bodyFont.className} mt-6 rounded-2xl bg-[#FFF7ED] px-5 py-4 text-[15px] leading-relaxed text-[#1a1a1a] ring-1 ring-[#ED7428]/15 sm:text-[17px]`}>
              {section.outro}
            </p>
          )}
        </>
      );

    case 'steps':
      return (
        <>
          <h2 className={H2}>{section.heading}</h2>
          {section.intro && <p className={`mt-5 ${BODY}`}>{section.intro}</p>}
          <ol className="mt-7 space-y-6">
            {section.steps.map((step, i) => (
              <li key={step.title}>
                <Reveal delay={i * 0.1} className="flex gap-4 sm:gap-5">
                  <span
                    className={`${headingFont.className} flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#ED7428] text-base text-white sm:h-12 sm:w-12 sm:text-lg`}
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <div>
                    <h3 className={`${mediumFont.className} text-lg text-[#00373E] sm:text-xl lg:text-2xl`}>
                      {step.title}
                    </h3>
                    <p className={`${bodyFont.className} mt-1.5 text-[15px] leading-relaxed text-[#1a1a1a] sm:text-[17px]`}>
                      {step.body}
                    </p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </>
      );

    case 'cards':
      return (
        <>
          <h2 className={H2}>{section.heading}</h2>
          {section.intro && <p className={`mt-5 ${BODY}`}>{section.intro}</p>}
          <CardGrid cards={section.cards} className="mt-7 sm:grid-cols-2" />
        </>
      );
  }
}

/** Cards in the style of the programme cards on /addiction/: orange rule, warm grey. */
function CardGrid({ cards, className = '' }: { cards: { title: string; body: string }[]; className?: string }) {
  return (
    <div className={`grid gap-5 ${className}`}>
      {cards.map((card, i) => (
        <FadeInSection key={card.title} delay={i * 100}>
          <div className="h-full rounded-[20px] border-l-4 border-[#ED7428] bg-[#FAFAFA] px-6 py-6 sm:px-7 sm:py-7">
            <h3 className={`${headingFont.className} text-lg text-[#ED7428] sm:text-xl`}>{card.title}</h3>
            <p className={`${bodyFont.className} mt-2 text-[15px] leading-relaxed text-[#1a1a1a] sm:text-base`}>
              {card.body}
            </p>
          </div>
        </FadeInSection>
      ))}
    </div>
  );
}

function SectionImage({ image }: { image: { src: string; alt: string } }) {
  return (
    <div className="overflow-hidden rounded-[24px] shadow-[0_8px_30px_rgba(0,0,0,0.08)] sm:rounded-[32px]">
      <Image
        src={image.src}
        alt={image.alt}
        width={1200}
        height={900}
        sizes="(min-width: 1024px) 46vw, 100vw"
        className="h-auto w-full object-cover"
      />
    </div>
  );
}

/**
 * One section. With an image it becomes the image-and-text row of the other
 * service pages, sides alternating down the page; without one, steps sit in a
 * white card and everything else runs full width.
 */
function SectionBlock({ section, index }: { section: SpecialtySection; index: number }) {
  const tint = index % 2 === 0 ? 'bg-[#F7F5EF]' : 'bg-white';

  // Cards with an image: the image and heading share a row, and the cards get
  // the full width below — five cards squeezed beside a photo read as a list.
  if (section.image && section.kind === 'cards') {
    const imageFirst = index % 2 === 0;
    return (
      <section className={`w-full ${tint} px-4 py-14 sm:px-8 sm:py-20 lg:px-12`}>
        <div className="mx-auto max-w-[1240px]">
          <div
            className={`flex flex-col items-center gap-10 lg:gap-16 ${
              imageFirst ? 'lg:flex-row' : 'lg:flex-row-reverse'
            }`}
          >
            <Reveal from={imageFirst ? 'left' : 'right'} className="w-full lg:w-[46%]">
              <SectionImage image={section.image} />
            </Reveal>
            <Reveal from={imageFirst ? 'right' : 'left'} delay={0.15} className="w-full lg:w-[54%]">
              <h2 className={H2}>{section.heading}</h2>
              {section.intro && <p className={`mt-5 ${BODY}`}>{section.intro}</p>}
            </Reveal>
          </div>
          <CardGrid cards={section.cards} className="mt-10 sm:grid-cols-2 lg:grid-cols-3" />
        </div>
      </section>
    );
  }

  if (section.image) {
    const imageFirst = index % 2 === 0;
    return (
      <section className={`w-full ${tint} px-4 py-14 sm:px-8 sm:py-20 lg:px-12`}>
        <div
          className={`mx-auto flex max-w-[1240px] flex-col items-center gap-10 lg:gap-16 ${
            imageFirst ? 'lg:flex-row' : 'lg:flex-row-reverse'
          }`}
        >
          <Reveal from={imageFirst ? 'left' : 'right'} className="w-full lg:w-[46%]">
            <SectionImage image={section.image} />
          </Reveal>
          <Reveal from={imageFirst ? 'right' : 'left'} delay={0.15} className="w-full lg:w-[54%]">
            <SectionContent section={section} />
          </Reveal>
        </div>
      </section>
    );
  }

  if (section.kind === 'steps') {
    return (
      <section className={`w-full ${tint} px-4 py-14 sm:px-8 sm:py-20 lg:px-12`}>
        <FadeInSection className="mx-auto max-w-[1143px]">
          <div className="rounded-[32px] bg-white px-6 py-10 shadow-[0_4px_24px_rgba(0,0,0,0.05)] sm:px-12 sm:py-12">
            <SectionContent section={section} />
          </div>
        </FadeInSection>
      </section>
    );
  }

  return (
    <section className={`w-full ${tint} px-4 py-14 sm:px-8 sm:py-20 lg:px-12`}>
      <FadeInSection className="mx-auto max-w-[1143px]">
        <SectionContent section={section} />
      </FadeInSection>
    </section>
  );
}

/**
 * A specialty landing page, built to the same pattern as the other service
 * pages — full-screen parallax hero, Bricolage Grotesque type, rounded cards,
 * sections that ease in as they scroll into view. Every word is server-rendered,
 * so it is all in the static HTML for crawlers and answer engines.
 */
export default async function SpecialtyPage({ specialty: s }: { specialty: Specialty }) {
  const doctors = await getDoctorsForBuild();
  const languages = languagesSpoken(doctors);
  const url = `${siteConfig.url}/${s.slug}/`;
  const phoneHref = `tel:${siteConfig.contact.phone.replace(/\s/g, '')}`;

  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': `${url}#webpage`,
      url,
      name: `${s.metaTitle} | Hope Trust`,
      description: s.metaDescription,
      inLanguage: 'en-IN',
      isPartOf: { '@id': `${siteConfig.url}/#website` },
      about: s.about ?? { '@id': `${url}#service` },
      publisher: { '@id': `${siteConfig.url}/#organization` },
      primaryImageOfPage: { '@type': 'ImageObject', url: `${siteConfig.url}${s.heroImage.src}` },
    },
    {
      ...getServiceSchema({
        name: s.name,
        description: s.metaDescription,
        url,
        serviceType: s.serviceType,
      }),
      '@id': `${url}#service`,
    },
    getFAQSchema(s.faqs),
    getBreadcrumbSchema([
      { name: 'Home', url: `${siteConfig.url}/` },
      { name: 'Mental Health', url: `${siteConfig.url}/mental-health/` },
      { name: s.name, url },
    ]),
  ];

  return (
    <>
      <JsonLd data={schema} />
      <Header />

      <main className="min-h-screen bg-white">
        <SpecialtyHero title={s.heroTitle} tags={s.heroTags} image={s.heroImage} />

        {/* The answer-first summary, in the intro card of the other service pages */}
        <section className="w-full bg-[#F7F6F4] px-4 py-14 sm:px-8 sm:py-20 lg:px-12">
          <FadeInSection className="mx-auto max-w-[1240px]">
            <div className="rounded-[32px] bg-white px-6 py-10 text-center shadow-[0_4px_24px_rgba(0,0,0,0.04)] sm:rounded-[59px] sm:px-12 lg:px-[100px] lg:py-14">
              <p className={`${mediumFont.className} text-sm uppercase tracking-[0.16em] text-[#ED7428]`}>
                {s.eyebrow}
              </p>
              <p className={`${mediumFont.className} mt-4 text-base leading-relaxed text-[#1a1a1a] sm:text-lg lg:text-xl lg:leading-[34px]`}>
                {s.lede}
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link
                  href="/book-your-session/"
                  className="inline-flex items-center justify-center rounded-full bg-[#ED7428] px-8 py-3 text-sm font-semibold text-white shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#d4631f] hover:shadow-lg active:scale-95 sm:text-base"
                >
                  Find a therapist
                </Link>
                <a
                  href={phoneHref}
                  className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-[#00373E] px-8 py-3 text-sm font-semibold text-[#00373E] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#00373E] hover:text-white sm:text-base"
                >
                  <Phone className="h-4 w-4" aria-hidden="true" />
                  Call {siteConfig.contact.phone}
                </a>
              </div>
            </div>
          </FadeInSection>
        </section>

        <div className="w-full bg-[#F7F6F4]">
          <ScrollingTextBanner />
        </div>

        {s.sections.map((section, i) => (
          <SectionBlock key={section.heading} section={section} index={i} />
        ))}

        {/* Practical details — the facts people check before they book */}
        <section className="w-full bg-[#F7F6F4] px-4 pt-14 sm:px-8 sm:pt-20 lg:px-12">
          <FadeInSection className="mx-auto max-w-[1240px]">
            <div className="grid gap-5 rounded-[28px] bg-[#00373E] p-7 text-white sm:grid-cols-2 sm:rounded-[40px] sm:p-10 lg:grid-cols-4">
              <p className={`${bodyFont.className} flex items-start gap-3 text-sm leading-relaxed sm:text-base`}>
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#ED7428]" aria-hidden="true" />
                <span>
                  <span className={`${headingFont.className} block text-white`}>In person</span>
                  Banjara Hills, Hyderabad.{' '}
                  <a href={siteConfig.contact.address.mapsUrl} className="underline underline-offset-2 hover:text-[#FFD2B5]">
                    Directions
                  </a>
                </span>
              </p>
              <p className={`${bodyFont.className} flex items-start gap-3 text-sm leading-relaxed sm:text-base`}>
                <Video className="mt-0.5 h-5 w-5 shrink-0 text-[#ED7428]" aria-hidden="true" />
                <span>
                  <span className={`${headingFont.className} block text-white`}>Online</span>
                  Private video sessions, link sent by email or WhatsApp.
                </span>
              </p>
              <p className={`${bodyFont.className} flex items-start gap-3 text-sm leading-relaxed sm:text-base`}>
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-[#ED7428]" aria-hidden="true" />
                <span>
                  <span className={`${headingFont.className} block text-white`}>Hours</span>
                  {siteConfig.hours.displayDays}, {siteConfig.hours.display}. By appointment.
                </span>
              </p>
              {languages.length > 0 && (
                <p className={`${bodyFont.className} flex items-start gap-3 text-sm leading-relaxed sm:text-base`}>
                  <Languages className="mt-0.5 h-5 w-5 shrink-0 text-[#ED7428]" aria-hidden="true" />
                  <span>
                    <span className={`${headingFont.className} block text-white`}>Languages</span>
                    {languages.join(', ')}.
                  </span>
                </p>
              )}
            </div>
          </FadeInSection>
        </section>

        {/* Closing call to action, as on /mental-health/ */}
        <section className="w-full bg-[#F7F6F4] px-4 py-14 sm:px-8 sm:py-16 lg:px-12">
          <FadeInSection className="mx-auto max-w-[1170px]">
            <div className="flex flex-col items-center gap-4 rounded-[28px] bg-white px-6 py-10 text-center shadow-[0_24px_60px_rgba(0,0,0,0.04)] sm:rounded-[40px] sm:px-10 sm:py-14">
              <h2 className={`${headingFont.className} text-xl text-[#00373E] sm:text-2xl lg:text-[32px]`}>
                {s.cta.heading}
              </h2>
              <p className={`${bodyFont.className} max-w-2xl text-base text-[#00373E] sm:text-lg`}>{s.cta.body}</p>
              <Link
                href="/book-your-session/"
                className="mt-2 inline-flex items-center justify-center rounded-full bg-[#ED7428] px-8 py-3 text-sm font-semibold text-white shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#d4631f] hover:shadow-lg active:scale-95 sm:text-base"
              >
                Book a session
              </Link>
            </div>
          </FadeInSection>
        </section>

        <FaqSection items={s.faqs} />

        <section className="w-full bg-white px-4 py-12 sm:px-8 lg:px-12">
          <nav aria-label="Related services" className="mx-auto max-w-[900px] text-center">
            <h2 className={`${headingFont.className} text-xl text-[#00373E] sm:text-2xl`}>Related services</h2>
            <ul className="mt-5 flex flex-wrap justify-center gap-2 sm:gap-3">
              {s.related.map((r) => (
                <li key={r.href}>
                  <Link
                    href={r.href}
                    className={`${mediumFont.className} inline-block rounded-full border border-[#00373E]/15 px-5 py-2 text-sm text-[#00373E] transition-colors hover:border-[#ED7428] hover:text-[#ED7428] sm:text-base`}
                  >
                    {r.label}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mx-auto mt-8 max-w-2xl text-xs leading-relaxed text-gray-500">
              This page is general information, not a substitute for individual clinical assessment.
              If you or someone else is in immediate danger, contact local emergency services (112 in
              India). Images are illustrative.
            </p>
          </nav>
        </section>
      </main>
      <Footer />
    </>
  );
}
