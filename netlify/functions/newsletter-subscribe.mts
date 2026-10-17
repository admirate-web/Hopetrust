// POST /api/newsletter-subscribe: public newsletter sign-up (spec §7.2).
import { liveDeps } from './_shared/newsletter-deps.mts';
import { handleSubscribe } from './_shared/newsletter-signup.mts';

export default (req: Request) => handleSubscribe(req, liveDeps());
