'use client';

// The Issues screen of the Newsletter tab (spec §8.1): every issue, newest
// first, with its status. New issue starts a draft and opens it.

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, FilePlus2, Loader2 } from 'lucide-react';
import { UnauthorizedError, createIssue, listIssues, type IssueList } from '@/lib/newsletter-admin';
import { formatIssueDate } from '@/lib/newsletter/render';
import { formatSlot } from '@/lib/newsletter/schedule';
import { ISSUE_STATUS } from './issue-status';
import { formatDate } from './SubscribersScreen';

export interface IssuesScreenProps {
  token: string;
  onUnauthorized: () => void;
  onOpen: (id: string) => void;
}

function issueDate(iso: string): string {
  try {
    return formatIssueDate(iso);
  } catch {
    return iso;
  }
}

export default function IssuesScreen({ token, onUnauthorized, onOpen }: IssuesScreenProps) {
  const [data, setData] = useState<IssueList | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const fail = useCallback(
    (e: unknown, fallback: string) => {
      if (e instanceof UnauthorizedError) onUnauthorized();
      else setError(e instanceof Error ? e.message : fallback);
    },
    [onUnauthorized],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await listIssues(token));
    } catch (e) {
      fail(e, "The issues didn't load.");
    } finally {
      setLoading(false);
    }
  }, [token, fail]);

  useEffect(() => {
    load();
  }, [load]);

  async function newIssue() {
    setCreating(true);
    setError('');
    try {
      const issue = await createIssue(token);
      onOpen(issue.id);
    } catch (e) {
      fail(e, "A new issue couldn't be started.");
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-[#00373E] to-[#024a53] p-4 shadow-sm sm:flex-row sm:items-center sm:p-5">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-white sm:text-lg">Newsletter issues</h2>
          <p className="text-xs text-white/60 sm:text-sm">
            {data ? `${data.subscribed} subscribed · sent from ${data.from}` : 'Loading…'}
          </p>
        </div>
        <button
          type="button"
          onClick={newIssue}
          disabled={creating}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#ED7428] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-[#ED7428]/20 transition hover:bg-[#d4651f] disabled:opacity-60"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
          New issue
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-gray-100 text-[11px] uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Subject</th>
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Recipients</th>
              <th className="px-4 py-3 font-semibold">Sent on</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading && !data ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : data && data.issues.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                  No issues yet. Press New issue to write the first one.
                </td>
              </tr>
            ) : (
              // The scheduled newsletter comes first: it's the next thing that goes out.
              data?.issues
                .slice()
                .sort((a, b) => Number(b.status === 'scheduled') - Number(a.status === 'scheduled'))
                .map((issue) => {
                const status = ISSUE_STATUS[issue.status];
                return (
                  <tr key={issue.id} className="hover:bg-[#F7F6F4]/60">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onOpen(issue.id)}
                        className="text-left font-semibold text-[#00373E] hover:text-[#ED7428] hover:underline"
                      >
                        {issue.subject.trim() || '(no subject)'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{issueDate(issue.issue_date)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.className}`}>
                        {issue.status === 'scheduled' && issue.scheduled_for
                          ? `${status.label} · ${formatSlot(new Date(issue.scheduled_for))}`
                          : status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{issue.recipient_count ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(issue.sent_at)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
