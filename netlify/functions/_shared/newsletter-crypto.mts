// Confirmation tokens and address hashes (spec §7.3, §7.5). Server-only.

import { createHash, randomBytes } from 'node:crypto';
import { normaliseEmail } from '../../../lib/newsletter/subscriber';

/** What newToken() produces: 32 random bytes as base64url. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Only this hash is stored, so a copy of the database can't confirm anyone. */
export function hashToken(token: string): string {
  return sha256(token);
}

/** What newsletter_erased keeps: no readable address, but imports can still match it. */
export function hashEmail(email: string): string {
  return sha256(normaliseEmail(email));
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
