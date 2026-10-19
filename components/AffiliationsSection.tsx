"use client";

import { Bricolage_Grotesque } from "next/font/google";

const headingFont = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600"],
});

const logos = [
  '/images/affiliations/affiliation-1.webp',
  '/images/affiliations/affiliation-2.webp',
  '/images/affiliations/affiliation-3.webp',
  '/images/affiliations/affiliation-4.webp',
  '/images/affiliations/affiliation-5.webp',
  '/images/affiliations/affiliation-6.webp',
  '/images/affiliations/affiliation-7.webp',
  '/images/affiliations/affiliation-8.webp',
  '/images/affiliations/affiliation-9.webp',
];

export default function AffiliationsSection() {
  return (
    <section className="w-full py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mx-auto w-full max-w-[1440px] min-h-[280px] sm:min-h-[350px] lg:h-[454px] rounded-[28px] sm:rounded-[40px] lg:rounded-[54px] bg-white py-10 sm:py-14 px-6 sm:px-10 shadow-[0_18px_40px_rgba(0,0,0,0.06)] overflow-hidden flex flex-col justify-center">
          <h2
            className={`${headingFont.className} mb-8 sm:mb-10 text-center text-2xl sm:text-3xl lg:text-4xl font-semibold italic text-[#00373E]`}
          >
            Affiliations
          </h2>

          {/* Auto-scrolling logo carousel */}
          <div className="relative overflow-hidden">
            <div className="flex animate-marquee-logos whitespace-nowrap">
              {/* First set */}
              {logos.map((src, i) => (
                <div
                  key={`a-${i}`}
                  className="mx-6 sm:mx-8 flex shrink-0 items-center justify-center"
                >
                  {/* loading="lazy" also stops React hoisting these
                      below-the-fold logos into <link rel="preload">, where they
                      competed for bandwidth with the LCP element. */}
                  <img
                    src={src}
                    alt={`Affiliation logo ${i + 1}`}
                    loading="lazy"
                    decoding="async"
                    className="h-14 sm:h-20 w-auto object-contain"
                  />
                </div>
              ))}
              {/* Duplicate set for seamless loop */}
              {logos.map((src, i) => (
                <div
                  key={`b-${i}`}
                  className="mx-6 sm:mx-8 flex shrink-0 items-center justify-center"
                >
                  {/* Visual duplicate for the marquee loop — hidden from
                      assistive tech and search engines to avoid repeating it. */}
                  <img
                    src={src}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    decoding="async"
                    className="h-14 sm:h-20 w-auto object-contain"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
