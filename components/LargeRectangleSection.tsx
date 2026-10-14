"use client";

import type React from "react";
import Image from "next/image";
import { useRef, useState } from "react";
import { motion } from "motion/react";
import { Bricolage_Grotesque, Roboto_Flex } from "next/font/google";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { cn } from "@/lib/utils";
import VariableProximity from "./VariableProximity";
import { getAssetUrl } from '@/lib/assets';
import NewsletterForm from './NewsletterForm';

const robotoFlex = Roboto_Flex({
  subsets: ["latin"],
  axes: ["opsz", "GRAD"],
});

const bodyFont = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500","700"],
});

export default function LargeRectangleSection() {
  const headingContainerRef = useRef<HTMLDivElement | null>(null);
  const { elementRef, isVisible } = useScrollAnimation({
    threshold: 0.2,
  });
  const [isHovered, setIsHovered] = useState(false);

  return (
    <section className="w-full bg-[#F7F5EF] py-16 sm:py-20">
      <motion.div
        ref={elementRef as React.RefObject<HTMLDivElement>}
        initial={{ opacity: 0, y: 32 }}
        animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 32 }}
        transition={{
          duration: 0.7,
          ease: [0.22, 0.61, 0.36, 1],
        }}
        className="mx-4 sm:mx-6 lg:mx-auto w-auto lg:w-full max-w-[1244px] min-h-[400px] sm:min-h-[480px] lg:h-[587px] rounded-[28px] sm:rounded-[40px] lg:rounded-[59px] shadow-[0_24px_60px_rgba(0,0,0,0.06)] overflow-hidden relative"
      >
        {/* Background illustration */}
        <Image
          src={getAssetUrl("Group 22.png")}
          alt="Community background illustration"
          fill
          className="object-cover"
          priority={false}
        />

        {/* Color overlay that tints the whole card on hover */}
        <div
          className={cn(
            "absolute inset-0 bg-[#00373E] opacity-0 transition-opacity duration-500",
            isHovered && "opacity-100",
          )}
        />

        {/* Overlay content */}
        <div className="relative z-10 flex h-full w-full flex-col lg:flex-row items-start lg:items-center px-5 sm:px-10 lg:px-16 py-8 sm:py-10 lg:py-0 gap-6 lg:gap-12">
          {/* Left text content */}
          <div
            className={cn(
              "w-full lg:w-1/2 text-left space-y-6 transition-colors duration-500",
              isHovered ? "text-white" : "text-[#00373E]",
            )}
          >
            <p
              className={cn(
                bodyFont.className,
                "transition-colors duration-500 mt-3",
                isHovered ? "text-[#E0F2F2]" : "text-[#00373E]",
              )}
              style={{
                fontSize: "14px",
                lineHeight: "14px",
                fontWeight: 500,
                letterSpacing: "0.5px",
              }}
            >
              Newsletter
            </p>
            <div ref={headingContainerRef} className="relative inline-block">
              <VariableProximity
                label={"Regular insights to enhance your life experience!"}
                fromFontVariationSettings="'GRAD' 0, 'opsz' 14"
                toFontVariationSettings="'GRAD' 100, 'opsz' 40"
                containerRef={headingContainerRef}
                radius={120}
                falloff="linear"
                className={`${bodyFont.className} whitespace-pre-line text-2xl sm:text-3xl lg:text-4xl xl:text-[2.6rem] font-semibold leading-snug`}
                style={{
                  fontWeight: 700,
                }}
              />
            </div>
            <p
              className={cn(
                bodyFont.className,
                "transition-colors duration-500 text-sm sm:text-lg lg:text-[22px] leading-relaxed sm:leading-[34px] tracking-wide max-w-full lg:max-w-[476px]",
                isHovered ? "text-[#E5F4F4]" : "text-[#00373E]",
              )}
            >
              A monthly letter from our team, with ideas you can use between sessions.
            </p>
            <div
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              className="mt-2 max-w-full lg:max-w-[520px]"
            >
              <NewsletterForm variant="inline" dark={isHovered} />
            </div>
          </div>

          {/* Right side left empty so background image shows */}
          <div className="w-full lg:w-1/2" />
        </div>
      </motion.div>
    </section>
  );
}



