// Everything the newsletter handlers need from outside, in one object.
// Production builds it from environment variables with liveDeps(); tests
// pass in-memory versions (tests/vitest/functions/newsletter/fakes.ts).

import { createClient } from '@supabase/supabase-js';
import { newsletterImagesBase } from '../../../lib/newsletter/render';
import { verifyAdminToken, type AdminUser } from './admin.mts';
import { createNewsletterDb, type NewsletterDb } from './newsletter-db.mts';
import { createResendClient, type ResendClient } from './resend.mts';

/** The main site. Netlify sets URL for functions at runtime. */
export const SITE_ORIGIN = (process.env.URL || 'https://hopetrustindia.com').replace(/\/+$/, '');
export const REPLY_TO = 'frontoffice@hopetrustindia.com';

export interface NewsletterConfig {
  /** Resend segment the newsletter goes to (spec §4: "Newsletter"). */
  segmentId: string;
  /** "Hope Trust <newsletter@hopetrustindia.com>" */
  fromEmail: string;
  replyTo: string;
  /** Main site origin, without a trailing slash. */
  siteUrl: string;
  /** Public URL of the newsletter-images bucket. */
  imagesBase: string;
}

export interface NewsletterDeps {
  db: NewsletterDb;
  resend: ResendClient;
  config: NewsletterConfig;
  now: () => Date;
  verifyAdmin: (req: Request) => AdminUser | null;
}

const REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RESEND_API_KEY',
  'RESEND_NEWSLETTER_SEGMENT_ID',
  'NEWSLETTER_FROM_EMAIL',
] as const;

/** The real services, or null (after logging which variables are missing). */
export function liveDeps(env: Record<string, string | undefined> = process.env): NewsletterDeps | null {
  const missing = REQUIRED.filter((name) => !env[name]);
  if (missing.length > 0) {
    console.error(`[newsletter] missing environment variables: ${missing.join(', ')}`);
    return null;
  }
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL as string;
  return {
    db: createNewsletterDb(
      createClient(supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY as string, { auth: { persistSession: false } }),
    ),
    resend: createResendClient({ apiKey: env.RESEND_API_KEY as string }),
    config: {
      segmentId: env.RESEND_NEWSLETTER_SEGMENT_ID as string,
      fromEmail: env.NEWSLETTER_FROM_EMAIL as string,
      replyTo: REPLY_TO,
      siteUrl: SITE_ORIGIN,
      imagesBase: newsletterImagesBase(supabaseUrl),
    },
    now: () => new Date(),
    verifyAdmin: (req) => verifyAdminToken(req, env.ADMIN_JWT_SECRET),
  };
}
