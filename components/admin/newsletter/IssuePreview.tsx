'use client';

// The live preview (spec §8.1, §12): the email as the send will build it, from
// the same renderer, in a sandboxed iframe (no scripts), at desktop or phone
// width, with the email's size.

import { useState, type ReactNode } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import type { IssueForRender } from '@/lib/newsletter/content';
import { issueRenderOptions, kb, normalizeBody } from '@/lib/newsletter/issue';
import { SIZE_MAX_BYTES, SIZE_WARN_BYTES, newsletterImagesBase, renderIssueHtml, type BookPanel } from '@/lib/newsletter/render';

/** The public image bucket of this site's Supabase project. */
export const IMAGES_BASE = newsletterImagesBase(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');

export interface RenderedPreview {
  /** The preview version, for the iframe. */
  html: string;
  /** The send version, and its size: the 95 KB limit and the Unsubscribe check apply to these. */
  sendHtml: string;
  bytes: number;
  imagePrefixes: string[];
}

export function renderPreview(
  issue: IssueForRender,
  imagesBase = IMAGES_BASE,
  extra: { panel?: BookPanel | null; nextIssueNumber?: number | null } = {},
): RenderedPreview {
  const clean = { ...issue, body: normalizeBody(issue.body) };
  const sendOptions = issueRenderOptions(imagesBase, 'send', extra);
  const send = renderIssueHtml(clean, sendOptions);
  return {
    html: renderIssueHtml(clean, issueRenderOptions(imagesBase, 'preview', extra)).html,
    sendHtml: send.html,
    bytes: send.bytes,
    imagePrefixes: sendOptions.imagePrefixes,
  };
}

export function sizeNote(bytes: number): { text: string; tone: 'ok' | 'warn' | 'over' } {
  if (bytes > SIZE_MAX_BYTES) return { text: `${kb(bytes)}: too big to send. Shorten it or remove an image.`, tone: 'over' };
  if (bytes > SIZE_WARN_BYTES) return { text: `${kb(bytes)}: getting long. Gmail cuts emails off at 102 KB.`, tone: 'warn' };
  return { text: kb(bytes), tone: 'ok' };
}

const TONE = { ok: 'text-gray-500', warn: 'text-amber-700', over: 'font-semibold text-red-700' } as const;

export default function IssuePreview({ html, bytes }: { html: string; bytes: number }) {
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop');
  const size = sizeNote(bytes);
  const option = (value: 'desktop' | 'phone', label: string, icon: ReactNode) => (
    <button
      type="button"
      aria-pressed={device === value}
      onClick={() => setDevice(value)}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
        device === value ? 'bg-[#00373E] text-white' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {icon}
      {label}
    </button>
  );
  return (
    <section aria-label="Preview" className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Preview width" className="inline-flex gap-0.5 rounded-xl border border-gray-200 p-0.5">
          {option('desktop', 'Desktop', <Monitor className="h-3.5 w-3.5" />)}
          {option('phone', 'Phone', <Smartphone className="h-3.5 w-3.5" />)}
        </div>
        <p aria-live="polite" className={`text-xs ${TONE[size.tone]}`}>
          Email size: {size.text}
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl bg-[#F4F4F4] p-2">
        <iframe
          title="Email preview"
          sandbox=""
          srcDoc={html}
          style={{ width: device === 'phone' ? 375 : 640 }}
          className="mx-auto block h-[1100px] max-w-none rounded-lg border-0 bg-white"
        />
      </div>
    </section>
  );
}
