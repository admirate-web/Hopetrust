import Link from "next/link";
import { Bricolage_Grotesque } from "next/font/google";
import { getAssetUrl } from "@/lib/assets";

const headingFont = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const navLinks = [
  { label: "About", href: "/about" },
  { label: "Services", href: "/mental-health" },
  { label: "Therapists", href: "/book-your-session" },
  { label: "Resources", href: "/blogs" },
  { label: "Contact", href: "/contact" },
];

/**
 * Every service page, linked from every page. The specialty pages are new and
 * otherwise reachable only from a few places; a site-wide link is what gets
 * them crawled and passes them some of the site's standing.
 */
const serviceLinks = [
  { label: "Mental Health", href: "/mental-health/" },
  { label: "Addiction Treatment", href: "/addiction/" },
  { label: "Couples Counselling", href: "/couples-counselling/" },
  { label: "Child & Teen Psychologists", href: "/child-psychologist/" },
  { label: "OCD Treatment", href: "/ocd-treatment/" },
  { label: "Online Therapy", href: "/online-therapy/" },
  { label: "Intervention Services", href: "/intervention-services/" },
  { label: "Corporate Wellness", href: "/corporate-wellness/" },
];

const socialLinks = [
  { label: "Instagram", href: "https://www.instagram.com/hopetrust?igsh=N2hvNmtmcHZ3emxi" },
  { label: "Facebook", href: "https://www.facebook.com/hopetrust" },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/hope-trust/" },
];

const legalLinks = [
  { label: "Terms & Conditions", href: "/terms-and-conditions" },
  { label: "Cancellation Policy", href: "/cancellation-policy" },
  { label: "Privacy Policy", href: "/privacy-policy" },
  { label: "Sitemap", href: "/sitemap" },
];

export default function Footer() {
  return (
    <footer className="w-full bg-[#ED7428]">
      {/* Orange top bar */}
      <div className="h-6 sm:h-8" />

      {/* Main container */}
      <div className="mx-auto max-w-[1294px] px-4 sm:px-6">
        <div className="relative rounded-[28px] sm:rounded-[40px] bg-white overflow-hidden px-8 sm:px-12 lg:px-16 py-10 sm:py-14">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-10 lg:gap-8">
            {/* Left side: logo + nav columns */}
            <div className="flex flex-wrap items-start gap-6 sm:gap-12 lg:gap-12">
              {/* Logo */}
              <div className="shrink-0">
                <img
                  src={getAssetUrl("logo1.png")}
                  alt="Hope Trust"
                  className="h-16 sm:h-20 w-auto"
                />
              </div>

              {/* Nav column 1: Quick Links */}
              <nav className="flex flex-col gap-3">
                <span className={`${headingFont.className} text-sm sm:text-base font-semibold text-[#00373E] mb-1`}>
                  Quick Links
                </span>
                {navLinks.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    className={`${headingFont.className} text-sm sm:text-base text-[#00373E] hover:text-[#ED7428] transition-colors`}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>

              {/* Nav column: Services */}
              <nav className="flex flex-col gap-3" aria-label="Services">
                <span className={`${headingFont.className} text-sm sm:text-base font-semibold text-[#00373E] mb-1`}>
                  Services
                </span>
                {serviceLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`${headingFont.className} text-sm sm:text-base text-[#00373E] hover:text-[#ED7428] transition-colors`}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>

              {/* Social and Legal share a column, so the row still fits beside
                  the heading now that Services has been added. */}
              <div className="flex flex-col gap-8">
              {/* Nav column 2: Social */}
              <nav className="flex flex-col gap-3">
                <span className={`${headingFont.className} text-sm sm:text-base font-semibold text-[#00373E] mb-1`}>
                  Social
                </span>
                {socialLinks.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${headingFont.className} text-sm sm:text-base text-[#00373E] hover:text-[#ED7428] transition-colors`}
                  >
                    {link.label}
                  </a>
                ))}
              </nav>

              {/* Nav column 3: Legal */}
              <nav className="flex flex-col gap-3">
                <span className={`${headingFont.className} text-sm sm:text-base font-semibold text-[#00373E] mb-1`}>
                  Legal
                </span>
                {legalLinks.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    className={`${headingFont.className} text-sm sm:text-base text-[#00373E] hover:text-[#ED7428] transition-colors`}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
              </div>
            </div>

            {/* Right side: heading + decorative elements */}
            <div className="relative flex flex-col items-start lg:items-start gap-6 lg:max-w-[420px]">
              <h2
                className={`${headingFont.className} text-3xl sm:text-4xl lg:text-[52px] lg:leading-[60px] font-bold text-[#00373E]`}
              >
                Find support, guidance, and balance.
              </h2>

              {/* Decorative flowers & rainbow - top right */}
              <div className="pointer-events-none absolute -top-6 -right-6 lg:-top-8 lg:-right-8">
                <svg width="180" height="180" viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* Rainbow arc */}
                  <path d="M140 0 C160 0, 180 20, 180 50" stroke="#F7C948" strokeWidth="8" fill="none" strokeOpacity="0.6" />
                  <path d="M148 0 C165 0, 180 15, 180 38" stroke="#FFB366" strokeWidth="6" fill="none" strokeOpacity="0.5" />
                  <path d="M155 0 C168 0, 180 10, 180 28" stroke="#FFDDB3" strokeWidth="5" fill="none" strokeOpacity="0.4" />
                  {/* Teal flower */}
                  <circle cx="120" cy="30" r="14" fill="#2ABFAB" />
                  <circle cx="120" cy="30" r="6" fill="#F7C948" />
                  {/* Blue flower */}
                  <circle cx="90" cy="55" r="20" fill="#4BB8C4" fillOpacity="0.85" />
                  <circle cx="90" cy="55" r="8" fill="#FFEEDD" />
                  {/* Pink flower */}
                  <circle cx="130" cy="75" r="12" fill="#F5A0B8" fillOpacity="0.8" />
                  <circle cx="130" cy="75" r="5" fill="#FFEEDD" />
                  {/* Small pink circle */}
                  <circle cx="75" cy="80" r="8" fill="#F5A0B8" fillOpacity="0.5" />
                  {/* Orange cross/star */}
                  <rect x="155" y="95" width="16" height="4" rx="2" fill="#F7A044" />
                  <rect x="161" y="89" width="4" height="16" rx="2" fill="#F7A044" />
                  {/* Small green star */}
                  <rect x="105" y="10" width="10" height="3" rx="1.5" fill="#2ABFAB" />
                  <rect x="108.5" y="6.5" width="3" height="10" rx="1.5" fill="#2ABFAB" />
                </svg>
              </div>
            </div>
          </div>

          {/* Bottom row: buttons */}
          <div className="mt-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-8">
            {/* NEWSLETTER DISABLED — uncomment when newsletter is enabled
            <Link
              href="/contact"
              className={`${headingFont.className} inline-flex items-center justify-center rounded-full bg-[#00373E] px-8 py-3 text-sm sm:text-base font-semibold text-white shadow-md transition-all duration-200 hover:bg-[#024a53] hover:-translate-y-0.5 hover:shadow-lg`}
            >
              Subscribe to our newsletter
            </Link>
            */}
            <Link
              href="/book-your-session"
              className={`${headingFont.className} inline-flex items-center justify-center rounded-full bg-[#00373E] px-8 py-3 text-sm sm:text-base font-semibold text-white shadow-md transition-all duration-200 hover:bg-[#024a53] hover:-translate-y-0.5 hover:shadow-lg`}
            >
              Find support now
            </Link>
          </div>
        </div>
      </div>

      {/* Orange bottom bar */}
      <div className="h-6 sm:h-8" />
    </footer>
  );
}