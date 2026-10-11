import { supabase } from '@/lib/supabase';
import snapshot from '@/data/doctors-snapshot.json';

export type Doctor = {
  id: string;
  slug: string;
  name: string;
  qualification: string;
  department: string;
  bio: string;
  bookingUrl: string;
  photo?: string;
  displayOrder: number;
};

type DoctorRow = {
  id: string;
  name: string;
  qualification: string;
  department: string;
  bio: string;
  booking_url: string;
  photo: string | null;
  display_order: number;
};

const DOCTOR_COLUMNS =
  'id, name, qualification, department, bio, booking_url, photo, display_order';

/**
 * URL slug for a practitioner, derived from their name.
 *
 * The `doctors` table has no slug column, so this is the single place that
 * decides profile URLs. Adding a `slug` column later and reading it here would
 * keep URLs stable across name edits — until then, renaming a practitioner
 * changes their URL and needs a redirect.
 */
export function doctorSlug(name: string): string {
  return name
    .replace(/^(Mrs?\.?|Ms\.?|Dr\.?|Prof\.?)\s+/i, '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Assign slugs, disambiguating any collisions deterministically. */
function withSlugs(rows: DoctorRow[]): Doctor[] {
  const seen = new Map<string, number>();

  return rows.map((row) => {
    const base = doctorSlug(row.name) || 'therapist';
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);

    return {
      id: row.id,
      slug: count === 0 ? base : `${base}-${count + 1}`,
      name: row.name,
      qualification: row.qualification,
      department: row.department,
      bio: row.bio,
      bookingUrl: row.booking_url,
      photo: row.photo ?? undefined,
      displayOrder: row.display_order,
    };
  });
}

/**
 * Practitioners, read at build time so they are present in the static HTML.
 *
 * Falls back to a committed snapshot if Supabase is unreachable — a database
 * blip should produce slightly stale therapists, not a failed deploy. Refresh
 * the snapshot with `npm run snapshot:doctors`.
 */
export async function getDoctorsForBuild(): Promise<Doctor[]> {
  try {
    const { data, error } = await supabase
      .from('doctors')
      .select(DOCTOR_COLUMNS)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error('doctors table returned no active rows');

    return withSlugs(data as DoctorRow[]);
  } catch (err) {
    console.warn(
      `  WARNING: could not read doctors from Supabase (${(err as Error).message}).\n` +
        `  Falling back to data/doctors-snapshot.json (${snapshot.doctors.length} practitioners, captured ${snapshot.capturedAt}).`
    );
    return withSlugs(snapshot.doctors as DoctorRow[]);
  }
}

export async function getDoctorBySlug(slug: string): Promise<Doctor | null> {
  const doctors = await getDoctorsForBuild();
  return doctors.find((d) => d.slug === slug) ?? null;
}

export function getDepartments(doctors: Doctor[]): string[] {
  return Array.from(new Set(doctors.map((d) => d.department))).sort();
}

// Pure bio parsing lives in lib/bio so that modules needing it (authors,
// schema builders, tests) do not also construct the Supabase client above.
export {
  bioIntro,
  bioSection,
  bioLanguages,
  languagesSpoken,
  practitionerRole,
} from '@/lib/bio';
