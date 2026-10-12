import { describe, it, expect } from 'vitest';
import snapshot from '@/data/doctors-snapshot.json';
import {
  bioSection,
  bioLanguages,
  languagesSpoken,
  practitionerRole,
} from '@/lib/bio';
import type { Doctor } from '@/lib/doctors';

const BIO = `Arani is an RCI-certified clinical psychologist with over 6 years of experience.

Areas of Expertise:
• Depression & OCD spectrum disorders
• Couple & marital issues

Therapeutic Approaches:
• Cognitive Behaviour Therapy (CBT)
• Exposure & Response Prevention (ERP)

Languages: English, Telugu & Hindi`;

function doctor(overrides: Partial<Doctor> = {}): Doctor {
  return {
    id: '1',
    slug: 'arani-shankar',
    name: 'Ms. Arani Shankar',
    qualification: 'PGDP in Clinical Psychology',
    department: 'Psychology',
    bio: BIO,
    bookingUrl: 'https://booking.example/arani',
    displayOrder: 1,
    ...overrides,
  };
}

/** The live roster, as the build falls back to it. */
const roster: Doctor[] = snapshot.doctors.map((d, i) => ({
  id: d.id,
  slug: String(i),
  name: d.name,
  qualification: d.qualification,
  department: d.department,
  bio: d.bio,
  bookingUrl: d.booking_url,
  displayOrder: d.display_order,
}));

describe('bioSection', () => {
  it('reads the bullets under one heading only', () => {
    expect(bioSection(BIO, /expertise/i)).toEqual([
      'Depression & OCD spectrum disorders',
      'Couple & marital issues',
    ]);
  });

  it('matches singular and plural headings alike', () => {
    expect(bioSection(BIO, /approach/i)).toHaveLength(2);
  });
});

describe('bioLanguages', () => {
  it('splits on commas and ampersands', () => {
    expect(bioLanguages(BIO)).toEqual(['English', 'Telugu', 'Hindi']);
  });

  it('returns nothing when a bio names no languages', () => {
    expect(bioLanguages('A bio.')).toEqual([]);
  });

  it('puts the most widely spoken language first across the roster', () => {
    const langs = languagesSpoken(roster);
    expect(langs[0]).toBe('English');
    expect(langs).toContain('Telugu');
  });
});

describe('practitionerRole', () => {
  it('calls a psychiatry department a psychiatrist', () => {
    expect(practitionerRole(doctor({ department: 'Psychiatry', bio: 'A bio.' }))).toBe(
      'Psychiatrist'
    );
  });

  it('uses "Clinical Psychologist" when the bio says so', () => {
    expect(practitionerRole(doctor())).toBe('Clinical Psychologist');
  });

  it('uses "Clinical Psychologist" for an M.Phil. in Clinical Psychology', () => {
    expect(
      practitionerRole(doctor({ bio: 'Qualifications:\n• M.Phil. in Clinical Psychology — NIMHANS' }))
    ).toBe('Clinical Psychologist');
  });

  it('does not promote a master’s in clinical psychology to the regulated title', () => {
    // "Clinical psychologist" requires RCI registration in India. A degree name
    // is not the same claim, and overstating it is the error to avoid.
    expect(
      practitionerRole(
        doctor({ qualification: 'MSc Psychology', bio: 'Shruti is a Masters in Clinical Psychology.' })
      )
    ).toBe('Psychologist');
  });

  // Pinned against the real roster: every title shown in a page <title> and in
  // Person.jobTitle comes from here.
  it.each([
    ['Mrs. Rajeshwari Luther', 'Counselling Psychologist'],
    ['Rahul Luther', 'Addiction Therapist'],
    ['Dr. Vidhya Sagar', 'Clinical Psychologist'],
    ['Dr. Nishanth Vemana', 'Psychiatrist'],
    ['Ms. Muskan Gupta', 'Clinical Psychologist'],
    ['Dr. Justina Wilma Fernandes', 'Psychologist'],
    ['Ms. Shruti Sharma', 'Psychologist'],
    ['Ms. Sneha Sesha', 'Psychiatric Social Worker'],
    ['Ms. Apeksha', 'Psychologist'],
  ])('describes %s as a %s', (name, role) => {
    const d = roster.find((r) => r.name === name);
    if (!d) return; // left the roster since this was written
    expect(practitionerRole(d)).toBe(role);
  });
});
