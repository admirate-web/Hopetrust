'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X, ChevronDown } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Bricolage_Grotesque } from "next/font/google";
import { getAssetUrl } from '@/lib/assets';

const navFont = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

type NavItem = {
  label: string;
  href: string;
  hasDropdown?: boolean;
  children?: { label: string; href: string }[];
};

const leftNavItems: NavItem[] = [
  { label: 'About Us', href: '/about', hasDropdown: false },
  {
    label: 'Mental Health',
    href: '/mental-health',
    hasDropdown: true,
    // The desktop dropdown is always in the DOM, so these are crawlable links
    // to the specialty pages from every page on the site.
    children: [
      { label: 'Couples & Marriage Counselling', href: '/couples-counselling/' },
      { label: 'Child & Teen Psychologists', href: '/child-psychologist/' },
      { label: 'OCD Treatment', href: '/ocd-treatment/' },
      { label: 'Online Therapy', href: '/online-therapy/' },
    ],
  },
  {
    label: 'Addiction Services',
    href: '/addiction',
    hasDropdown: true,
    children: [
      { label: 'Intervention Services', href: '/intervention-services' },
    ],
  },
  { label: 'Corporate Wellness', href: '/corporate-wellness', hasDropdown: false },
];

const rightNavItems: NavItem[] = [
  { label: 'Training', href: '/training', hasDropdown: false },
  { label: 'Blogs', href: '/blogs', hasDropdown: false },
  { label: 'Find Your Therapist', href: '/book-your-session', hasDropdown: false },
  { label: 'Contact Us', href: '/contact', hasDropdown: false },
];

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);
  const dropdownTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastScrollY = useRef(0);
  const pathname = usePathname();

  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isMenuOpen]);

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;
      if (currentY > 80 && currentY > lastScrollY.current) {
        setIsHidden(true);
      } else {
        setIsHidden(false);
      }
      lastScrollY.current = currentY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const allItems: NavItem[] = [...leftNavItems, ...rightNavItems];

  const renderNavItem = (item: NavItem) => {
    const normalizePath = (path: string) => path.replace(/\/$/, '') || '/';
    const currentPath = normalizePath(pathname);
    const targetPath = normalizePath(item.href);

    const isActive =
      item.href !== '#' &&
      (currentPath === targetPath || currentPath.startsWith(`${targetPath}/`));

    const childActive = item.children?.some((child) => {
      const cp = normalizePath(child.href);
      return currentPath === cp || currentPath.startsWith(`${cp}/`);
    });

    if (item.hasDropdown && item.children) {
      return (
        <div
          key={item.label}
          className="relative"
          onMouseEnter={() => {
            if (dropdownTimeoutRef.current) clearTimeout(dropdownTimeoutRef.current);
            setOpenDropdown(item.label);
          }}
          onMouseLeave={() => {
            dropdownTimeoutRef.current = setTimeout(() => setOpenDropdown(null), 150);
          }}
        >
          <Link
            href={item.href}
            className={`${navFont.className} group relative flex items-center gap-1 text-sm md:text-base font-semibold transition-all duration-200 hover:-translate-y-0.5 ${
              isActive || childActive
                ? 'text-orange-500'
                : 'text-gray-800 hover:text-orange-500'
            }`}
          >
            <span>{item.label}</span>
            <ChevronDown
              className={`h-3 w-3 md:h-3.5 md:w-3.5 stroke-[2] transition-transform duration-200 ${
                openDropdown === item.label ? 'rotate-180' : ''
              }`}
            />
            <span
              className={`absolute bottom-0 left-0 h-[2px] w-full origin-left scale-x-0 rounded-full bg-orange-500 transition-transform duration-300 ease-out group-hover:scale-x-100 ${
                isActive || childActive ? 'scale-x-100' : ''
              }`}
            />
          </Link>

          {/* Desktop dropdown */}
          <div
            className={`absolute left-0 top-full pt-2 transition-all duration-200 ${
              openDropdown === item.label
                ? 'pointer-events-auto translate-y-0 opacity-100'
                : 'pointer-events-none -translate-y-1 opacity-0'
            }`}
          >
            <div className="min-w-[200px] rounded-xl bg-white py-2 shadow-lg ring-1 ring-black/5">
              {item.children.map((child) => {
                const childPath = normalizePath(child.href);
                const isChildActive = currentPath === childPath;
                return (
                  <Link
                    key={child.label}
                    href={child.href}
                    className={`${navFont.className} block px-4 py-2.5 text-sm font-medium transition-colors ${
                      isChildActive
                        ? 'bg-orange-50 text-orange-500'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-orange-500'
                    }`}
                  >
                    {child.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    return (
      <Link
        key={item.label}
        href={item.href}
        className={`${navFont.className} group relative flex items-center gap-1 text-sm md:text-base font-semibold transition-all duration-200 hover:-translate-y-0.5 ${
          isActive
            ? 'text-orange-500'
            : 'text-gray-800 hover:text-orange-500'
        }`}
      >
        <span>{item.label}</span>
        <span
          className={`absolute bottom-0 left-0 h-[2px] w-full origin-left scale-x-0 rounded-full bg-orange-500 transition-transform duration-300 ease-out group-hover:scale-x-100 ${
            isActive ? 'scale-x-100' : ''
          }`}
        />
      </Link>
    );
  };

  return (
    <>
      <header
        className={`fixed top-0 z-50 w-full transition-all duration-300 ease-in-out bg-white/95 shadow-sm backdrop-blur lg:shadow-none ${
          isHidden ? 'lg:-translate-y-full' : 'lg:translate-y-0'
        } ${
          isHovered
            ? 'lg:bg-white/95 lg:shadow-sm lg:backdrop-blur'
            : 'lg:bg-transparent lg:backdrop-blur-none'
        }`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4 md:py-5">
            {/* Logo */}
            <div className="flex items-center">
              <Link href="/" className="relative flex-shrink-0">
                <Image
                  src={getAssetUrl("logo1.png")}
                  alt="Hope Trust Logo"
                  width={120}
                  height={120}
                  className="object-contain"
                  style={{ width: 'auto', height: '5rem' }}
                  priority
                  quality={100}
                />
              </Link>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden items-center gap-6 xl:gap-8 lg:flex">
              {[...leftNavItems, ...rightNavItems].map(renderNavItem)}
            </nav>

            {/* Mobile menu button */}
            <button
              className="rounded-md p-2 text-gray-700 hover:bg-gray-100 hover:text-orange-500 transition-colors duration-300 lg:hidden"
              onClick={() => setIsMenuOpen((open) => !open)}
            >
              {isMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer Overlay — outside header to avoid backdrop-blur containment */}
      <div
        className={`fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${
          isMenuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setIsMenuOpen(false)}
      />

      {/* Mobile Drawer */}
      <nav
        className={`fixed top-0 right-0 z-[70] flex h-full w-[280px] flex-col bg-white shadow-2xl transition-transform duration-300 ease-in-out lg:hidden ${
          isMenuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <Link href="/" onClick={() => setIsMenuOpen(false)}>
            <Image
              src={getAssetUrl('logo1.png')}
              alt="Hope Trust Logo"
              width={96}
              height={96}
              className="object-contain"
              style={{ width: 'auto', height: '3rem' }}
              priority
              quality={100}
            />
          </Link>
          <button
            onClick={() => setIsMenuOpen(false)}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close menu"
          >
            <X size={22} />
          </button>
        </div>

        {/* Nav links */}
        <div className="flex-1 overflow-y-auto px-3 py-4">
          {allItems.map((item) => {
            const normalizePath = (path: string) =>
              path.replace(/\/$/, '') || '/';
            const currentPath = normalizePath(pathname);
            const targetPath = normalizePath(item.href);

            const isActive =
              item.href !== '#' &&
              (currentPath === targetPath ||
                currentPath.startsWith(`${targetPath}/`));

            return (
              <div key={item.label}>
                <div className="flex items-center">
                  <Link
                    href={item.href}
                    className={`${navFont.className} flex flex-1 items-center rounded-lg px-4 py-3 text-[15px] font-semibold transition-colors ${
                      isActive
                        ? 'bg-orange-50 text-orange-500'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-orange-500'
                    }`}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                  {item.hasDropdown && item.children && (
                    <button
                      type="button"
                      onClick={() =>
                        setMobileExpanded((prev) =>
                          prev === item.label ? null : item.label
                        )
                      }
                      className="rounded-lg p-3 text-gray-500 hover:bg-gray-50 hover:text-orange-500"
                      aria-label={`Expand ${item.label}`}
                    >
                      <ChevronDown
                        className={`h-4 w-4 stroke-[2] transition-transform duration-200 ${
                          mobileExpanded === item.label ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                  )}
                </div>
                {item.hasDropdown &&
                  item.children &&
                  mobileExpanded === item.label && (
                    <div className="ml-4 border-l-2 border-orange-100 pl-2">
                      {item.children.map((child) => {
                        const cp = normalizePath(child.href);
                        const isChildActive = currentPath === cp;
                        return (
                          <Link
                            key={child.label}
                            href={child.href}
                            className={`${navFont.className} block rounded-lg px-4 py-2.5 text-[14px] font-medium transition-colors ${
                              isChildActive
                                ? 'bg-orange-50 text-orange-500'
                                : 'text-gray-600 hover:bg-gray-50 hover:text-orange-500'
                            }`}
                            onClick={() => setIsMenuOpen(false)}
                          >
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
              </div>
            );
          })}
        </div>

        {/* Drawer footer */}
        <div className="border-t border-gray-100 px-5 py-4">
          <p className="text-xs text-gray-400">
            &copy; {new Date().getFullYear()} Hope Trust
          </p>
        </div>
      </nav>
    </>
  );
}
