// How each issue status looks in the Newsletter tab (spec §8.1).
import type { IssueStatus } from '@/lib/newsletter/issue';

export const ISSUE_STATUS: Record<IssueStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-700' },
  sending: { label: 'Sending', className: 'bg-sky-100 text-sky-800' },
  sent: { label: 'Sent', className: 'bg-emerald-100 text-emerald-800' },
  needs_check: { label: 'Needs check', className: 'bg-amber-100 text-amber-800' },
  scheduled: { label: 'Scheduled', className: 'bg-violet-100 text-violet-800' },
  skipped: { label: 'Skipped', className: 'bg-gray-100 text-gray-500' },
  missed: { label: 'Missed', className: 'bg-rose-100 text-rose-800' },
};
