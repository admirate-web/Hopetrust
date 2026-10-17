// /api/admin-newsletter-issues: write, preview, test and send newsletter
// issues (spec §8.1, §9, §11). Admin JWT required.
import { liveDeps } from './_shared/newsletter-deps.mts';
import { handleAdminIssues } from './_shared/newsletter-issues.mts';

export default (req: Request) => handleAdminIssues(req, liveDeps());
