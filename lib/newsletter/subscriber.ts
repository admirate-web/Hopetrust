// Subscriber rules shared by the sign-up form, the admin screens and the
// newsletter functions (spec §7, §10.1). Browser-safe: no Node-only APIs.

import { z } from 'zod';

export type SubscriberStatus = 'pending' | 'subscribed' | 'unsubscribed';
export type SubscriberSource = 'website' | 'import';
export type UnsubscribeSource = 'resend' | 'admin';

export const SUBSCRIBER_STATUSES: readonly SubscriberStatus[] = ['pending', 'subscribed', 'unsubscribed'];
export const SUBSCRIBER_SOURCES: readonly SubscriberSource[] = ['website', 'import'];

/** One row of newsletter_subscribers (Database/newsletter.sql). Timestamps are ISO strings. */
export interface SubscriberRow {
  id: string;
  email: string;
  full_name: string | null;
  status: SubscriberStatus;
  /** Where the current consent came from. */
  source: SubscriberSource;
  consent_at: string | null;
  consent_note: string | null;
  imported_by: string | null;
  import_batch_id: string | null;
  /** The latest website sign-up request. */
  signup_page: string | null;
  signup_ip: string | null;
  signup_user_agent: string | null;
  signup_notice: string | null;
  confirm_token_hash: string | null;
  confirm_token_expires_at: string | null;
  confirm_sent_at: string | null;
  confirm_send_count: number;
  unsubscribed_at: string | null;
  unsubscribe_source: UnsubscribeSource | null;
  resend_contact_id: string | null;
  /** Null while a change hasn't reached Resend. */
  resend_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

/** A row as the admin screens get it: without the confirmation token. */
export type AdminSubscriber = Omit<SubscriberRow, 'confirm_token_hash' | 'confirm_token_expires_at'>;

/**
 * The notice under every sign-up form. Change `version` whenever the wording
 * changes, and add the new version to KNOWN_NOTICE_VERSIONS.
 */
export const SIGNUP_NOTICE = {
  version: '2026-10',
  text: "We'll email you the Hope Trust newsletter about once a fortnight. Unsubscribe any time.",
} as const;

/** Versions the sign-up function accepts; a page opened before a change may still send an older one. */
export const KNOWN_NOTICE_VERSIONS: readonly string[] = ['2026-10'];

export const SIGNUP_SUCCESS_MESSAGE = 'Check your inbox to confirm your subscription.';

export const LIMITS = {
  name: 200,
  email: 254,
  page: 200,
  userAgent: 500,
  statement: 500,
} as const;

/** The form of an address the database stores. */
export function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

export const emailSchema = z
  .string({ required_error: 'Please enter your email address', invalid_type_error: 'Please enter your email address' })
  .trim()
  .toLowerCase()
  .min(1, 'Please enter your email address')
  .max(LIMITS.email, 'Please enter a shorter email address')
  .email('Please enter a valid email address');

export function isValidEmail(value: unknown): boolean {
  return emailSchema.safeParse(value).success;
}

/**
 * A control character, or half of a UTF-16 surrogate pair. Postgres text
 * can't hold \u0000, and no name needs the others. No lookbehind and no
 * isWellFormed(): this also runs in the sign-up form, in older browsers.
 */
const UNSAFE_TEXT = /[\u0000-\u001F\u007F-\u009F]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/;

export function hasUnsafeCharacters(text: string): boolean {
  return UNSAFE_TEXT.test(text);
}

export const nameSchema = z
  .string({ required_error: 'Please enter your full name', invalid_type_error: 'Please enter your full name' })
  .trim()
  .min(2, 'Please enter your full name')
  .max(LIMITS.name, 'Please use a shorter name')
  .refine((name) => !hasUnsafeCharacters(name), "Your name has a character we can't save. Please type it again.");

/** The body the sign-up form posts to /api/newsletter-subscribe. */
export const signupSchema = z.object({
  full_name: nameSchema,
  email: emailSchema,
  /**
   * Path of the page the form was on, e.g. "/blogs/". Anything that isn't a
   * site path becomes "/", but unsafe characters are refused, not replaced.
   */
  page: z
    .custom((page) => typeof page !== 'string' || !hasUnsafeCharacters(page), 'Please reload the page and try again.')
    .pipe(z.string().trim().max(LIMITS.page).regex(/^\/\S*$/).catch('/')),
  notice: z.string().trim().max(20),
  /** Honeypot: hidden from people, so only bots fill it in. */
  website: z.string().max(500).optional(),
});

export type SignupInput = z.infer<typeof signupSchema>;
