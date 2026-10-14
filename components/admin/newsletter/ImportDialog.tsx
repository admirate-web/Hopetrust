'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react';
import { IMPORT_CHUNK, chunk, cleanRows, guessColumns, pickColumns, splitHeader, type Sheet } from '@/lib/newsletter/import';
import { readSpreadsheet } from '@/lib/newsletter/read-spreadsheet';
import { UnauthorizedError, importSubscribers, syncUntilDone, type ImportResult, type SyncResult } from '@/lib/newsletter-admin';

type Step = 'choose' | 'review' | 'working' | 'done';

export interface ImportDialogProps {
  token: string;
  onClose: () => void;
  /** Called once rows may have been added, so the list reloads. */
  onFinished: () => void;
  onUnauthorized: () => void;
}

const field =
  'w-full rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2.5 text-sm outline-none transition focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20';
const label = 'mb-1 block text-xs font-semibold text-[#00373E]';
const secondary =
  'rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-[#00373E] transition hover:bg-gray-50 disabled:opacity-40';
const primary =
  'rounded-xl bg-[#ED7428] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#ED7428]/20 transition hover:bg-[#d4651f] disabled:cursor-not-allowed disabled:opacity-50';

/** Import subscribers from a spreadsheet (spec §7.4). */
export default function ImportDialog({ token, onClose, onFinished, onUnauthorized }: ImportDialogProps) {
  const [step, setStep] = useState<Step>('choose');
  const [fileName, setFileName] = useState('');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [emailCol, setEmailCol] = useState(0);
  const [nameCol, setNameCol] = useState<number | null>(null);
  const [statement, setStatement] = useState('');
  const [attested, setAttested] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  /** 0–1 for the progress bar: first the import chunks, then the sync. */
  const [progressValue, setProgressValue] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [sync, setSync] = useState<SyncResult | null>(null);

  const preview = sheet ? cleanRows(pickColumns(sheet, emailCol, nameCol)) : null;
  const ready = !!preview && preview.rows.length > 0 && statement.trim().length >= 10 && attested;
  const count = (n: number) => `${n} ${n === 1 ? 'address' : 'addresses'}`;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError('');
    try {
      const parsed = splitHeader(await readSpreadsheet(file));
      if (parsed.rows.length === 0) {
        setError('That file has no rows to import.');
        return;
      }
      const guess = guessColumns(parsed);
      setSheet(parsed);
      setEmailCol(guess.email);
      setNameCol(guess.name);
      setFileName(file.name);
      setStep('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.');
    }
  }

  async function handleImport() {
    if (!preview || !ready) return;
    setStep('working');
    setError('');
    const batchId = crypto.randomUUID();
    const totals: ImportResult = {
      inserted: 0,
      skipped_existing: 0,
      skipped_erased: 0,
      invalid: preview.invalid,
      duplicates: preview.duplicates,
    };
    try {
      const parts = chunk(preview.rows, IMPORT_CHUNK);
      // A plain loop: the app compiles to ES5, where for…of over .entries() doesn't type-check.
      for (let i = 0; i < parts.length; i++) {
        const rows = parts[i];
        setProgress(`Importing ${Math.min((i + 1) * IMPORT_CHUNK, preview.rows.length)} of ${preview.rows.length}…`);
        setProgressValue(i / parts.length);
        const r = await importSubscribers(token, { batch_id: batchId, statement: statement.trim(), attested: true, rows });
        totals.inserted += r.inserted;
        totals.skipped_existing += r.skipped_existing;
        totals.skipped_erased += r.skipped_erased;
        // The server checks every row again; add anything it caught that the preview didn't.
        totals.invalid += r.invalid;
        totals.duplicates += r.duplicates;
      }
      setResult({ ...totals });
      setProgress('Sending the new subscribers to Resend…');
      setProgressValue(0);
      setSync(
        await syncUntilDone(token, (p) => {
          setProgress(`Sending to Resend: ${p.remaining} left…`);
          setProgressValue(p.pushed + p.remaining > 0 ? p.pushed / (p.pushed + p.remaining) : 1);
        }),
      );
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      setError(e instanceof Error ? e.message : 'Import failed');
      setResult({ ...totals });
    }
    setStep('done');
    onFinished();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="nl-import-title"
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl sm:p-8"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={step === 'working'}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-2 text-gray-500 transition hover:bg-gray-100 disabled:opacity-40"
        >
          <X className="h-5 w-5" />
        </button>
        <h2 id="nl-import-title" className="pr-10 text-xl font-semibold text-[#00373E]">
          Import subscribers
        </h2>

        {error && (
          <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {step === 'choose' && (
          <div className="mt-4 space-y-4 text-sm text-gray-600">
            <p>
              Upload a CSV or Excel (.xlsx) file with one person per row. Only add people who agreed to receive the
              Hope Trust newsletter.
            </p>
            <p>
              Addresses already on the list are skipped, whatever their status, so an import never re-subscribes
              someone who unsubscribed. People who were deleted are skipped too.
            </p>
            <label className="block">
              <span className={label}>Spreadsheet file</span>
              <input type="file" accept=".csv,.xlsx" onChange={(e) => handleFile(e.target.files?.[0])} className="block w-full text-sm" />
            </label>
          </div>
        )}

        {step === 'review' && sheet && preview && (
          <div className="mt-4 space-y-5 text-sm">
            <p className="text-gray-600">
              {fileName}: {sheet.rows.length} {sheet.rows.length === 1 ? 'row' : 'rows'}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={label}>Email column</span>
                <select value={emailCol} onChange={(e) => setEmailCol(Number(e.target.value))} className={field}>
                  {sheet.headers.map((header, i) => (
                    <option key={i} value={i}>{header}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={label}>Name column</span>
                <select
                  value={nameCol ?? ''}
                  onChange={(e) => setNameCol(e.target.value === '' ? null : Number(e.target.value))}
                  className={field}
                >
                  <option value="">No name column</option>
                  {sheet.headers.map((header, i) => (
                    <option key={i} value={i}>{header}</option>
                  ))}
                </select>
              </label>
            </div>
            <p data-testid="import-preview" className="rounded-xl bg-[#F7F6F4] px-4 py-3 text-[#00373E]">
              <strong>{preview.rows.length}</strong> {preview.rows.length === 1 ? 'address' : 'addresses'} to import
              {preview.invalid > 0 && <> · {preview.invalid} not valid</>}
              {preview.duplicates > 0 && <> · {preview.duplicates} repeated in the file</>}
            </p>
            {preview.rows.length > 0 && (
              <ul aria-label="First rows" className="space-y-1 text-xs text-gray-500">
                {preview.rows.slice(0, 5).map((row) => (
                  <li key={row.email}>
                    {row.email}
                    {row.name ? ` · ${row.name}` : ''}
                  </li>
                ))}
              </ul>
            )}
            <label className="block">
              <span className={label}>Where and when did these people agree?</span>
              <textarea
                value={statement}
                onChange={(e) => setStatement(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="For example: clients who ticked the newsletter box on the intake form, 2025–26"
                className={field}
              />
            </label>
            <label className="flex items-start gap-2 text-[#00373E]">
              <input
                type="checkbox"
                checked={attested}
                onChange={(e) => setAttested(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#ED7428]"
              />
              <span>Everyone on this list agreed to receive the Hope Trust newsletter.</span>
            </label>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setSheet(null);
                  setStep('choose');
                }}
                className={secondary}
              >
                Choose another file
              </button>
              <button type="button" onClick={handleImport} disabled={!ready} className={primary}>
                Import {count(preview.rows.length)}
              </button>
            </div>
          </div>
        )}

        {step === 'working' && (
          <div className="flex flex-col items-center py-10 text-sm text-gray-600">
            <Loader2 className="mb-3 h-6 w-6 animate-spin text-[#ED7428]" />
            <progress value={progressValue} max={1} aria-label="Import progress" className="mb-3 h-2 w-full max-w-sm accent-[#ED7428]" />
            <p role="status">{progress}</p>
          </div>
        )}

        {step === 'done' && result && (
          <div className="mt-4 space-y-4 text-sm">
            {!error && (
              <p className="flex items-center gap-2 font-semibold text-emerald-700">
                <CheckCircle2 className="h-5 w-5" />
                Import finished
              </p>
            )}
            <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-[#00373E]">
              <dt>Added</dt>
              <dd className="text-right font-semibold">{result.inserted}</dd>
              <dt>Already on the list, skipped</dt>
              <dd className="text-right">{result.skipped_existing}</dd>
              <dt>Deleted earlier, skipped</dt>
              <dd className="text-right">{result.skipped_erased}</dd>
              <dt>Not valid</dt>
              <dd className="text-right">{result.invalid}</dd>
              <dt>Repeated in the file</dt>
              <dd className="text-right">{result.duplicates}</dd>
              {sync && (
                <>
                  <dt>Sent to Resend</dt>
                  <dd className="text-right">{sync.pushed}</dd>
                </>
              )}
            </dl>
            {sync && sync.remaining > 0 && (
              <p className="text-amber-700">
                {sync.remaining} still waiting for Resend. Use &quot;Sync with Resend&quot; to finish.
                {sync.errors.length > 0 ? ` (${sync.errors.join('; ')})` : ''}
              </p>
            )}
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className={secondary}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
