// /api/admin-newsletter-subscribers: list, export, import, sync, unsubscribe
// and delete newsletter subscribers (spec §8.2, §11). Admin JWT required.
import { liveDeps } from './_shared/newsletter-deps.mts';
import { handleAdminSubscribers } from './_shared/newsletter-admin.mts';

export default (req: Request) => handleAdminSubscribers(req, liveDeps());
