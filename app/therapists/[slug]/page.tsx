import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Calendar, MapPin, Phone } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { serializeJsonLd } from '@/components/JsonLd';
import { getDoctorsForBuild, getDoctorBySlug, bioIntro, type Doctor } from '@/lib/doctors';
import { toAuthor, personSchema } from '@/lib/authors';
import { getPostsByAuthorSlug, getPostsReviewedBy } from '@/lib/blog';
import { siteConfig } from '@/lib/config';

export async function generateStaticParams() {
  const doctors = await getDoctorsForBuild();
  return doctors.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doctor = await getDoctorBySlug(slug);
  if (!doctor) return { title: 'Therapist Not Found' };

  const title = `${doctor.name} — ${doctor.qualification}`;
  const description = bioIntro(
    doctor.bio,
    150
  ) || `${doctor.name}, ${doctor.qualification}, ${doctor.department} at Hope Trust, Hyderabad.`;

  return {
    title,
    description,
    keywords: [
      doctor.name,
      doctor.qualification,
      doctor.department,
      `${doctor.department} Hyderabad`,
      'therapist Hyderabad',
      'Hope Trust',
    ].join(', '),
    alternates: {
      canonical: `/therapists/${doctor.slug}/`,
    },
    openGraph: {
      title,
      description,
      type: 'profile',
      url: `${siteConfig.url}/therapists/${doctor.slug}/`,
      siteName: 'Hope Trust',
      images: doctor.photo ? [{ url: doctor.photo, alt: doctor.name }] : [],
    },
  };
}

/**
 * schema.org MedicalSpecialty is an enumeration, so only map departments that
 * have a real match. Everything else is expressed through `knowsAbout`, which
 * accepts free text.
 */
const SPECIALTY_ENUM: Record<string, string> = {
  Psychiatry: 'https://schema.org/Psychiatric',
};

/**
 * Two nodes, deliberately.
 *
 * The `Person` node carries the human and their credentials, and is the thing
 * articles point at from `author` / `reviewedBy`. `Physician` in schema.org is
 * a `MedicalOrganization`, not a `Person` — it describes a practice, so it is
 * emitted only for registered medical practitioners. Everyone here is a
 * clinician, but a psychologist marked up as a physician overstates their
 * credentials, which on health content is the exact signal we are trying to
 * get right.
 */
/**
 * Practitioners who take appointments only by phone carry a `tel:` URL in
 * `booking_url` rather than a link into the scheduling app.
 */
function isPhoneBooking(bookingUrl: string): boolean {
  return bookingUrl.startsWith('tel:');
}

function buildSchema(doctor: Doctor) {
  const url = `${siteConfig.url}/therapists/${doctor.slug}/`;
  const specialty = SPECIALTY_ENUM[doctor.department];
  const author = toAuthor(doctor);
  // ReserveAction describes a booking endpoint an agent can follow. A phone
  // number is not one, so it is published as `telephone` instead of dressed up
  // as a reservation target.
  const byPhone = isPhoneBooking(doctor.bookingUrl);

  return [
    personSchema(author, {
      description: bioIntro(doctor.bio, 300),
      ...(byPhone ? {} : { bookingUrl: doctor.bookingUrl }),
    }),
    ...(author.isMedicalDoctor
      ? [
          {
            '@context': 'https://schema.org',
            '@type': 'Physician',
            '@id': `${url}#physician`,
            url,
            name: doctor.name,
            description: bioIntro(doctor.bio, 300),
            ...(specialty && { medicalSpecialty: specialty }),
            ...(doctor.photo && { image: doctor.photo }),
            telephone: siteConfig.contact.phone,
            address: {
              '@type': 'PostalAddress',
              streetAddress: siteConfig.contact.address.streetAddress,
              addressLocality: siteConfig.contact.address.locality,
              addressRegion: siteConfig.contact.address.region,
              postalCode: siteConfig.contact.address.postalCode,
              addressCountry: siteConfig.contact.address.country,
            },
            parentOrganization: { '@id': `${siteConfig.url}/#organization` },
            employee: { '@id': author.id },
            areaServed: { '@type': 'City', name: 'Hyderabad' },
            availableService: {
              '@type': 'MedicalTherapy',
              name: `${doctor.department} consultation`,
            },
            ...(byPhone
              ? {}
              : {
                  potentialAction: {
                    '@type': 'ReserveAction',
                    target: doctor.bookingUrl,
                    name: `Book a session with ${doctor.name}`,
                  },
                }),
          },
        ]
      : []),
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteConfig.url}/` },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Find Your Therapist',
          item: `${siteConfig.url}/book-your-session/`,
        },
        { '@type': 'ListItem', position: 3, name: doctor.name, item: url },
      ],
    },
  ];
}

/** Renders the bio's simple markup: bullet lines and "Heading:" lines. */
function FormattedBio({ text }: { text: string }) {
  return (
    <div className="space-y-1.5">
      {text.split('\n').map((line, i) => {
        const trimmed = line.trim();
        if (trimmed === '') return <div key={i} className="h-2" />;
        if (trimmed.startsWith('•')) {
          return (
            <div key={i} className="flex items-start gap-2.5">
              <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#ED7428]" />
              <span className="text-sm leading-relaxed text-gray-600 sm:text-base">
                {trimmed.slice(1).trim()}
              </span>
            </div>
          );
        }
        if (trimmed.endsWith(':')) {
          return (
            <h2
              key={i}
              className="mt-5 text-base font-semibold text-[#00373E] first:mt-0 sm:text-lg"
            >
              {trimmed.replace(/:$/, '')}
            </h2>
          );
        }
        return (
          <p key={i} className="text-sm leading-relaxed text-gray-600 sm:text-base">
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}

export default async function TherapistPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const doctor = await getDoctorBySlug(slug);
  if (!doctor) notFound();

  const byPhone = isPhoneBooking(doctor.bookingUrl);

  const written = getPostsByAuthorSlug(doctor.slug);
  const reviewed = getPostsReviewedBy(doctor.slug);

  const all = await getDoctorsForBuild();
  const related = all
    .filter((d) => d.department === doctor.department && d.slug !== doctor.slug)
    .slice(0, 3);

  const initials = doctor.name
    .replace(/^(Mrs?\.|Ms\.|Dr\.?)\s*/i, '')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildSchema(doctor)) }}
      />
      <Header />

      <main className="min-h-screen bg-[#F6EFE8] pt-20">
        <div className="mx-auto w-full max-w-[900px] px-4 py-10 sm:px-6 lg:px-8">
          <Link
            href="/book-your-session/"
            className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-[#ED7428] transition-colors hover:text-[#d4631f]"
          >
            <ArrowLeft className="h-4 w-4" />
            All therapists
          </Link>

          {/* Profile header */}
          <div className="overflow-hidden rounded-[28px] bg-white shadow-[0_16px_48px_rgba(0,0,0,0.06)]">
            <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:gap-8 sm:p-8 lg:p-10">
              {doctor.photo ? (
                <img
                  src={doctor.photo}
                  alt={doctor.name}
                  width={160}
                  height={160}
                  className="h-32 w-32 shrink-0 rounded-2xl object-cover object-top sm:h-40 sm:w-40"
                />
              ) : (
                <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#00373E] via-[#025a66] to-[#00373E] sm:h-40 sm:w-40">
                  <span className="text-4xl font-bold text-white/90">{initials}</span>
                </div>
              )}

              <div className="min-w-0">
                <h1 className="text-2xl font-bold leading-tight text-[#00373E] sm:text-3xl lg:text-4xl">
                  {doctor.name}
                </h1>
                <p className="mt-2 text-sm font-medium text-[#ED7428] sm:text-base">
                  {doctor.qualification}
                </p>
                <span className="mt-3 inline-block rounded-full bg-[#00373E]/10 px-3 py-1 text-xs font-medium text-[#00373E] sm:text-sm">
                  {doctor.department}
                </span>

                <a
                  href={doctor.bookingUrl}
                  {...(byPhone
                    ? {}
                    : { target: '_blank', rel: 'noopener noreferrer' })}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#00373E] px-6 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-[#025a66] hover:shadow-lg sm:w-fit"
                >
                  {byPhone ? (
                    <Phone className="h-4 w-4" />
                  ) : (
                    <Calendar className="h-4 w-4" />
                  )}
                  {byPhone ? 'Call to book' : 'Book a session'}
                </a>
              </div>
            </div>
          </div>

          {/* Bio */}
          <div className="mt-6 rounded-[28px] bg-white p-6 shadow-[0_16px_48px_rgba(0,0,0,0.04)] sm:mt-8 sm:p-8 lg:p-10">
            <FormattedBio text={doctor.bio} />
          </div>

          {/* Clinic details */}
          <div className="mt-6 rounded-[28px] bg-white p-6 shadow-[0_16px_48px_rgba(0,0,0,0.04)] sm:p-8">
            <h2 className="text-base font-semibold text-[#00373E] sm:text-lg">
              Where you&apos;ll be seen
            </h2>
            <div className="mt-4 space-y-3 text-sm text-gray-600 sm:text-base">
              <p className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#ED7428]" />
                <span>{siteConfig.contact.address.full}</span>
              </p>
              <p className="flex items-center gap-2.5">
                <Phone className="h-4 w-4 shrink-0 text-[#ED7428]" />
                <a href={`tel:${siteConfig.contact.phone.replace(/\s/g, '')}`} className="hover:underline">
                  {siteConfig.contact.phone}
                </a>
              </p>
              <p className="text-xs text-gray-500 sm:text-sm">
                Office hours {siteConfig.hours.display} ({siteConfig.hours.displayDays}).
                In-clinic and online sessions available.
              </p>
            </div>
          </div>

          {/* Published and reviewed work — what makes this an author page as
              well as a bio, and the return path from 395 articles back to the
              credentials behind them. */}
          {(written.length > 0 || reviewed.length > 0) && (
            <div className="mt-6 rounded-[28px] bg-white p-6 shadow-[0_16px_48px_rgba(0,0,0,0.04)] sm:p-8">
              {written.length > 0 && (
                <>
                  <h2 className="text-base font-semibold text-[#00373E] sm:text-lg">
                    Articles by {doctor.name}
                  </h2>
                  <ul className="mt-4 space-y-2.5">
                    {written.slice(0, 12).map((post) => (
                      <li key={post.slug}>
                        <Link
                          href={`/blogs/${post.slug}/`}
                          className="text-sm text-gray-700 underline-offset-2 transition-colors hover:text-[#ED7428] hover:underline sm:text-base"
                        >
                          {post.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {reviewed.length > 0 && (
                <>
                  <h2
                    className={`text-base font-semibold text-[#00373E] sm:text-lg ${
                      written.length > 0 ? 'mt-8 border-t border-gray-100 pt-6' : ''
                    }`}
                  >
                    Medically reviewed by {doctor.name}
                  </h2>
                  <ul className="mt-4 space-y-2.5">
                    {reviewed.slice(0, 12).map((post) => (
                      <li key={post.slug}>
                        <Link
                          href={`/blogs/${post.slug}/`}
                          className="text-sm text-gray-700 underline-offset-2 transition-colors hover:text-[#ED7428] hover:underline sm:text-base"
                        >
                          {post.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {/* Related practitioners */}
          {related.length > 0 && (
            <div className="mb-12 mt-6 rounded-[28px] bg-white p-6 shadow-[0_16px_48px_rgba(0,0,0,0.04)] sm:mb-16 sm:p-8">
              <h2 className="text-base font-semibold text-[#00373E] sm:text-lg">
                Others in {doctor.department}
              </h2>
              <div className="mt-4 flex flex-wrap gap-2 sm:gap-3">
                {related.map((d) => (
                  <Link
                    key={d.slug}
                    href={`/therapists/${d.slug}/`}
                    className="rounded-full border border-gray-200 px-4 py-2 text-xs font-medium text-[#00373E] transition-colors hover:border-[#ED7428] sm:text-sm"
                  >
                    {d.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
