'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { ChevronDown } from 'lucide-react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import type { SpecialtyImage } from '@/lib/specialties';

/**
 * The full-screen hero the other service pages use (/mental-health/,
 * /addiction/): a parallax background, a dark overlay, and a capitalised
 * display heading with short topic tags beneath it.
 */
export default function SpecialtyHero({
  title,
  tags,
  image,
}: {
  title: string;
  tags: string[];
  image: SpecialtyImage;
}) {
  const heroRef = useRef<HTMLElement | null>(null);
  const still = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const backgroundY = useTransform(scrollYProgress, [0, 1], ['0%', still ? '0%' : '20%']);
  const textY = useTransform(scrollYProgress, [0, 1], ['0%', still ? '0%' : '-30%']);

  return (
    <section ref={heroRef} className="relative h-screen w-full overflow-hidden">
      {/* Background image with parallax */}
      <motion.div style={{ y: backgroundY }} className="absolute inset-0 h-[120%] w-full">
        <Image src={image.src} alt={image.alt} fill priority sizes="100vw" className="object-cover" />
      </motion.div>

      {/* Dark overlay for readability. Written as an arbitrary value because
          this project's Tailwind (3.3) has no `/65` step — `bg-black/65`, as
          used on the older service pages, compiles to nothing. Those pages get
          away with it because their hero images are already dark; these AI
          images are bright, so the overlay has to actually render. */}
      <div className="absolute inset-0 bg-black/[0.58]" />

      {/* Centered content */}
      <motion.div
        style={{ y: textY }}
        initial={still ? false : { opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: [0.22, 0.61, 0.36, 1], delay: 0.2 }}
        className="relative z-10 flex h-full w-full flex-col items-center justify-center px-4 text-center text-white sm:px-6 lg:px-8"
      >
        <h1 className="text-3xl font-semibold uppercase tracking-[0.18em] sm:text-4xl md:text-5xl lg:text-7xl">
          {title}
        </h1>

        {tags.length > 0 && (
          <p className="mt-6 text-sm font-medium leading-tight text-white/90 sm:mt-8 sm:text-base md:text-lg lg:text-xl">
            {tags.map((tag, i) => (
              // Each tag stays whole when the line wraps on a phone.
              <span key={tag} className="whitespace-nowrap">
                {i > 0 && <span className="mx-1.5 text-white/60 sm:mx-3">|</span>}
                {tag}{' '}
              </span>
            ))}
          </p>
        )}
      </motion.div>

      {/* Scroll cue */}
      <motion.div
        aria-hidden="true"
        initial={still ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.6 }}
        className="absolute inset-x-0 bottom-8 z-10 flex justify-center"
      >
        <ChevronDown className="h-7 w-7 text-white/70 motion-safe:animate-bounce" />
      </motion.div>
    </section>
  );
}
