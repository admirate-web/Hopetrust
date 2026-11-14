import localFont from 'next/font/local';

// Self-hosted Bricolage Grotesque (variable, latin, weights 200-800).
// Replaces every `Bricolage_Grotesque` import from 'next/font/google', which
// fetched the font from Google at build time and broke the Netlify build.
// Define the font once here and import { bricolage } wherever it is used.
export const bricolage = localFont({
  src: '../public/bricolage-grotesque-latin-wght-normal.woff2',
  weight: '200 800',
  style: 'normal',
  display: 'swap',
  fallback: ['system-ui', 'arial'],
});