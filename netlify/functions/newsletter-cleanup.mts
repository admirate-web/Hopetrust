// Runs every hour on Netlify (a scheduled function, published deploys only),
// so the privacy policy's promises hold even on days without sign-ups:
// unconfirmed sign-ups go after 30 days, and sign-up request IPs after a day
// (spec §7.2 step 5, §10.5).
import { liveDeps } from './_shared/newsletter-deps.mts';
import { runCleanup } from './_shared/newsletter-signup.mts';

export default async () => {
  const deps = liveDeps();
  if (!deps) return new Response('Server misconfiguration', { status: 500 });
  const deleted = await runCleanup(deps);
  console.log('[newsletter-cleanup]', JSON.stringify(deleted));
  return new Response(JSON.stringify(deleted), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

export const config = { schedule: '@hourly' };
