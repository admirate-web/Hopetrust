// POST /api/newsletter-confirm: confirms a sign-up from the emailed link (spec §7.3).
import { liveDeps } from './_shared/newsletter-deps.mts';
import { handleConfirm } from './_shared/newsletter-signup.mts';

export default (req: Request) => handleConfirm(req, liveDeps());
