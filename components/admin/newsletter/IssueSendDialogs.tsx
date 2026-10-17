'use client';

// The two sending dialogs of the issue editor (spec §8.1): a test to up to five
// addresses, and the final send to every subscriber.

import { useEffect, useState, type ReactNode } from 'react';
import { Loader2, Send, X } from 'lucide-react';
import { ISSUE_LIMITS } from '@/lib/newsletter/issue';

const primary =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-[#ED7428] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#ED7428]/20 transition hover:bg-[#d4651f] disabled:opacity-50';
const secondary =
  'inline-flex items-center justify-center rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50';

export function Dialog({ title, busy, onClose, children }: { title: string; busy: boolean; onClose: () => void; children: ReactNode }) {
  // Escape closes the dialog, except while something is running.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="nl-dialog-title"
        className="relative w-full max-w-lg rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl sm:p-8"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
        >
          <X className="h-5 w-5" />
        </button>
        <h3 id="nl-dialog-title" className="mb-4 pr-8 text-lg font-bold text-[#00373E]">
          {title}
        </h3>
        {children}
      </div>
    </div>
  );
}

/** The addresses typed, separated by commas, semicolons, spaces or lines: lower-cased, once each. */
export function parseAddresses(text: string): string[] {
  const all = text
    .split(/[\s,;]+/)
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(all));
}

export function TestSendDialog({
  defaultTo,
  busy,
  onSend,
  onClose,
}: {
  defaultTo: string;
  busy: boolean;
  onSend: (to: string[]) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(defaultTo);
  const addresses = parseAddresses(text);
  const tooMany = addresses.length > ISSUE_LIMITS.testRecipients;
  return (
    <Dialog title="Send a test" busy={busy} onClose={onClose}>
      <label htmlFor="nl-test-to" className="mb-1 block text-sm font-medium text-gray-700">
        Send to (up to {ISSUE_LIMITS.testRecipients} addresses)
      </label>
      <textarea
        id="nl-test-to"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#ED7428] focus:ring-2 focus:ring-[#ED7428]/20"
      />
      <p className="mt-2 text-xs text-gray-500">The subject starts with [TEST]. In a test, Unsubscribe links to the website.</p>
      {tooMany && (
        <p role="alert" className="mt-2 text-xs font-medium text-red-700">
          That&apos;s more than {ISSUE_LIMITS.testRecipients} addresses.
        </p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={busy} className={secondary}>
          Cancel
        </button>
        <button type="button" onClick={() => onSend(addresses)} disabled={busy || addresses.length === 0 || tooMany} className={primary}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send test
        </button>
      </div>
    </Dialog>
  );
}

export function SendDialog({
  subject,
  from,
  subscribed,
  busy,
  progress,
  warning,
  onSend,
  onClose,
}: {
  subject: string;
  from: string;
  subscribed: number;
  busy: boolean;
  progress: string;
  /** Shown above the send button, e.g. that this send skips the next automatic newsletter. */
  warning?: string;
  onSend: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog title="Send to subscribers" busy={busy} onClose={onClose}>
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-gray-500">Subject</dt>
          <dd className="font-semibold text-gray-900">{subject}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-gray-500">From</dt>
          <dd className="text-gray-800">{from}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-gray-500">To</dt>
          <dd className="text-gray-800">{`${subscribed} subscriber${subscribed === 1 ? '' : 's'}`}</dd>
        </div>
      </dl>
      <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
        This can&apos;t be undone. Once it is sent, the issue can&apos;t be changed.
      </p>
      {warning && <p className="mt-3 rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-900">{warning}</p>}
      {progress && (
        <p role="status" className="mt-3 flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" /> {progress}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={busy} className={secondary}>
          Cancel
        </button>
        <button type="button" onClick={onSend} disabled={busy} className={primary}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send now
        </button>
      </div>
    </Dialog>
  );
}
