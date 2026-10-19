'use client';

import * as React from 'react';
import { Bricolage_Grotesque } from 'next/font/google';

import { cn } from '@/lib/utils';

type TeamCategory = {
  value: 'therapists' | 'Social Work' | 'counsellors' | 'psychologists' | 'Psychiatry';
  label: string;
};

const headingFont = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['600'],
});

const categories: TeamCategory[] = [
  { value: 'psychologists', label: 'Psychologists.' },
  { value: 'Psychiatry', label: 'Psychiatry.' },
  { value: 'Social Work', label: 'Social Work.' },
];

export type OurTeamSectionProps = {
  className?: string;
  defaultValue?: TeamCategory['value'];
  autoRotateMs?: number;
  renderContent?: (value: TeamCategory['value']) => React.ReactNode;
};

export default function OurTeamSection({
  className,
  defaultValue = 'therapists',
  autoRotateMs = 1800,
  renderContent,
}: OurTeamSectionProps) {
  const categoryValues = React.useMemo(
    () => categories.map((category) => category.value),
    []
  );

  const [activeValue, setActiveValue] = React.useState<TeamCategory['value']>(
    defaultValue
  );

  React.useEffect(() => {
    if (!autoRotateMs || autoRotateMs <= 0) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    if (prefersReducedMotion) return;

    const intervalId = window.setInterval(() => {
      setActiveValue((prev) => {
        const currentIndex = categoryValues.indexOf(prev);
        const safeIndex = currentIndex >= 0 ? currentIndex : 0;
        const nextIndex = (safeIndex + 1) % categoryValues.length;
        return categoryValues[nextIndex];
      });
    }, autoRotateMs);

    return () => window.clearInterval(intervalId);
  }, [autoRotateMs, categoryValues]);

  return (
    <section className={cn('relative w-full overflow-hidden py-12 sm:py-16', className)}>
      {/* Background video */}
      <video
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
        preload="metadata"
        poster="/images/posters/gradient-background.webp"
      >
        <source src="/videos/gradient-background.mp4" type="video/mp4" />
      </video>

      {/* Content */}
      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 sm:px-8 lg:px-16">
        <div className="flex flex-col items-center gap-6 sm:gap-8">
          <h2
            className={cn(
              headingFont.className,
              'text-center text-[32px] font-semibold leading-none tracking-[0.724px] text-white sm:text-[48px]'
            )}
          >
            Our Team
          </h2>

          <div className="w-full">
            <div
              aria-label="Our Team categories"
              className="flex flex-wrap justify-center gap-8 sm:gap-12"
            >
              {categories.map((category) => {
                const isActive = category.value === activeValue;
                return (
                  <span
                    key={category.value}
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      headingFont.className,
                      "select-none text-center text-[18px] font-semibold leading-none tracking-[0.724px] transition-colors",
                      isActive ? "text-[#FFDF00]" : "text-white/60",
                      "sm:text-[22px]",
                    )}
                  >
                    {category.label}
                  </span>
                );
              })}
            </div>

            {renderContent ? (
              <div className="mt-0">{renderContent(activeValue)}</div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}


