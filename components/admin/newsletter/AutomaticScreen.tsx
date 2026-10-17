'use client';

// The Automatic screen of the Newsletter tab (fortnightly spec §5.1): switch The
// Hope Letter's fortnightly blog newsletter on or off, choose its first Tuesday
// and who gets the preview, and set the optional book panel. It shows the next
// preview, the next send and the post in line, or why it won't go out.

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, Loader2, Save } from 'lucide-react';
import { formatSlot } from '@/lib/newsletter/schedule';
import { MAX_PREVIEW_RECIPIENTS, type NewsletterSettings } from '@/lib/newsletter/settings';
import { UnauthorizedError, getSettings, saveSettings, type AutomaticNext, type SettingsReply } from '@/lib/newsletter-admin';
import { parseAddresses } from './IssueSendDialogs';

export interface AutomaticScreenProps {
  token: string;
  onUnauthorized: () => void;
}

/** The client's sample panel (docs/design/newsletter-2026-10-17-hope-letter.html). */
const SAMPLE_PANEL = {
  panel_eyebrow: 'From Rahul Luther',
  panel_title: 'I, Bhogi',
  panel_text: 'A memoir of addiction, recovery and a life of purpose.',
  panel_link_text: 'Discover the book →',
};

const field =
  'w-full rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2.5 text-sm outline-none transition focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20';
const labelClass = 'mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-500';
const card = 'space-y-4 rounded-2xl bg-white p-4 shadow-sm sm:p-5';

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function Switch({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${checked ? 'bg-[#00373E]' : 'bg-gray-300'}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

const at10 = (iso: string) => `${formatSlot(new Date(iso))}, 10:00 am`;

export default function AutomaticScreen({ token, onUnauthorized }: AutomaticScreenProps) {
  const [form, setForm] = useState<NewsletterSettings | null>(null);
  /** The settings as last saved: what the automatic send goes by. */
  const [saved, setSaved] = useState<NewsletterSettings | null>(null);
  const [recipients, setRecipients] = useState('');
  const [next, setNext] = useState<AutomaticNext | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const fail = useCallback(
    (e: unknown, fallback: string) => {
      if (e instanceof UnauthorizedError) onUnauthorized();
      else setError(e instanceof Error ? e.message : fallback);
    },
    [onUnauthorized],
  );

  const adopt = useCallback((reply: SettingsReply) => {
    setForm(reply.settings);
    setSaved(reply.settings);
    setRecipients(reply.settings.preview_recipients.join(', '));
    setNext(reply.next);
  }, []);

  useEffect(() => {
    getSettings(token)
      .then(adopt)
      .catch((e: unknown) => fail(e, "The settings didn't load."));
  }, [token, adopt, fail]);

  const set = <K extends keyof NewsletterSettings>(key: K, value: NewsletterSettings[K]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));

  function togglePanel() {
    setForm((current) => {
      if (!current) return current;
      const on = !current.panel_enabled;
      const empty = !current.panel_eyebrow && !current.panel_title && !current.panel_text && !current.panel_link_text;
      return { ...current, panel_enabled: on, ...(on && empty ? SAMPLE_PANEL : {}) };
    });
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      adopt(await saveSettings(token, { ...form, preview_recipients: parseAddresses(recipients) }));
      setNotice('Saved.');
    } catch (e) {
      fail(e, "The settings weren't saved.");
    } finally {
      setBusy(false);
    }
  }

  if (!form || !saved) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-white p-6 text-sm text-gray-600 shadow-sm">
        {error ? (
          <>
            <AlertTriangle className="h-4 w-4 text-red-600" /> {error}
          </>
        ) : (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Loading the settings…
          </>
        )}
      </div>
    );
  }

  const unsaved = JSON.stringify(form) !== JSON.stringify(saved) || recipients !== saved.preview_recipients.join(', ');

  return (
    <div>
      <div className="mb-6 rounded-2xl bg-gradient-to-r from-[#00373E] to-[#024a53] p-4 shadow-sm sm:p-5">
        <h2 className="text-base font-bold text-white sm:text-lg">Automatic newsletter</h2>
        <p className="text-xs text-white/60 sm:text-sm">
          Every other Tuesday at 10:00 am India time, the newest blog post not sent yet goes to every subscriber as The Hope
          Letter. The preview list gets it two days before, and can change, swap or skip it in Issues.
        </p>
      </div>

      {error && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && !error && (
        <div role="status" className="mb-4 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className={card}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className={labelClass}>Automatic sending</p>
              <p className="text-lg font-bold text-[#00373E]">{saved.auto_enabled ? 'On' : 'Off'}</p>
              {form.auto_enabled !== saved.auto_enabled && (
                <p className="text-xs font-semibold text-amber-700">
                  {`Not saved yet: it stays ${saved.auto_enabled ? 'on' : 'off'} until you press Save settings.`}
                </p>
              )}
            </div>
            <Switch label="Automatic sending" checked={form.auto_enabled} onToggle={() => set('auto_enabled', !form.auto_enabled)} />
          </div>
          <Field id="nl-first-date" label="First send date" hint="A Tuesday. From then on it goes out every other Tuesday at 10:00 am India time.">
            <input
              id="nl-first-date"
              type="date"
              value={form.first_send_date ?? ''}
              onChange={(e) => set('first_send_date', e.target.value || null)}
              className={field}
            />
          </Field>
          <Field
            id="nl-preview-to"
            label="Preview recipients"
            hint={`Up to ${MAX_PREVIEW_RECIPIENTS} addresses, separated by commas. They also get a short note when it sends, skips or fails.`}
          >
            <input id="nl-preview-to" type="text" value={recipients} onChange={(e) => setRecipients(e.target.value)} className={field} />
          </Field>
        </section>

        <section className={card}>
          <p className={labelClass}>Next</p>
          {next ? (
            <div className="space-y-2 text-sm text-gray-700">
              <p className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-[#ED7428]" />
                {`Next preview: ${at10(next.preview_at)}`}
              </p>
              <p className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-[#ED7428]" />
                {`Next send: ${at10(next.send_at)}`}
              </p>
              {next.post && (
                <p>
                  Post in line: <span className="font-semibold text-[#00373E]">{next.post.title}</span>
                </p>
              )}
              {next.blocked && <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900">{next.blocked}</p>}
              {!saved.auto_enabled && <p className="text-gray-500">Automatic sending is off, so nothing goes out until it&apos;s switched on.</p>}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Choose a first send date and save to see the next send.</p>
          )}
        </section>
      </div>

      <section className={`${card} mb-6`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className={labelClass}>Book panel</p>
            <p className="text-sm text-gray-600">An optional panel for a book or resource, shown in every newsletter while it&apos;s on.</p>
          </div>
          <Switch label="Book panel" checked={form.panel_enabled} onToggle={togglePanel} />
        </div>
        {form.panel_enabled && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="nl-panel-eyebrow" label="Panel eyebrow">
              <input id="nl-panel-eyebrow" type="text" maxLength={80} value={form.panel_eyebrow} onChange={(e) => set('panel_eyebrow', e.target.value)} className={field} />
            </Field>
            <Field id="nl-panel-title" label="Panel title">
              <input id="nl-panel-title" type="text" maxLength={80} value={form.panel_title} onChange={(e) => set('panel_title', e.target.value)} className={field} />
            </Field>
            <Field id="nl-panel-text" label="Panel text">
              <input id="nl-panel-text" type="text" maxLength={200} value={form.panel_text} onChange={(e) => set('panel_text', e.target.value)} className={field} />
            </Field>
            <Field id="nl-panel-link-text" label="Panel link text">
              <input id="nl-panel-link-text" type="text" maxLength={40} value={form.panel_link_text} onChange={(e) => set('panel_link_text', e.target.value)} className={field} />
            </Field>
            <Field id="nl-panel-url" label="Panel link" hint="Where the link goes, such as https://…">
              <input id="nl-panel-url" type="url" value={form.panel_url} onChange={(e) => set('panel_url', e.target.value)} className={field} />
            </Field>
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#ED7428] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#ED7428]/20 transition hover:bg-[#d4651f] disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save settings
      </button>
      {unsaved && <p className="mt-2 text-sm font-semibold text-amber-700">You have changes that aren&apos;t saved.</p>}
    </div>
  );
}
