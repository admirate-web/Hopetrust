import { describe, it, expect } from 'vitest';
import { CONFIRM_SUBJECT, IGNORE_LINE, buildConfirmEmail } from '@/lib/newsletter/confirm-email';

const LINK = 'https://hopetrustindia.com/newsletter/confirm/#t=abc_DEF-123';
const LOGO = 'https://abc.supabase.co/storage/v1/object/public/newsletter-images/static/logo-v1.png';

describe('buildConfirmEmail', () => {
  const email = buildConfirmEmail({ confirmUrl: LINK, logoUrl: LOGO });

  it('uses the subject from the spec', () => {
    expect(email.subject).toBe(CONFIRM_SUBJECT);
    expect(CONFIRM_SUBJECT).toBe('Confirm your Hope Trust newsletter subscription');
  });

  it('links the button and shows the link as text for apps that hide buttons', () => {
    expect(email.html.split(`href="${LINK}"`)).toHaveLength(3);
    expect(email.html).toContain('>Confirm my subscription</a>');
    expect(email.html).toContain(`src="${LOGO}"`);
  });

  it('tells people who did not sign up that they can ignore it', () => {
    expect(email.html).toContain('If you didn&#39;t sign up, ignore this email');
    expect(email.text).toContain(IGNORE_LINE);
  });

  it('has a plain-text version with the link', () => {
    expect(email.text).toContain(LINK);
    expect(email.text).not.toContain('<');
  });

  it('escapes the link', () => {
    const odd = buildConfirmEmail({ confirmUrl: 'https://x.test/?a=1&b="2"', logoUrl: LOGO });
    expect(odd.html).toContain('href="https://x.test/?a=1&amp;b=&quot;2&quot;"');
  });
});
