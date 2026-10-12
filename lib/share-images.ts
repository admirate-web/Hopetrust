/**
 * How the site looks outside itself: the card shown when a link is shared
 * (og:image, which Next.js also copies into the Twitter tags) and the icon
 * Google prints beside the site name in its results.
 *
 * Both used to be the round logo in Supabase storage. It is 846x855 with
 * transparent corners stored as transparent black: Google wants a square
 * favicon and showed this one with black corners, and as a share image it
 * was declared 512x512 and cropped to a small square. These files are served
 * from the site itself.
 */

/**
 * The share card for any page without a picture of its own.
 *
 * Next.js replaces a parent's `openGraph` object instead of merging it, so a
 * layout that sets `openGraph` must list this in `images` itself — leaving it
 * out publishes no image at all.
 */
export const DEFAULT_SHARE_IMAGE = {
  url: '/images/og/hope-trust-share.jpg',
  width: 1200,
  height: 630,
  alt: 'Hope Trust, mental health and de-addiction centre in Banjara Hills, Hyderabad',
};

/**
 * Square icons on a white ground. Google takes the favicon from the homepage
 * and recommends larger than 48px; iOS fills transparent areas of a
 * home-screen icon with black. /favicon.ico also answers the browsers and
 * crawlers that ask for it without reading the page.
 */
export const SITE_ICONS = {
  icon: [
    { url: '/favicon.ico', sizes: '16x16 32x32 48x48' },
    { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
  ],
  apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
};
