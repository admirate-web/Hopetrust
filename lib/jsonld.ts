import { siteConfig } from '@/lib/config';
import { getLogoUrl } from '@/lib/assets';
import { SPECIALTIES } from '@/lib/specialties';

const SITE_URL = siteConfig.url;

/**
 * The Google Business Profile listing, by its Maps customer ID. The ID is the
 * second half of the place reference in the contact page's map embed
 * (…!1s0x3bcb96c4df21349b:0x87e33358daa3586e…), converted to decimal.
 * Publishing it as `hasMap` and in `sameAs` is the most direct statement that
 * this website and that listing are the same business.
 */
const GBP_MAPS_URL = 'https://maps.google.com/?cid=9791726471551866990';

/**
 * Every service with its own page, for `hasOfferCatalog`. Answer engines read
 * this to learn what the clinic does and which URL covers each service.
 */
function serviceCatalog() {
  const services = [
    { name: 'Therapy, counselling and psychiatry', path: '/mental-health/' },
    { name: 'Alcohol and drug de-addiction treatment', path: '/addiction/' },
    ...SPECIALTIES.map((s) => ({ name: s.name, path: `/${s.slug}/` })),
    { name: 'Addiction intervention services', path: '/intervention-services/' },
    { name: 'Corporate wellness programmes', path: '/corporate-wellness/' },
    { name: 'Clinical training and internships', path: '/training/' },
  ];
  return {
    '@type': 'OfferCatalog',
    name: 'Hope Trust services',
    itemListElement: services.map((s) => ({
      '@type': 'Offer',
      itemOffered: { '@type': 'Service', name: s.name, url: `${SITE_URL}${s.path}` },
    })),
  };
}

/** Organization + LocalBusiness — injected in root layout */
export function getOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': ['Organization', 'MedicalBusiness'],
    '@id': `${SITE_URL}/#organization`,
    name: 'Hope Trust',
    // The second is the Google Business Profile name, which people search by
    // ("hope trust - psychological wellness centre hyderabad").
    alternateName: ['Hope Trust India', 'Hope Trust - Psychological Wellness Centre'],
    legalName: 'Arel Hope Recovery Services LLP',
    slogan: 'A place for hope, healing, and renewal',
    foundingDate: '2002',
    numberOfEmployees: { '@type': 'QuantitativeValue', minValue: 30 },
    url: SITE_URL,
    logo: {
      '@type': 'ImageObject',
      url: getLogoUrl(),
      width: 512,
      height: 512,
    },
    image: getLogoUrl(),
    description: siteConfig.name + ' — A place for hope, healing, and renewal. Mental health and addiction recovery services in Hyderabad.',
    telephone: siteConfig.contact.phone,
    email: siteConfig.contact.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: siteConfig.contact.address.streetAddress,
      addressLocality: siteConfig.contact.address.locality,
      addressRegion: siteConfig.contact.address.region,
      postalCode: siteConfig.contact.address.postalCode,
      addressCountry: siteConfig.contact.address.country,
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: 17.4142,
      longitude: 78.4191,
    },
    hasMap: GBP_MAPS_URL,
    sameAs: [
      GBP_MAPS_URL,
      'https://www.instagram.com/hopetrust',
      'https://www.facebook.com/hopetrust',
      'https://www.linkedin.com/company/hope-trust/',
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: siteConfig.contact.phone,
      email: siteConfig.contact.email,
      contactType: 'appointments',
      areaServed: 'IN',
      availableLanguage: ['English', 'Hindi', 'Telugu'],
    },
    knowsAbout: [
      'Psychotherapy',
      'Cognitive behavioural therapy',
      'Exposure and response prevention',
      'Couples therapy',
      'Family therapy',
      'Child and adolescent psychology',
      'ADHD assessment',
      'Psychiatry',
      'Alcohol addiction',
      'Drug addiction',
      'Gambling addiction',
      'Nicotine cessation',
      'Dual diagnosis',
      'Addiction intervention',
    ],
    hasOfferCatalog: serviceCatalog(),
    openingHoursSpecification: {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: siteConfig.hours.days,
      opens: siteConfig.hours.opens,
      closes: siteConfig.hours.closes,
    },
    priceRange: '₹₹',
    areaServed: [
      { '@type': 'City', name: 'Hyderabad' },
      { '@type': 'State', name: 'Telangana' },
      // Online sessions reach well beyond the city.
      { '@type': 'Country', name: 'India' },
    ],
    medicalSpecialty: [
      'Psychiatry',
      'Psychology',
      'Addiction Medicine',
    ],
  };
}

/** WebSite schema with search action */
export function getWebSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    url: SITE_URL,
    name: 'Hope Trust',
    publisher: { '@id': `${SITE_URL}/#organization` },
  };
}

/** BreadcrumbList helper */
export function getBreadcrumbSchema(
  items: { name: string; url: string }[]
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/** Service schema for service pages */
export function getServiceSchema(opts: {
  name: string;
  description: string;
  url: string;
  serviceType?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'MedicalTherapy',
    name: opts.name,
    description: opts.description,
    url: opts.url,
    serviceType: opts.serviceType || opts.name,
    provider: { '@id': `${SITE_URL}/#organization` },
    areaServed: {
      '@type': 'City',
      name: 'Hyderabad',
    },
    availableChannel: {
      '@type': 'ServiceChannel',
      serviceUrl: `${SITE_URL}/book-your-session/`,
      serviceSmsNumber: siteConfig.contact.phone,
    },
  };
}

/** FAQPage schema */
export function getFAQSchema(faqs: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}
