// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { TOKEN_PATTERN, hashEmail, hashToken, newToken } from '@/netlify/functions/_shared/newsletter-crypto.mts';

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

describe('newToken', () => {
  it('makes 32 random bytes as base64url, different every time', () => {
    const a = newToken();
    const b = newToken();
    expect(a).toMatch(TOKEN_PATTERN);
    expect(b).toMatch(TOKEN_PATTERN);
    expect(a).not.toBe(b);
  });
});

describe('hashToken', () => {
  it('is the SHA-256 of the token, never the token itself', () => {
    const token = newToken();
    expect(hashToken(token)).toBe(sha256(token));
    expect(hashToken(token)).not.toContain(token);
  });
});

describe('hashEmail', () => {
  it('hashes the normalised address, so case and spaces do not matter', () => {
    expect(hashEmail(' Asha@Example.COM ')).toBe(sha256('asha@example.com'));
  });
});
