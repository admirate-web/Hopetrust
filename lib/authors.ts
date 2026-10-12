import type { Doctor } from '@/lib/doctors';
import { siteConfig } from '@/lib/config';
import { bioLanguages, bioSection, practitionerRole } from '@/lib/bio';

/**
 * Loaded on demand. `lib/doctors` constructs the Supabase client at module
 * scope, so importing it eagerly would drag a network client into every
 * consumer of the pure helpers below — including the schema builders that run
 * in tests and in components that already have their practitioner in hand.
 */
async function doctors(): Promise<Doctor[]> {
  const { getDoctorsForBuild } = await import('@/lib/doctors');
  return getDoctorsForBuild();
}

/**
 * Author and medical-reviewer identity for editorial content.
 *
 * Every named byline on this site resolves to a real practitioner in the
 * `doctors` table — there is no separate author list to drift out of sync, and
 * no way to credit a person who does not work here. A post that names nobody
 * falls back to the organisation, which is honest rather than flattering.
 *
 * The `@id` minted here is the single identifier for a practitioner-as-person
 * across the whole site: the profile page defines the node, blog posts point at
 * it from `author` and `reviewedBy`. Keeping one `@id` is what lets a search
 * engine or an answer engine join "who wrote this" to "what are their
 * credentials" instead of seeing two unrelated strings.
 */
export type Author = {
  slug: string;
  /** Display name, including the honorific stored in the doctors table. */
  name: string;
  /** Highest qualification, e.g. "MD Psychiatry", "MPhil Clinical Psychology". */
  credential: string;
  department: string;
  /** Professional title, e.g. "Clinical Psychologist". See `practitionerRole`. */
  role: string;
  /** The "Areas of Expertise" bullets from their bio. */
  expertise: string[];
  /** Languages they hold sessions in, from their bio. */
  languages: string[];
  url: string;
  /** Stable schema.org node identifier for this person. */
  id: string;
  photo?: string;
  /**
   * True only for registered medical practitioners. Psychologists and social
   * workers are clinicians but are not physicians, and marking them up as one
   * misstates their credentials on health content — the precise failure this
   * whole module exists to avoid.
   */
  isMedicalDoctor: boolean;
};

/** Qualifications that denote a registered medical practitioner. */
const MEDICAL_DOCTOR = /\b(MD|MBBS|DNB|DPM|MRCPsych)\b/;

/** Postgraduate qualifications, for `educationalLevel`. */
const POSTGRADUATE = /\b(MD|MA|MSc|MPhil|PhD|PGDP|DNB|DPM|MSW)\b/;

export function personId(slug: string): string {
  return `${siteConfig.url}/therapists/${slug}/#person`;
}

export function toAuthor(doctor: Doctor): Author {
  return {
    slug: doctor.slug,
    name: doctor.name,
    credential: doctor.qualification,
    department: doctor.department,
    role: practitionerRole(doctor),
    expertise: bioSection(doctor.bio, /expertise/i),
    languages: bioLanguages(doctor.bio),
    url: `${siteConfig.url}/therapists/${doctor.slug}/`,
    id: personId(doctor.slug),
    photo: doctor.photo,
    isMedicalDoctor: MEDICAL_DOCTOR.test(doctor.qualification),
  };
}

/**
 * Resolve a practitioner slug from blog frontmatter.
 *
 * Returns null for an unknown slug rather than throwing: a typo in one post's
 * frontmatter should degrade that byline to the organisation, not fail the
 * build for all 395.
 */
export async function getAuthorBySlug(
  slug: string | undefined
): Promise<Author | null> {
  if (!slug) return null;
  const doctor = (await doctors()).find((d) => d.slug === slug);
  return doctor ? toAuthor(doctor) : null;
}

/** Resolve several slugs in one pass over the doctors list. */
export async function getAuthorsBySlug(
  slugs: (string | undefined)[]
): Promise<(Author | null)[]> {
  const all = await doctors();
  return slugs.map((slug) => {
    if (!slug) return null;
    const doctor = all.find((d) => d.slug === slug);
    return doctor ? toAuthor(doctor) : null;
  });
}

/** `name`, with the honorific stripped — for prose like "reviewed by X". */
export function bareName(name: string): string {
  return name.replace(/^(Mrs?\.?|Ms\.?|Prof\.?)\s+/i, '');
}

/** "Dr. K. Aparna, MD Psychiatry" — the form used in visible bylines. */
export function withCredential(author: Author): string {
  return `${author.name}, ${author.credential}`;
}

/**
 * schema.org credential node. `educationalLevel` is what lets an answer engine
 * distinguish a postgraduate clinical qualification from a weekend certificate.
 */
export function credentialSchema(credential: string) {
  return {
    '@type': 'EducationalOccupationalCredential',
    credentialCategory: 'degree',
    name: credential,
    ...(POSTGRADUATE.test(credential) && {
      educationalLevel: 'Postgraduate',
    }),
  };
}

/**
 * The `Person` node for a practitioner. Defined once on their profile page;
 * everywhere else references it by `@id`.
 */
export function personSchema(author: Author, opts: { description?: string; bookingUrl?: string } = {}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': author.id,
    url: author.url,
    name: author.name,
    ...(opts.description && { description: opts.description }),
    jobTitle: author.role,
    hasCredential: credentialSchema(author.credential),
    // The practitioner's own expertise list is what lets an answer engine match
    // "OCD specialist in Hyderabad" to a named clinician; the department alone
    // ("Psychology") says nothing it can match on.
    knowsAbout: author.expertise.length > 0 ? author.expertise : author.department,
    ...(author.languages.length > 0 && { knowsLanguage: author.languages }),
    worksFor: { '@id': `${siteConfig.url}/#organization` },
    affiliation: { '@id': `${siteConfig.url}/#organization` },
    ...(author.photo && { image: author.photo }),
    ...(opts.bookingUrl && {
      potentialAction: {
        '@type': 'ReserveAction',
        target: opts.bookingUrl,
        name: `Book a session with ${author.name}`,
      },
    }),
  };
}

/**
 * Byline for a post that names no practitioner. Points at the organisation
 * node so the article still has a resolvable, credentialed publisher.
 */
export function organizationAuthorRef() {
  return {
    '@type': 'Organization',
    '@id': `${siteConfig.url}/#organization`,
    name: 'Hope Trust',
  };
}
