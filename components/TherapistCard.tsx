'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bricolage_Grotesque } from 'next/font/google';
import type { Doctor } from '@/lib/doctors';

const cardFont = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const CalendarIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    className="h-4 w-4 fill-none stroke-current stroke-2"
  >
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const PhoneIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    className="h-4 w-4 fill-none stroke-current stroke-2"
  >
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

/**
 * Practitioners whose only route to an appointment is a phone call carry a
 * `tel:` URL in `booking_url`. Dialling is not "booking a session", and a
 * `tel:` href opened with target="_blank" strands an empty tab on desktop —
 * so both the label and the link behaviour switch.
 */
const BookSessionButton = ({ bookingUrl }: { bookingUrl: string }) => {
  const isPhone = bookingUrl.startsWith('tel:');

  return (
    <a
      href={bookingUrl}
      {...(isPhone ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
      className="mt-auto flex w-full items-center justify-center gap-2 rounded-full bg-[#00373E] px-5 py-2.5 text-xs font-semibold text-white shadow-md transition-all duration-300 hover:bg-[#025a66] hover:shadow-lg active:scale-[0.97] sm:px-6 sm:py-3 sm:text-sm"
    >
      {isPhone ? <PhoneIcon /> : <CalendarIcon />}
      {isPhone ? 'Call to Book' : 'Book Session'}
    </a>
  );
};

function FormattedBio({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (trimmed === '') return <div key={i} className="h-1.5" />;
        if (trimmed.startsWith('•')) {
          return (
            <div key={i} className="flex items-start gap-2 pl-0.5">
              <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#ED7428]" />
              <span className="text-xs leading-relaxed text-gray-600 sm:text-[13px]">
                {trimmed.slice(1).trim()}
              </span>
            </div>
          );
        }
        if (trimmed.endsWith(':')) {
          return (
            <p key={i} className="mt-2 text-xs font-semibold text-[#00373E] first:mt-0 sm:text-[13px]">
              {trimmed}
            </p>
          );
        }
        return (
          <p key={i} className="text-xs leading-relaxed text-gray-600 sm:text-[13px]">
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}

export default function TherapistCard({ doctor }: { doctor: Doctor }) {
  const [flipped, setFlipped] = useState(false);

  const initials = doctor.name
    .replace(/^(Mrs?\.|Ms\.|Dr\.?)\s*/i, '')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const introBio = doctor.bio.split('\n\n')[0];
  const truncatedBio =
    introBio.length > 100 ? introBio.slice(0, 100) + '...' : introBio;

  return (
    <div
      className={`${cardFont.className} group h-full`}
      style={{ perspective: '1200px' }}
    >
      {/* Flip container — fills parent height */}
      <div
        className="relative h-full w-full transition-transform duration-700 ease-in-out"
        style={{
          transformStyle: 'preserve-3d',
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* ===== FRONT ===== */}
        <div
          className="relative h-full flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-shadow duration-300 hover:shadow-xl"
          style={{ backfaceVisibility: 'hidden' }}
        >
          {/* Image area — 4:3 on mobile for compact cards, square on sm+ */}
          {doctor.photo ? (
            <div className="relative aspect-[4/3] sm:aspect-square w-full shrink-0 overflow-hidden bg-gray-100">
              <img
                src={doctor.photo}
                alt={doctor.name}
                className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
            </div>
          ) : (
            <div className="relative flex aspect-[4/3] sm:aspect-square w-full shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-[#00373E] via-[#025a66] to-[#00373E]">
              <span className="text-4xl font-bold text-white/90 sm:text-5xl lg:text-6xl">
                {initials}
              </span>
              <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#002a30] to-transparent" />
              <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[#ED7428]/10" />
              <div className="absolute -bottom-4 -left-4 h-24 w-24 rounded-full bg-[#ED7428]/10" />
            </div>
          )}

          {/* Content */}
          <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-5 lg:p-6">
            {/* Linked so each profile page is reachable by crawlers from the
                directory. Styling is unchanged from the plain heading. */}
            <h3 className="text-base font-bold leading-tight text-[#00373E] sm:text-lg lg:text-xl">
              <Link href={`/therapists/${doctor.slug}/`} className="hover:underline">
                {doctor.name}
              </Link>
            </h3>
            <p className="mt-1 text-xs font-medium text-[#ED7428] sm:text-sm">
              {doctor.qualification}
            </p>
            <span className="mt-1.5 inline-block w-fit rounded-full bg-[#00373E]/10 px-2.5 py-0.5 text-[10px] font-medium text-[#00373E] sm:mt-2 sm:px-3 sm:py-1 sm:text-xs">
              {doctor.department}
            </span>

            <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-gray-600 sm:mt-3 sm:text-[13px] lg:text-sm">
              {truncatedBio}
            </p>
            {doctor.bio.length > 100 && (
              <button
                onClick={() => setFlipped(true)}
                className="mt-1 text-xs font-semibold text-[#ED7428] hover:underline sm:text-[13px]"
              >
                Read more
              </button>
            )}

            <div className="min-h-3 flex-1" />
            <BookSessionButton bookingUrl={doctor.bookingUrl} />
          </div>
        </div>

        {/* ===== BACK ===== */}
        <div
          className="absolute inset-0 flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl"
          style={{
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        >
          {/* Teal header strip */}
          <div className="shrink-0 bg-[#00373E] px-4 py-4 sm:px-5 sm:py-5 lg:px-6">
            <h3 className="text-base font-bold leading-tight text-white sm:text-lg lg:text-xl">
              {doctor.name}
            </h3>
            <p className="mt-1 text-xs font-medium text-[#ED7428] sm:text-sm">
              {doctor.qualification}
            </p>
            <span className="mt-1.5 inline-block w-fit rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-medium text-white sm:mt-2 sm:px-3 sm:py-1 sm:text-xs">
              {doctor.department}
            </span>
          </div>

          {/* Full bio — scrollable */}
          <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-5 lg:p-6">
            <div className="flex-1 min-h-0 overflow-y-scroll pr-1 therapist-bio-scroll">
              <FormattedBio text={doctor.bio} />
            </div>

            <div className="mt-3 flex shrink-0 flex-col gap-2 sm:mt-4 sm:gap-2.5">
              <button
                onClick={() => setFlipped(false)}
                className="flex w-full items-center justify-center gap-2 rounded-full border-2 border-[#00373E] px-5 py-2 text-xs font-semibold text-[#00373E] transition-all duration-300 hover:bg-[#00373E]/5 sm:px-6 sm:py-2.5 sm:text-sm"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5 fill-none stroke-current stroke-2 sm:h-4 sm:w-4"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                Back
              </button>
              <Link
                href={`/therapists/${doctor.slug}/`}
                className="text-center text-xs font-semibold text-[#ED7428] hover:underline sm:text-sm"
              >
                View full profile
              </Link>
              <BookSessionButton bookingUrl={doctor.bookingUrl} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
