import Link from 'next/link';
import NotFoundSuggestions from '@/components/NotFoundSuggestions';

export const metadata = {
  // The root layout's template appends " | Hope Trust"; spelling it out here
  // too produced "Page Not Found | Hope Trust | Hope Trust".
  title: 'Page Not Found',
  description: 'The page you are looking for does not exist.',
};

/** Where most people who hit a dead end were trying to get to. */
const POPULAR = [
  { label: 'Find a therapist', href: '/book-your-session/' },
  { label: 'Mental health services', href: '/mental-health/' },
  { label: 'Addiction treatment', href: '/addiction/' },
  { label: 'Articles', href: '/blogs/' },
  { label: 'Contact us', href: '/contact/' },
];

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#F7F6F4] px-4 py-16 text-center">
      <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#ED7428]">
        404
      </p>
      <h1 className="mb-4 text-3xl font-bold text-[#00373E] sm:text-5xl">
        Page not found
      </h1>
      <p className="mb-8 max-w-md text-base text-[#486364] sm:text-lg">
        Sorry, the page you&apos;re looking for doesn&apos;t exist or has been
        moved.
      </p>

      <NotFoundSuggestions />

      <Link
        href="/"
        className="inline-flex items-center justify-center rounded-full bg-[#00373E] px-8 py-3 text-sm font-semibold text-white shadow-md transition-all duration-200 hover:bg-[#024a53] hover:-translate-y-0.5 hover:shadow-lg"
      >
        Back to Home
      </Link>

      <nav aria-label="Popular pages" className="mt-8">
        <ul className="flex flex-wrap justify-center gap-2 sm:gap-3">
          {POPULAR.map((p) => (
            <li key={p.href}>
              <Link
                href={p.href}
                className="inline-block rounded-full border border-[#00373E]/15 bg-white px-4 py-2 text-sm font-medium text-[#00373E] transition-colors hover:border-[#ED7428] hover:text-[#ED7428]"
              >
                {p.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
