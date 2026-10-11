import type { Doctor } from '@/lib/doctors';

/**
 * Reading the practitioner bios.
 *
 * The `doctors` table stores each bio as lightly formatted free text — an
 * opening paragraph, then "Heading:" lines with "• " bullets under them, and a
 * "Languages:" line. Everything here is a pure function of that text, so the
 * profile pages, the specialty pages and the structured data all describe a
 * practitioner using only what their own bio says.
 */

/** First paragraph of a bio, for card previews and meta descriptions. */
export function bioIntro(bio: string, maxLength = 160): string {
  const intro = bio.split('\n\n')[0].replace(/\s+/g, ' ').trim();
  if (intro.length <= maxLength) return intro;
  return intro.slice(0, intro.lastIndexOf(' ', maxLength)).trimEnd() + '…';
}

/**
 * The bullets under one "Heading:" of a bio, e.g. "Areas of Expertise". The
 * bios are free text, so this matches the heading loosely ("Therapeutic
 * Approach" and "Therapeutic Approaches" both count).
 */
export function bioSection(bio: string, heading: RegExp): string[] {
  const lines = bio.split('\n').map((line) => line.trim());
  const out: string[] = [];
  let inside = false;
  for (const line of lines) {
    if (line.endsWith(':')) {
      inside = heading.test(line);
      continue;
    }
    if (inside && line.startsWith('•')) out.push(line.slice(1).trim());
  }
  return out;
}

/** Languages from a bio's "Languages: English, Hindi & Telugu" line. */
export function bioLanguages(bio: string): string[] {
  const match = bio.match(/^\s*Languages?:\s*(.+)$/im);
  if (!match) return [];
  return match[1]
    .split(/,|&|\band\b/)
    .map((l) => l.trim().replace(/\.$/, ''))
    .filter(Boolean);
}

/** Every language anyone on the roster works in, most widely spoken first. */
export function languagesSpoken(doctors: Doctor[]): string[] {
  const counts = new Map<string, number>();
  for (const d of doctors) {
    for (const lang of bioLanguages(d.bio)) counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([lang]) => lang);
}

/**
 * The professional title a practitioner can accurately be described by.
 *
 * "Clinical psychologist" is a regulated title in India (RCI registration), so
 * it is used only where the practitioner's own bio says it, or where they hold
 * the M.Phil. in Clinical Psychology that RCI registration rests on — a
 * master's or diploma alone does not earn it here. Everyone else falls back to
 * the plain name of their discipline.
 */
export function practitionerRole(doctor: Pick<Doctor, 'bio' | 'qualification' | 'department'>): string {
  const text = `${doctor.qualification}\n${doctor.bio}`;
  if (doctor.department === 'Psychiatry') return 'Psychiatrist';
  if (/clinical psychologist/i.test(text)) return 'Clinical Psychologist';
  if (/\bM\.?\s?Phil\.?\s+(in\s+)?Clinical Psychology/i.test(text)) return 'Clinical Psychologist';
  if (/counselling psychologist/i.test(text)) return 'Counselling Psychologist';
  if (/psychiatric social worker/i.test(text)) return 'Psychiatric Social Worker';
  if (/addiction therap/i.test(text)) return 'Addiction Therapist';
  if (doctor.department === 'Social Work') return 'Social Worker';
  return 'Psychologist';
}
