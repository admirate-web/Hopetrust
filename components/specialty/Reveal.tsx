'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';

/**
 * Slides content in as it scrolls into view — the same motion as `fadeFrom`
 * on /addiction/ and /mental-health/, as a component so server-rendered
 * sections can use it. The content is in the HTML from the start; only its
 * entrance is animated. Visitors who ask for reduced motion see it in place.
 */
export default function Reveal({
  children,
  from = 'up',
  delay = 0,
  className,
}: {
  children: ReactNode;
  from?: 'left' | 'right' | 'up';
  /** Seconds. */
  delay?: number;
  className?: string;
}) {
  const still = useReducedMotion();

  return (
    <motion.div
      initial={
        still
          ? false
          : {
              opacity: 0,
              x: from === 'left' ? -60 : from === 'right' ? 60 : 0,
              y: from === 'up' ? 40 : 0,
            }
      }
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1], delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
