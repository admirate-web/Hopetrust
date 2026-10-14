// The email that asks a new subscriber to confirm (spec §7.3): short, in the
// newsletter's colours, with the link as text as well as a button for email
// apps that hide buttons or block images.

import { COLORS, FONT, esc } from './render';

export interface ConfirmEmailInput {
  /** https://hopetrustindia.com/newsletter/confirm/#t=<token> */
  confirmUrl: string;
  /** The Hope Trust badge in the newsletter-images bucket. */
  logoUrl: string;
}

export const CONFIRM_SUBJECT = 'Confirm your Hope Trust newsletter subscription';
export const IGNORE_LINE = "If you didn't sign up, ignore this email and you won't be added.";

export function buildConfirmEmail({ confirmUrl, logoUrl }: ConfirmEmailInput): { subject: string; html: string; text: string } {
  const url = esc(confirmUrl);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(CONFIRM_SUBJECT)}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.page};">
<div style="display:none;max-height:0;overflow:hidden;">One click and you're on the list.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.page};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background-color:${COLORS.white};border-radius:16px;">
<tr><td align="center" style="padding:32px 32px 8px 32px;"><img src="${esc(logoUrl)}" width="80" height="81" alt="Hope Trust" style="display:block;border:0;width:80px;height:auto;"></td></tr>
<tr><td style="padding:8px 32px 0 32px;font-family:${FONT};color:${COLORS.text};">
<h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;font-weight:600;text-align:center;">Please confirm your subscription</h1>
<p style="margin:0 0 24px 0;font-size:16px;line-height:1.6;">Thank you for signing up for the Hope Trust newsletter. Click the button below to confirm your email address. We'll send you the newsletter about once a month.</p>
</td></tr>
<tr><td align="center" style="padding:0 32px 24px 32px;">
<a href="${url}" style="display:inline-block;background-color:${COLORS.orange};color:${COLORS.white};font-family:${FONT};font-size:16px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:999px;">Confirm my subscription</a>
</td></tr>
<tr><td style="padding:0 32px 32px 32px;font-family:${FONT};color:${COLORS.muted};font-size:13px;line-height:1.6;">
<p style="margin:0 0 12px 0;">The button works once and expires in 7 days. If it doesn't work, copy this link into your browser:<br><a href="${url}" style="color:${COLORS.muted};word-break:break-all;">${url}</a></p>
<p style="margin:0;">${esc(IGNORE_LINE)}</p>
</td></tr>
</table>
<p style="margin:16px 0 0 0;font-family:${FONT};font-size:12px;color:${COLORS.muted};">Hope Trust · hopetrustindia.com</p>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    'Please confirm your subscription',
    '',
    'Thank you for signing up for the Hope Trust newsletter. Open this link to confirm your email address:',
    confirmUrl,
    '',
    'The link works once and expires in 7 days.',
    '',
    IGNORE_LINE,
    '',
    'Hope Trust · hopetrustindia.com',
  ].join('\n');

  return { subject: CONFIRM_SUBJECT, html, text };
}
