// Everything the newsletter handlers need from outside, in one object.
// Production builds it from environment variables with liveDeps(); tests
// pass in-memory versions (tests/vitest/functions/newsletter/fakes.ts).

import { createClient } from '@supabase/supabase-js';
import { newsletterImagesBase } from '../../../lib/newsletter/render';
import { verifyAdminToken, type AdminUser } from './admin.mts';
import { createNewsletterDb, type NewsletterDb } from './newsletter-db.mts';
import {
  createImageStorage,
  createIssuesDb,
  createSettingsStore,
  type ImageStorage,
  type IssuesDb,
  type SettingsStore,
} from './newsletter-issues-db.mts';
import type { NewsletterPost } from '../../../lib/newsletter/posts';
// Written by scripts/newsletter-posts.mts at the start of every build; esbuild bundles it.
import POSTS from '../../../lib/newsletter/posts.generated.json';
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
  /** Newsletter issues (plan 3). */
  issues: IssuesDb;
  /** Signed upload URLs for the photos in an issue. */
  images: ImageStorage;
  /** The Hope Letter's settings (fortnightly spec §5.1). */
  settings: SettingsStore;
  /** Every blog post, newest first, as the newsletter needs it (fortnightly spec §5.7). */
  posts: () => NewsletterPost[];
  resend: ResendClient;
  config: NewsletterConfig;
  now: () => Date;
  /** Waits; the sign-up answer uses it to take the same time for every address. */
  sleep: (ms: number) => Promise<void>;
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
  const supabase = createClient(supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY as string, { auth: { persistSession: false } });
  const imagesBase = newsletterImagesBase(supabaseUrl);
  return {
    db: createNewsletterDb(supabase),
    issues: createIssuesDb(supabase),
    images: createImageStorage(supabase, imagesBase),
    settings: createSettingsStore(supabase),
    posts: () => POSTS as NewsletterPost[],
    resend: createResendClient({ apiKey: env.RESEND_API_KEY as string }),
    config: {
      segmentId: env.RESEND_NEWSLETTER_SEGMENT_ID as string,
      fromEmail: env.NEWSLETTER_FROM_EMAIL as string,
      replyTo: REPLY_TO,
      siteUrl: SITE_ORIGIN,
      imagesBase,
    },
    now: () => new Date(),
    sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    verifyAdmin: (req) => verifyAdminToken(req, env.ADMIN_JWT_SECRET),
  };
}
