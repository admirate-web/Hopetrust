// Renders the sample issue to .newsletter-preview/ and, with --send, emails a test.
//
//   node --env-file=.env scripts/newsletter-preview.mts
//   node --env-file=.env scripts/newsletter-preview.mts --send you@example.com [up to 5 addresses]
//
// It needs NEXT_PUBLIC_SUPABASE_URL for the image URLs. --send also needs
// RESEND_API_KEY. Without NEWSLETTER_FROM_EMAIL it sends from
// onboarding@resend.dev, which Resend delivers only to the Resend account
// owner's own address. Once hopetrustindia.com is verified in Resend, set
// NEWSLETTER_FROM_EMAIL to send to anyone.

import { mkdirSync, writeFileSync } from 'node:fs';
import { SIZE_MAX_BYTES, SIZE_WARN_BYTES, newsletterImagesBase, renderIssueHtml } from '../lib/newsletter/render.ts';
import { buildSampleIssue } from '../lib/newsletter/sample-issue.ts';

const SITE_URL = process.env.NEWSLETTER_SITE_URL || 'https://hopetrustindia.com';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!supabaseUrl) {
  console.error('NEXT_PUBLIC_SUPABASE_URL is not set. Run with: node --env-file=.env scripts/newsletter-preview.mts');
  process.exit(1);
}

const imagesBase = newsletterImagesBase(supabaseUrl);
const issue = buildSampleIssue(imagesBase);
const common = { siteUrl: SITE_URL, assetBaseUrl: `${imagesBase}/static`, imagePrefixes: [`${imagesBase}/`] };
const sendVersion = renderIssueHtml(issue, { ...common, mode: 'send' });
const testVersion = renderIssueHtml(issue, { ...common, mode: 'test' });

mkdirSync('.newsletter-preview', { recursive: true });
writeFileSync('.newsletter-preview/sample-send.html', sendVersion.html);
writeFileSync('.newsletter-preview/sample-test.html', testVersion.html);

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;
console.log(
  `Wrote .newsletter-preview/sample-send.html (${kb(sendVersion.bytes)}) and sample-test.html (${kb(testVersion.bytes)})`,
);
if (sendVersion.bytes > SIZE_MAX_BYTES) console.warn(`Over the ${kb(SIZE_MAX_BYTES)} send limit: Gmail would clip it.`);
else if (sendVersion.bytes > SIZE_WARN_BYTES) console.warn(`Over the ${kb(SIZE_WARN_BYTES)} warning size.`);

const sendFlag = process.argv.indexOf('--send');
if (sendFlag !== -1) {
  const to = process.argv.slice(sendFlag + 1).filter((arg) => arg.includes('@')).slice(0, 5);
  const apiKey = process.env.RESEND_API_KEY;
  if (!to.length) {
    console.error('Give at least one address after --send.');
    process.exit(1);
  }
  if (!apiKey) {
    console.error('RESEND_API_KEY is not set. Add it to .env.');
    process.exit(1);
  }
  const from = process.env.NEWSLETTER_FROM_EMAIL || 'Hope Trust <onboarding@resend.dev>';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to,
      subject: `[TEST] ${issue.subject}`,
      html: testVersion.html,
      reply_to: 'frontoffice@hopetrustindia.com',
    }),
  });
  const result = await response.json();
  if (!response.ok) {
    console.error('Resend refused the email:', result);
    process.exit(1);
  }
  console.log(`Sent test email ${result.id} from ${from} to ${to.join(', ')}`);
}
