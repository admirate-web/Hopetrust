import Header from "@/components/Header";
import dynamic from "next/dynamic";
import { Bricolage_Grotesque, IBM_Plex_Sans } from "next/font/google";
import BookingListClient from "@/components/BookingListClient";
import FaqSection from "@/components/FaqSection";
import {
  getDoctorsForBuild,
  getDepartments,
  languagesSpoken,
  practitionerRole,
} from "@/lib/doctors";
import { personId } from "@/lib/authors";
import { bookingFaqs, type Faq } from "@/lib/faqs";
import { getFAQSchema } from "@/lib/jsonld";
import { serializeJsonLd } from "@/components/JsonLd";
import { siteConfig } from "@/lib/config";

const Footer = dynamic(() => import("@/components/Footer"));

const bookHeadingFont = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["600"],
});

const bookBodyMediumFont = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500"],
});

/** "a, b and c" */
function listOf(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * "10 psychologists (5 of them clinical psychologists), a psychiatrist and an
 * addiction therapist". Counted from the roster so the sentence cannot drift
 * from the cards beneath it.
 */
function summariseRoles(roles: string[]): string {
  const counted = (role: string, n: number) =>
    n === 1 ? `${/^[aeiou]/i.test(role) ? "an" : "a"} ${role.toLowerCase()}` : `${n} ${role.toLowerCase()}s`;

  const psychologists = roles.filter((r) => /psychologist/i.test(r)).length;
  const clinical = roles.filter((r) => r === "Clinical Psychologist").length;
  const others = new Map<string, number>();
  for (const r of roles) if (!/psychologist/i.test(r)) others.set(r, (others.get(r) ?? 0) + 1);

  const parts: string[] = [];
  if (psychologists > 0) {
    parts.push(
      counted("Psychologist", psychologists) +
        (clinical > 0 && clinical < psychologists ? ` (${clinical} of them clinical psychologists)` : "")
    );
  }
  for (const [role, n] of Array.from(others.entries()).sort((a, b) => b[1] - a[1])) {
    parts.push(counted(role, n));
  }
  return listOf(parts);
}

export default async function Page() {
  const doctors = await getDoctorsForBuild();
  const departments = getDepartments(doctors);
  const languages = languagesSpoken(doctors);

  const roleSummary = summariseRoles(doctors.map(practitionerRole));

  const faqs: Faq[] = [
    ...bookingFaqs,
    {
      question: "Which languages are sessions available in?",
      answer: `Between them, our practitioners hold sessions in ${listOf(languages)}. Each profile lists the languages that practitioner works in.`,
    },
  ];

  // The roster as a structured list of people, each joined to the Person node
  // on their profile page, so the directory and the profiles describe the same
  // entities rather than two sets of names.
  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Psychologists, psychiatrists and therapists at Hope Trust, Hyderabad",
      numberOfItems: doctors.length,
      itemListElement: doctors.map((doc, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: {
          "@type": "Person",
          "@id": personId(doc.slug),
          name: doc.name,
          jobTitle: practitionerRole(doc),
          url: `${siteConfig.url}/therapists/${doc.slug}/`,
          worksFor: { "@id": `${siteConfig.url}/#organization` },
        },
      })),
    },
    getFAQSchema(faqs),
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}
      />
      <Header />

      <main className="min-h-screen pt-20 bg-[#F6EFE8]">
        <section className="w-full bg-[#F6EFE8] px-4 py-10 sm:px-6 lg:px-8">
          <p
            className={`${bookBodyMediumFont.className} mt-5 text-center text-sm font-semibold uppercase tracking-[0.14em] text-[#F06D00]`}
          >
            Book your session
          </p>
          {/* Heading */}
          <h1
            className={`${bookHeadingFont.className} mx-auto mb-4 mt-3 max-w-[760px] text-center text-3xl text-[#00373E] sm:text-4xl lg:text-[52px] lg:leading-[64px]`}
          >
            Psychologists &amp;{" "}
            <span className="relative inline-block">
              therapists
              <span className="absolute -bottom-2 left-0 h-[3px] w-full bg-[#F06D00]" />
            </span>{" "}
            in Hyderabad
          </h1>
          <p
            className={`${bookBodyMediumFont.className} mx-auto mb-10 max-w-2xl text-center text-sm text-gray-600 sm:text-base`}
          >
            {doctors.length} practitioners — {roleSummary} — see clients at our centre in Banjara
            Hills, Hyderabad, and online. Each card lists qualifications, the concerns they work
            with and the languages they speak, so you can choose who you see and book directly.
          </p>

          {/* Pre-booked appointment notice */}
          <div className="mx-auto mb-10 max-w-2xl rounded-2xl bg-[#00373E] px-6 py-5 text-white text-center">
            <p className="text-sm sm:text-base font-medium">All appointments are pre-booked.</p>
          </div>

          <BookingListClient doctors={doctors} departments={departments} />
        </section>

        <FaqSection items={faqs} heading="Booking a session: common questions" />
      </main>
      <Footer />
    </>
  );
}
