"use client";

import type React from 'react';
import { Bricolage_Grotesque } from 'next/font/google';
import VariableProximity from './VariableProximity';
import { useScrollAnimation, fadeInUp } from '@/hooks/useScrollAnimation';
import { useRef } from 'react';
import { getAssetUrl } from '@/lib/assets';
import LazyVideo from './LazyVideo';

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['600', '700'],
});

const BackgroundCirclesSection = () => {
  // Animate this section only when it scrolls into view
  const { elementRef: textRef, isVisible: textVisible } = useScrollAnimation({
    threshold: 0.25,
  });
  const { elementRef: cardRef, isVisible: cardVisible } = useScrollAnimation({
    threshold: 0.25,
  });

  const headingContainerRef = useRef<HTMLDivElement | null>(null);

  return (
    <section
      className="relative w-full overflow-hidden"
      style={{ minHeight: "100vh" }}
    >

      {/* Content area */}
      <div className="relative z-10 flex h-full items-start justify-center px-4 sm:px-8 lg:px-16 pt-28 pb-16">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 lg:flex-row lg:items-center lg:gap-16">
          {/* Left column: text + button */}
          <div
            ref={textRef as React.RefObject<HTMLDivElement>}
            className="w-full lg:w-1/2 text-left"
            style={fadeInUp(textVisible, 0)}
          >
            <div ref={headingContainerRef} className="relative inline-block">
              {/* Top small stats */}
              <div
                className={`${bricolage.className} mt-4 sm:mt-[30px] max-w-[330px]`}
              >
                <div className="text-lg sm:text-xl md:text-[26.47px] leading-snug sm:leading-[35.59px] font-semibold text-[#ED7428]">
                  20+ years of experience
                </div>

                <div className="text-lg sm:text-xl md:text-[26.47px] leading-snug sm:leading-[35.59px] font-semibold text-[#ED7428]">
                  15+ licensed experts
                </div>

                <div className="mt-2 h-[5px] w-48 sm:w-[275px] bg-[#ED7428]" />
              </div>

              <div className="mt-4 sm:mt-6">
                <VariableProximity
                  label="We help you prioritise your mental health"
                  fromFontVariationSettings="'GRAD' 0, 'opsz' 14"
                  toFontVariationSettings="'GRAD' 100, 'opsz' 40"
                  containerRef={headingContainerRef}
                  radius={120}
                  falloff="linear"
                  className={`${bricolage.className} mt-4 font-semibold text-[#00373E] text-balance text-3xl sm:text-4xl md:text-[48px] md:leading-[60px]`}
                  style={{
                    maxWidth: "483px",
                    flexShrink: 0,
                  }}
                />
              </div>
            </div>

            {/* The first paragraph on the page says what Hope Trust is. Google
                builds its result snippet from page text when it prefers that to
                the meta description, and before this the only sentences it could
                use were patient testimonials about individual therapists. */}
            <p
              className={`${bricolage.className} mt-4 sm:mt-6 text-[#00373E] text-base sm:text-lg md:text-2xl leading-relaxed sm:leading-9 font-bold max-w-[511px]`}
            >
              Hope Trust is a mental health and de-addiction centre in Banjara
              Hills, Hyderabad, offering therapy, psychiatry and addiction care
              since 2002, in person and online.
            </p>

            <a
              href="/book-your-session/"
              className="mt-10 inline-flex items-center justify-center rounded-full bg-[#00373E] px-8 sm:px-10 py-3 text-sm sm:text-base font-semibold text-white shadow-md transition-all duration-200 hover:bg-[#ea6a0e] hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:scale-[0.97]"
            >
              Find A Therapist
            </a>
          </div>

          {/* Right column: illustration on top of blue circle with tilted card effect */}
          <div
            ref={cardRef as React.RefObject<HTMLDivElement>}
            className="w-full lg:w-1/2 flex justify-center lg:justify-end"
            style={fadeInUp(cardVisible, 150)}
          >
            <div className="relative w-full max-w-[479px] aspect-[479/491] rounded-[52px] bg-[#F97316] shadow-[0_24px_60px_rgba(0,0,0,0.2)] overflow-hidden">
              <LazyVideo
                className="h-full w-full object-cover"
                src={getAssetUrl('landing page.mp4')}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default BackgroundCirclesSection;


