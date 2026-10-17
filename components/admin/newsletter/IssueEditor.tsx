'use client';

// One issue in the Newsletter tab (spec §6.2, §8.1). The fields are on the
// left and the live preview on the right, with Save, Send test and Send to
// subscribers; a sent issue is read-only. Unsaved edits are also kept in this
// browser until they are saved, so a closed tab, or a switch to another
// dashboard tab, doesn't lose them.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  ImagePlus,
  Loader2,
  RefreshCw,
  Save,
  Send,
  Trash2,
} from 'lucide-react';
import type { BodyDoc } from '@/lib/newsletter/content';
import { ISSUE_LIMITS, draftKey, sendProblems, toDraft, type IssueRow } from '@/lib/newsletter/issue';
import { uploadIssueImage } from '@/lib/newsletter/issue-image';
import {
  IssueApiError,
  UnauthorizedError,
  checkIssue,
  deleteIssue,
  getIssue,
  saveIssue,
  sendIssue,
  sendTestIssue,
  syncUntilDone,
  type IssueContext,
  type IssueDraftInput,
} from '@/lib/newsletter-admin';
import BodyEditor from './BodyEditor';
import IssuePreview, { renderPreview } from './IssuePreview';
import { SendDialog, TestSendDialog } from './IssueSendDialogs';
import { ISSUE_STATUS } from './issue-status';

export interface IssueEditorProps {
  token: string;
  id: string;
  onClose: () => void;
  onUnauthorized: () => void;
  /** Tells the tab whether leaving now would lose unsaved changes. */
  onDirtyChange?: (dirty: boolean) => void;
}

type Busy = '' | 'saving' | 'uploading' | 'testing' | 'syncing' | 'sending' | 'checking' | 'deleting';

/** Unsaved edits kept in this browser, tied to the version they were made on. */
interface Backup {
  version: string;
  draft: IssueDraftInput;
  at: string;
}

const backupKey = (id: string) => `newsletter-issue-draft:${id}`;

function readBackup(id: string): Backup | null {
  try {
    const raw = window.localStorage.getItem(backupKey(id));
    return raw ? (JSON.parse(raw) as Backup) : null;
  } catch {
    return null;
  }
}

function writeBackup(id: string, backup: Backup | null): void {
  try {
    if (backup) window.localStorage.setItem(backupKey(id), JSON.stringify(backup));
    else window.localStorage.removeItem(backupKey(id));
  } catch {
    // Storage blocked or full: the warning on leaving still protects the edits.
  }
}

const field =
  'w-full rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2.5 text-sm outline-none transition focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20 disabled:cursor-not-allowed disabled:opacity-70';
const labelClass = 'mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-500';
const barButton =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 px-3 py-2 text-xs font-medium text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-50 sm:px-4 sm:text-sm';
const primaryButton =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-[#ED7428] px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-[#ED7428]/20 transition hover:bg-[#d4651f] disabled:opacity-50 sm:px-4 sm:text-sm';
const smallButton =
  'inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold transition hover:bg-gray-50 disabled:opacity-50';

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

function HeroThumb({ src, alt }: { src: string; alt: string }) {
  // A plain img: the photo is in Supabase Storage, which next/image isn't set up for.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className="mb-2 max-h-48 w-full rounded-xl object-cover" />;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

const plural = (n: number | null) => (n === 1 ? '' : 's');

export default function IssueEditor({ token, id, onClose, onUnauthorized, onDirtyChange }: IssueEditorProps) {
  const [issue, setIssue] = useState<IssueRow | null>(null);
  const [about, setAbout] = useState<IssueContext | null>(null);
  const [draft, setDraft] = useState<IssueDraftInput | null>(null);
  const [bodyKey, setBodyKey] = useState(0);
  const [offer, setOffer] = useState<Backup | null>(null);
  const [busy, setBusy] = useState<Busy>('');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState<'' | 'test' | 'send'>('');
  const [previewSource, setPreviewSource] = useState<IssueDraftInput | null>(null);
  const heroInput = useRef<HTMLInputElement>(null);

  const report = useCallback(
    (e: unknown, fallback: string) => {
      if (e instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      setProblems(e instanceof IssueApiError ? e.problems : []);
      setError(e instanceof Error ? e.message : fallback);
    },
    [onUnauthorized],
  );

  /** Shows an issue the server sent, with its fields as the draft. */
  const adopt = useCallback((next: IssueRow) => {
    setIssue(next);
    setDraft(toDraft(next));
    setBodyKey((key) => key + 1);
  }, []);

  const load = useCallback(async () => {
    setError('');
    setConflict(false);
    try {
      const detail = await getIssue(token, id);
      adopt(detail.issue);
      setAbout({ me: detail.me, from: detail.from, subscribed: detail.subscribed });
      const backup = readBackup(id);
      const usable =
        backup &&
        backup.version === detail.issue.updated_at &&
        detail.issue.status === 'draft' &&
        draftKey(backup.draft) !== draftKey(toDraft(detail.issue));
      if (usable) setOffer(backup);
      else if (backup) writeBackup(id, null);
    } catch (e) {
      report(e, "The issue didn't load.");
    }
  }, [token, id, adopt, report]);

  useEffect(() => {
    load();
  }, [load]);

  const readOnly = !issue || issue.status !== 'draft';
  const dirty = Boolean(issue && draft && !readOnly && draftKey(draft) !== draftKey(toDraft(issue)));

  // Keep unsaved edits in this browser, and warn before they could be lost.
  useEffect(() => {
    if (!issue || !draft || readOnly || offer) return;
    if (!dirty) {
      writeBackup(id, null);
      return;
    }
    const timer = setTimeout(() => writeBackup(id, { version: issue.updated_at, draft, at: new Date().toISOString() }), 800);
    return () => clearTimeout(timer);
  }, [id, issue, draft, dirty, readOnly, offer]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // The preview follows the fields, a moment after typing stops.
  useEffect(() => {
    if (!draft) return;
    const timer = setTimeout(() => setPreviewSource(draft), 250);
    return () => clearTimeout(timer);
  }, [draft]);
  const preview = useMemo(
    () => (previewSource && issue ? renderPreview({ ...issue, ...previewSource }) : null),
    [previewSource, issue],
  );
  const blockers = useMemo(
    () =>
      preview && previewSource && about
        ? sendProblems({
            issue: previewSource,
            html: preview.sendHtml,
            bytes: preview.bytes,
            subscribed: about.subscribed,
            imagePrefixes: preview.imagePrefixes,
          })
        : [],
    [preview, previewSource, about],
  );

  const update = <K extends keyof IssueDraftInput>(key: K, value: IssueDraftInput[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  const onBody = useCallback((body: BodyDoc) => setDraft((current) => (current ? { ...current, body } : current)), []);
  const uploadBodyImage = useCallback((file: File) => uploadIssueImage(token, id, file), [token, id]);

  async function save(): Promise<IssueRow | null> {
    if (!issue || !draft) return null;
    setBusy('saving');
    setError('');
    setProblems([]);
    setNotice('');
    try {
      const saved = await saveIssue(token, issue.id, draft, issue.updated_at);
      setIssue(saved);
      writeBackup(id, null);
      setNotice('Saved.');
      return saved;
    } catch (e) {
      if (e instanceof IssueApiError && e.status === 409 && e.issue) {
        // Someone else saved meanwhile: keep this version, so another Save can't overwrite theirs.
        if (e.issue.status === 'draft') setConflict(true);
        else adopt(e.issue);
      }
      report(e, 'Save failed.');
      return null;
    } finally {
      setBusy('');
    }
  }

  // Errors show on the page, under the dialogs, so every failure closes its dialog.
  async function runTest(to: string[]) {
    const saved = dirty ? await save() : issue;
    if (!saved) {
      setDialog('');
      return;
    }
    setBusy('testing');
    setError('');
    setNotice('');
    try {
      const sentTo = await sendTestIssue(token, saved.id, to);
      setNotice(`Test sent to ${sentTo.join(', ')}.`);
      setDialog('');
    } catch (e) {
      setDialog('');
      report(e, "The test didn't send.");
    } finally {
      setBusy('');
    }
  }

  async function openSend() {
    setDialog('send');
    try {
      const detail = await getIssue(token, id);
      setAbout({ me: detail.me, from: detail.from, subscribed: detail.subscribed });
    } catch {
      // The count from when the issue opened is still shown.
    }
  }

  async function runSend() {
    const saved = dirty ? await save() : issue;
    if (!saved) {
      setDialog('');
      return;
    }
    setError('');
    setProblems([]);
    setNotice('');
    try {
      setBusy('syncing');
      setProgress('Checking the list with Resend…');
      const sync = await syncUntilDone(token, (p) =>
        setProgress(p.remaining > 0 ? `Checking the list with Resend… ${p.remaining} left` : 'Checking the list with Resend…'),
      );
      if (sync.remaining > 0) {
        const said = sync.errors.length > 0 ? ` Resend said: ${sync.errors.join('; ')}.` : '';
        const changes = sync.remaining === 1 ? "1 subscriber change hasn't" : `${sync.remaining} subscriber changes haven't`;
        setError(`${changes} reached Resend, so nothing was sent.${said} Fix them on the Subscribers screen, then try again.`);
        setDialog('');
        return;
      }
      setBusy('sending');
      setProgress('Sending…');
      const result = await sendIssue(token, saved.id);
      adopt(result.issue);
      setDialog('');
      const count = result.issue.recipient_count;
      setNotice(result.warning ?? `Sent to ${count ?? 'every'} subscriber${plural(count)}.`);
    } catch (e) {
      if (e instanceof IssueApiError && e.issue) adopt(e.issue);
      setDialog('');
      report(e, "The newsletter wasn't sent.");
    } finally {
      setBusy('');
      setProgress('');
    }
  }

  async function runCheck() {
    if (!issue) return;
    setBusy('checking');
    setError('');
    setNotice('');
    try {
      const result = await checkIssue(token, issue.id);
      adopt(result.issue);
      setNotice(
        result.found
          ? 'Resend sent it, so the issue is now marked sent.'
          : "Resend has no record of it, so nothing went out. It's a draft again.",
      );
    } catch (e) {
      if (e instanceof IssueApiError && e.issue) adopt(e.issue);
      report(e, 'Check failed.');
    } finally {
      setBusy('');
    }
  }

  async function runDelete() {
    if (!issue || !window.confirm("Delete this draft? This can't be undone.")) return;
    setBusy('deleting');
    try {
      await deleteIssue(token, issue.id);
      writeBackup(id, null);
      onClose();
    } catch (e) {
      report(e, 'Delete failed.');
      setBusy('');
    }
  }

  function back() {
    if (dirty) {
      if (!window.confirm('You have unsaved changes. Leave without saving?')) return;
      writeBackup(id, null);
    }
    onClose();
  }

  async function uploadHero(file: File | undefined) {
    if (heroInput.current) heroInput.current.value = '';
    if (!file || !issue) return;
    setBusy('uploading');
    setError('');
    try {
      update('hero_image_url', await uploadIssueImage(token, issue.id, file));
    } catch (e) {
      report(e, "The photo didn't upload.");
    } finally {
      setBusy('');
    }
  }

  function restore() {
    if (!offer) return;
    setDraft(offer.draft);
    setBodyKey((key) => key + 1);
    setOffer(null);
  }

  function discard() {
    writeBackup(id, null);
    setOffer(null);
  }

  if (!issue || !draft) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-6 text-sm text-gray-600 shadow-sm">
        {error ? (
          <>
            <AlertTriangle className="h-4 w-4 text-red-600" /> {error}
            <button type="button" onClick={onClose} className="font-semibold underline">
              Back to issues
            </button>
          </>
        ) : (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Loading the issue…
          </>
        )}
      </div>
    );
  }

  const status = ISSUE_STATUS[issue.status];
  const working = busy !== '';

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-[#00373E] to-[#024a53] p-4 shadow-sm sm:p-5 lg:flex-row lg:items-center lg:gap-4">
        <button type="button" onClick={back} className={barButton}>
          <ArrowLeft className="h-4 w-4" />
          Issues
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-bold text-white sm:text-lg">{draft.subject.trim() || 'Untitled issue'}</h2>
          <p className="text-xs text-white/60 sm:text-sm">
            <span className={`mr-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.className}`}>{status.label}</span>
            {dirty ? 'Unsaved changes' : readOnly ? 'Read-only' : 'All changes saved'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {issue.status === 'draft' && (
            <>
              <button type="button" onClick={runDelete} disabled={working} className={barButton}>
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
              <button type="button" onClick={() => save()} disabled={!dirty || working} className={barButton}>
                {busy === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </button>
            </>
          )}
          <button type="button" onClick={() => setDialog('test')} disabled={working} className={barButton}>
            <Send className="h-4 w-4" />
            Send test
          </button>
          {issue.status === 'draft' && (
            <button type="button" onClick={openSend} disabled={working || blockers.length > 0} className={primaryButton}>
              <Send className="h-4 w-4" />
              Send to subscribers
            </button>
          )}
        </div>
      </div>

      {offer && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <span className="flex-1">This browser kept changes you hadn&apos;t saved, from {formatDateTime(offer.at)}.</span>
          <button type="button" onClick={restore} className="font-semibold underline">
            Restore them
          </button>
          <button type="button" onClick={discard} className="underline">
            Discard
          </button>
        </div>
      )}
      {error && (
        <div role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </p>
          {problems.length > 1 && (
            <ul className="mt-2 list-disc pl-10">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {conflict && (
            <button type="button" onClick={load} className="mt-2 inline-flex items-center gap-1.5 font-semibold underline">
              <RefreshCw className="h-4 w-4" />
              Reload
            </button>
          )}
        </div>
      )}
      {notice && !error && (
        <div role="status" className="mb-4 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}
      {issue.status === 'sent' && (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-gray-700">
          Sent to {issue.recipient_count ?? 'every'} subscriber{plural(issue.recipient_count)} on {formatDateTime(issue.sent_at)}
          {issue.sent_by ? ` by ${issue.sent_by}` : ''}. A sent issue can&apos;t be changed.
          {issue.resend_broadcast_id && (
            <a
              href={`https://resend.com/broadcasts/${issue.resend_broadcast_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 inline-flex items-center gap-1 font-semibold text-[#ED7428] hover:underline"
            >
              Opens and clicks in Resend
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      )}
      {(issue.status === 'needs_check' || issue.status === 'sending') && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            {issue.status === 'needs_check'
              ? issue.last_error
              : "This issue is being sent. If that doesn't change within two minutes, press Check status."}
          </span>
          <button type="button" onClick={runCheck} disabled={working} className={smallButton}>
            {busy === 'checking' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Check status
          </button>
        </div>
      )}
      {issue.status === 'draft' && issue.last_error && !error && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          The last send didn&apos;t go out: {issue.last_error}
        </div>
      )}
      {issue.status === 'draft' && blockers.length > 0 && (
        <div className="mb-4 rounded-2xl bg-white px-4 py-3 text-sm text-gray-600 shadow-sm">
          <p className="font-semibold text-gray-800">Before this can be sent:</p>
          <ul className="mt-1 list-disc pl-5">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="space-y-4 rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <Field id="nl-subject" label="Subject" hint={`${draft.subject.length} of ${ISSUE_LIMITS.subject} characters`}>
            <input
              id="nl-subject"
              type="text"
              value={draft.subject}
              maxLength={ISSUE_LIMITS.subject}
              disabled={readOnly}
              onChange={(e) => update('subject', e.target.value)}
              className={field}
            />
          </Field>
          <Field
            id="nl-preheader"
            label="Inbox preview text"
            hint="Optional: the grey line after the subject in most inboxes. Left empty, it's the start of the body."
          >
            <input
              id="nl-preheader"
              type="text"
              value={draft.preheader}
              maxLength={ISSUE_LIMITS.preheader}
              disabled={readOnly}
              onChange={(e) => update('preheader', e.target.value)}
              className={field}
            />
          </Field>
          <Field id="nl-date" label="Date">
            <input
              id="nl-date"
              type="date"
              value={draft.issue_date}
              disabled={readOnly}
              onChange={(e) => update('issue_date', e.target.value)}
              className={field}
            />
          </Field>
          <Field id="nl-title" label="Title" hint="Shown in the orange banner over the photo.">
            <textarea
              id="nl-title"
              rows={2}
              value={draft.title}
              maxLength={ISSUE_LIMITS.title}
              disabled={readOnly}
              onChange={(e) => update('title', e.target.value)}
              className={field}
            />
          </Field>
          <div>
            <p className={labelClass}>Hero photo</p>
            {draft.hero_image_url ? (
              <HeroThumb src={draft.hero_image_url} alt={draft.hero_image_alt} />
            ) : (
              <div className="mb-2 flex h-24 items-center justify-center rounded-xl border border-dashed border-gray-300 text-xs text-gray-400">
                No photo yet
              </div>
            )}
            {!readOnly && (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => heroInput.current?.click()} disabled={working} className={smallButton}>
                  {busy === 'uploading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  {draft.hero_image_url ? 'Replace photo' : 'Upload photo'}
                </button>
                {draft.hero_image_url && (
                  <button type="button" onClick={() => update('hero_image_url', null)} className={smallButton}>
                    Remove
                  </button>
                )}
                <input
                  ref={heroInput}
                  type="file"
                  accept="image/*"
                  hidden
                  aria-label="Choose the hero photo"
                  onChange={(e) => uploadHero(e.target.files?.[0])}
                />
              </div>
            )}
            <div className="mt-3">
              <Field
                id="nl-hero-alt"
                label="Photo description (alt text)"
                hint="For people who can't see images, and for inboxes that block them."
              >
                <input
                  id="nl-hero-alt"
                  type="text"
                  value={draft.hero_image_alt}
                  maxLength={ISSUE_LIMITS.heroAlt}
                  disabled={readOnly}
                  onChange={(e) => update('hero_image_alt', e.target.value)}
                  className={field}
                />
              </Field>
            </div>
          </div>
          <div>
            <p className={labelClass}>Body</p>
            <BodyEditor key={bodyKey} initial={draft.body} readOnly={readOnly} onChange={onBody} onUploadImage={uploadBodyImage} />
          </div>
          <Field
            id="nl-share"
            label="Blog link for the Share button"
            hint="Optional. The Share button sends this link on WhatsApp. Left empty, it's the blog page."
          >
            <input
              id="nl-share"
              type="url"
              value={draft.share_url ?? ''}
              placeholder="https://hopetrustindia.com/blogs/"
              disabled={readOnly}
              onChange={(e) => update('share_url', e.target.value || null)}
              className={field}
            />
          </Field>
        </div>
        <div className="xl:sticky xl:top-4 xl:self-start">
          {preview ? (
            <IssuePreview html={preview.html} bytes={preview.bytes} />
          ) : (
            <div className="rounded-2xl bg-white p-6 text-sm text-gray-400 shadow-sm">Preparing the preview…</div>
          )}
        </div>
      </div>

      {dialog === 'test' && about && (
        <TestSendDialog
          defaultTo={about.me}
          busy={busy === 'testing' || busy === 'saving'}
          onSend={runTest}
          onClose={() => setDialog('')}
        />
      )}
      {dialog === 'send' && about && (
        <SendDialog
          subject={draft.subject}
          from={about.from}
          subscribed={about.subscribed}
          busy={busy === 'saving' || busy === 'syncing' || busy === 'sending'}
          progress={progress}
          onSend={runSend}
          onClose={() => setDialog('')}
        />
      )}
    </div>
  );
}
