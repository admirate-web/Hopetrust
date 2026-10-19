"use client";

import type React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Bricolage_Grotesque } from "next/font/google";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { InteractiveHoverButton } from "@/components/InteractiveHoverButton";

const headingFont = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const resourceCards = [
  {
    titleLine1: "Articles &",
    titleLine2: "Guides",
    description:
      "Practical tips on stress management, mindfulness, and emotional resilience.",
    accentClass: "bg-[#F9B93F]",
  },
  {
    titleLine1: "Meditation &",
    titleLine2: "Relaxation",
    description:
      "Audio sessions for guided meditation and deep breathing exercises.",
    accentClass: "bg-[#1AB38F]",
  },
  {
    titleLine1: "Webinars &",
    titleLine2: "Workshops",
    description:
      "Live and recorded sessions with mental health professionals.",
    accentClass: "bg-[#F48AA8]",
  },
];

export default function ResourcesSection() {
  const { elementRef, isVisible } = useScrollAnimation({
    threshold: 0.2,
  });

  return (
    <section className="w-full bg-[#F7F5EF] py-20">
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 text-center relative">
        {/* Decorative orange icon behind heading */}
        <div className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 z-0">
          <img
            src="/images/home/resources-icon.webp"
            alt=""
            className="h-56 w-56 sm:h-72 sm:w-72 object-contain opacity-90"
          />
        </div>

        {/* Label */}
        <p
          className={`${headingFont.className} relative z-10 mt-10 text-center`}
          style={{
            color: "#00373E",
            fontSize: "14px",
            fontWeight: 500,
            lineHeight: "21px",
            letterSpacing: "0.7px",
          }}
        >
          EXPLORE & LEARN
        </p>

        {/* Heading */}
        <h2
          className={`${headingFont.className} mt-3 text-center text-3xl sm:text-4xl lg:text-[52px] leading-tight sm:leading-snug lg:leading-[65px] font-bold text-[#00373E]`}
        >
          Resources for your well-being
        </h2>

        {/* Subtext */}
        <p
          className={`${headingFont.className} mt-4 mx-auto max-w-[90%] sm:max-w-2xl text-center text-[18px] sm:text-[20px] lg:text-[22px] leading-[34px] tracking-[0.5px] font-normal text-[#486364]`}
        >
          Explore expert insights, self-care guides, and tools to support your
          mental health.
        </p>

        {/* Cards */}
        <div
          ref={elementRef as React.RefObject<HTMLDivElement>}
          className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3"
        >
          {resourceCards.map((card, index) => (
            <motion.div
              key={card.titleLine1}
              initial={{ opacity: 0, y: 24 }}
              animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
              transition={{
                duration: 0.5,
                ease: [0.22, 0.61, 0.36, 1],
                delay: index * 0.15,
              }}
              className="mx-auto flex min-h-[320px] sm:min-h-[360px] lg:h-[404px] w-full max-w-[344px] flex-col items-center justify-between rounded-[32px] sm:rounded-[44px] lg:rounded-[59px] bg-white px-6 sm:px-8 py-8 sm:py-10 lg:py-12 shadow-[0_18px_40px_rgba(0,0,0,0.06)]"
            >
              <div className="space-y-3 text-[#00373E]">
                <h3
                  className={`${headingFont.className} text-2xl sm:text-3xl lg:text-[38px] leading-tight sm:leading-snug lg:leading-[45px] font-semibold text-center text-[#00373E]`}
                >
                  {card.titleLine1}
                  <br />
                  {card.titleLine2}
                </h3>
                <p
                  className={`${headingFont.className} text-sm sm:text-base lg:text-lg leading-relaxed sm:leading-[29.25px] font-normal text-center text-[#00373E] max-w-[225px] mx-auto`}
                >
                  {card.description}
                </p>
              </div>

              <div className="mt-8">
                <Link href="/blogs/">
                  <InteractiveHoverButton
                    text="Explore"
                    accentClass={card.accentClass}
                    className="w-28 border-none bg-white text-xs sm:text-sm font-semibold text-[#00373E]"
                  />
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}


