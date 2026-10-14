'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  UserMinus,
} from 'lucide-react';
import {
  UnauthorizedError,
  deleteSubscriber,
  downloadSubscribersCsv,
  fetchSubscribers,
  syncUntilDone,
  unsubscribeSubscriber,
  type SubscriberList,
  type SyncResult,
} from '@/lib/newsletter-admin';
import type { AdminSubscriber, SubscriberSource, SubscriberStatus } from '@/lib/newsletter/subscriber';
import ImportDialog from './ImportDialog';

const PAGE_SIZE = 25;

const STATUS_META: Record<SubscriberStatus, { label: string; className: string }> = {
  subscribed: { label: 'Subscribed', className: 'bg-emerald-100 text-emerald-800' },
  pending: { label: 'Not confirmed yet', className: 'bg-amber-100 text-amber-800' },
  unsubscribed: { label: 'Unsubscribed', className: 'bg-gray-100 text-gray-700' },
};
const SOURCE_LABEL: Record<SubscriberSource, string> = { website: 'Website', import: 'Imported' };

const field =
  'w-full rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2.5 text-sm outline-none transition focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20';
const filterLabel = 'mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-500';
const barButton =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 px-3 py-2 text-xs font-medium text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-60 sm:px-4 sm:text-sm';
const rowButton =
  'inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold transition hover:bg-gray-50 disabled:opacity-40';

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

/** One sentence about a finished sync, for the screen. */
export function syncSummary(r: SyncResult): string {
  const parts: string[] = [];
  if (r.pushed) parts.push(`sent ${r.pushed} change${r.pushed === 1 ? '' : 's'} to Resend`);
  if (r.unsubscribedInResend) parts.push(`${r.unsubscribedInResend} unsubscribed from an email`);
  if (r.removedFromSegment) parts.push(`${r.removedFromSegment} with no consent on record taken out of Resend's list`);
  if (r.remaining) parts.push(`${r.remaining} still waiting`);
  if (parts.length === 0) return 'Resend is up to date.';
  const text = parts.join('; ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

function detail(s: AdminSubscriber): string {
  if (s.status === 'unsubscribed') {
    const how = s.unsubscribe_source === 'admin' ? 'by staff' : s.unsubscribe_source === 'resend' ? 'from an email' : '';
    return ['unsubscribed', how, s.unsubscribed_at ? formatDate(s.unsubscribed_at) : ''].filter(Boolean).join(' ');
  }
  return s.consent_at ? `agreed ${formatDate(s.consent_at)}` : `signed up ${formatDate(s.created_at)}`;
}

export interface SubscribersScreenProps {
  token: string;
  onUnauthorized: () => void;
}

/** The Subscribers screen of the Newsletter tab (spec §8.2). */
export default function SubscribersScreen({ token, onUnauthorized }: SubscribersScreenProps) {
  const [status, setStatus] = useState<SubscriberStatus | ''>('');
  const [source, setSource] = useState<SubscriberSource | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<SubscriberList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncLabel, setSyncLabel] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // Search as the admin types, without a request on every key.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(searchInput.trim());
      setPage(0);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const query = useMemo(() => ({ q, status, source, limit: PAGE_SIZE, offset: page * PAGE_SIZE }), [q, status, source, page]);

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
      setData(await fetchSubscribers(token, query));
    } catch (e) {
      fail(e, 'Failed to load subscribers');
    } finally {
      setLoading(false);
    }
  }, [token, query, fail]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSync() {
    setSyncLabel('Syncing…');
    setError('');
    setNotice('');
    try {
      const result = await syncUntilDone(token, (p) => setSyncLabel(`Syncing… ${p.remaining} left`));
      setNotice(syncSummary(result));
      if (result.errors.length > 0) setError(`Some changes didn't reach Resend: ${result.errors.join('; ')}`);
      await load();
    } catch (e) {
      fail(e, 'Sync failed');
    } finally {
      setSyncLabel(null);
    }
  }

  async function act(s: AdminSubscriber, question: string, run: () => Promise<unknown>, done: string, fallback: string) {
    if (!window.confirm(question)) return;
    setBusyId(s.id);
    setError('');
    setNotice('');
    try {
      await run();
      setNotice(done);
      await load();
    } catch (e) {
      fail(e, fallback);
    } finally {
      setBusyId(null);
    }
  }

  const handleUnsubscribe = (s: AdminSubscriber) =>
    act(
      s,
      `Unsubscribe ${s.email}? They won't get any more newsletters unless they sign up again on the website.`,
      () => unsubscribeSubscriber(token, s.id),
      `${s.email} is unsubscribed.`,
      'Unsubscribe failed',
    );

  const handleDelete = (s: AdminSubscriber) =>
    act(
      s,
      `Delete ${s.email} for good? Their details and consent record are removed here and in Resend. An import can't add them back; only signing up again on the website can.`,
      () => deleteSubscriber(token, s.id),
      `${s.email} was deleted.`,
      'Delete failed',
    );

  async function handleExport() {
    setExporting(true);
    setError('');
    try {
      await downloadSubscribersCsv(token, { q, status, source });
    } catch (e) {
      fail(e, 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = data?.subscribers ?? [];

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-[#00373E] to-[#024a53] p-4 shadow-sm sm:p-5 lg:flex-row lg:items-center lg:gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-white sm:text-lg">Newsletter subscribers</h2>
          <p className="text-xs text-white/60 sm:text-sm">
            {data
              ? `${data.counts.subscribed} subscribed · ${data.counts.pending} not confirmed yet · ${data.counts.unsubscribed} unsubscribed`
              : 'Loading…'}
            {data && data.needs_push > 0
              ? ` · ${data.needs_push} change${data.needs_push === 1 ? '' : 's'} waiting for Resend`
              : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={handleSync} disabled={syncLabel !== null} className={barButton}>
            <RefreshCw className={`h-4 w-4 ${syncLabel ? 'animate-spin' : ''}`} />
            {syncLabel ?? 'Sync with Resend'}
          </button>
          <button type="button" onClick={() => setImportOpen(true)} className={barButton}>
            <Upload className="h-4 w-4" />
            Import
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || total === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#ED7428] px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-[#ED7428]/20 transition hover:bg-[#d4651f] disabled:opacity-60 sm:px-4 sm:text-sm"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export CSV
          </button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 rounded-2xl bg-white p-4 shadow-sm sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label htmlFor="nl-search" className={filterLabel}>Search</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              id="nl-search"
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Name or email…"
              className={`${field} pl-9`}
            />
          </div>
        </div>
        <div>
          <label htmlFor="nl-status" className={filterLabel}>Status</label>
          <select
            id="nl-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as SubscriberStatus | '');
              setPage(0);
            }}
            className={field}
          >
            <option value="">All statuses</option>
            <option value="subscribed">Subscribed</option>
            <option value="pending">Not confirmed yet</option>
            <option value="unsubscribed">Unsubscribed</option>
          </select>
        </div>
        <div>
          <label htmlFor="nl-source" className={filterLabel}>Source</label>
          <select
            id="nl-source"
            value={source}
            onChange={(e) => {
              setSource(e.target.value as SubscriberSource | '');
              setPage(0);
            }}
            className={field}
          >
            <option value="">All sources</option>
            <option value="website">Website</option>
            <option value="import">Imported</option>
          </select>
        </div>
      </div>

      {notice && (
        <div role="status" className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          {notice}
        </div>
      )}
      {error && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        {loading && !data ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-[#ED7428]" />
            <p className="mt-3 text-sm text-gray-400">Loading subscribers…</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-lg font-semibold text-[#00373E]">No subscribers found</p>
            <p className="mt-1 text-sm text-gray-400">Website sign-ups and imports appear here.</p>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-gray-100">
              {rows.map((s) => (
                <li key={s.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-[#00373E]">{s.full_name || '—'}</p>
                    <p className="truncate text-xs text-gray-500">{s.email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 sm:w-80">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${STATUS_META[s.status].className}`}>
                      {STATUS_META[s.status].label}
                    </span>
                    <span>{SOURCE_LABEL[s.source]}</span>
                    <span>· {detail(s)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.status === 'subscribed' && (
                      <button
                        type="button"
                        onClick={() => handleUnsubscribe(s)}
                        disabled={busyId === s.id}
                        aria-label={`Unsubscribe ${s.email}`}
                        className={`${rowButton} text-[#00373E]`}
                      >
                        <UserMinus className="h-3.5 w-3.5" />
                        Unsubscribe
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(s)}
                      disabled={busyId === s.id}
                      aria-label={`Delete ${s.email}`}
                      className={`${rowButton} text-red-600`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex flex-col items-center justify-between gap-3 border-t border-gray-100 px-4 py-3 text-sm text-gray-600 sm:flex-row">
              <span className="text-xs sm:text-sm">
                Showing <strong>{page * PAGE_SIZE + 1}</strong>–<strong>{Math.min((page + 1) * PAGE_SIZE, total)}</strong> of{' '}
                <strong>{total}</strong>
              </span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className={`${rowButton} text-[#00373E]`}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Prev
                </button>
                <span className="px-2 text-xs">
                  Page {page + 1} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className={`${rowButton} text-[#00373E]`}
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {importOpen && (
        <ImportDialog token={token} onClose={() => setImportOpen(false)} onFinished={load} onUnauthorized={onUnauthorized} />
      )}
    </div>
  );
}
