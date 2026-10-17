// Runs every 15 minutes on Netlify (a scheduled function, published production
// deploys only): The Hope Letter's automatic fortnightly send, with its preview
// to staff 48 hours before (fortnightly spec §5.6). Under `netlify dev` it can be
// run by hand: npx netlify functions:invoke newsletter-auto
import { runAutomatic } from './_shared/newsletter-auto.mts';
import { liveDeps } from './_shared/newsletter-deps.mts';

export default async () => {
  const deps = liveDeps();
  if (!deps) return new Response('Server misconfiguration', { status: 500 });
  const report = await runAutomatic(deps);
  console.log('[newsletter-auto]', JSON.stringify(report));
  return new Response(JSON.stringify(report), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

export const config = { schedule: '*/15 * * * *' };
