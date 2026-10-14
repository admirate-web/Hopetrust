'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2 } from 'lucide-react';
import NewsletterForm from '@/components/NewsletterForm';

type State = 'loading' | 'ready' | 'confirming' | 'done' | 'expired' | 'missing' | 'error';

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** The token from the link's #t=…, or null. */
function tokenFromLink(): string | null {
  const match = /(?:^#|&)t=([^&]+)/.exec(window.location.hash);
  const token = match ? decodeURIComponent(match[1]) : null;
  return token && TOKEN.test(token) ? token : null;
}

/** Takes the used token out of the address bar. */
function forgetToken() {
  if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

/**
 * Confirms a newsletter sign-up (spec §7.3). It waits for a click, because
 * corporate email scanners open links automatically.
 */
export default function NewsletterConfirm() {
  const [state, setState] = useState<State>('loading');
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const found = tokenFromLink();
    setToken(found);
    setState(found ? 'ready' : 'missing');
  }, []);

  async function confirm() {
    if (!token) return;
    setState('confirming');
    try {
      const res = await fetch('/api/newsletter-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        forgetToken();
        setState('done');
      } else if (res.status === 400) {
        forgetToken();
        setState('expired');
      } else {
        setState('error');
      }
    } catch {
      setState('error');
    }
  }

  const heading = 'text-2xl font-bold text-[#00373E] sm:text-3xl';
  const body = 'mt-3 text-base leading-relaxed text-[#00373E]/80';
  const button =
    'mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-[#ED7428] px-8 py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-[#d4631f] disabled:opacity-60';

  return (
    <div aria-live="polite">
      {state === 'loading' && <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#ED7428]" aria-label="Loading" />}

      {(state === 'ready' || state === 'confirming') && (
        <>
          <h1 className={heading}>Confirm your subscription</h1>
          <p className={body}>Click the button to start getting the Hope Trust newsletter, about once a month.</p>
          <button type="button" onClick={confirm} disabled={state === 'confirming'} className={button}>
            {state === 'confirming' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Confirm my subscription
          </button>
        </>
      )}

      {state === 'done' && (
        <>
          <CheckCircle2 className="mb-4 h-10 w-10 text-emerald-600" aria-hidden="true" />
          <h1 className={heading}>You&apos;re subscribed</h1>
          <p className={body}>
            Thank you. The next Hope Trust newsletter will come to your inbox. Every issue has an Unsubscribe button at
            the bottom.
          </p>
          <Link href="/blogs/" className={button}>
            Read our latest articles
          </Link>
        </>
      )}

      {(state === 'expired' || state === 'missing') && (
        <>
          <h1 className={heading}>
            {state === 'expired' ? 'This link has expired or was already used' : 'This link is incomplete'}
          </h1>
          {state === 'expired' && <p className={body}>If you already confirmed, you&apos;re subscribed.</p>}
          <p className={body}>
            {state === 'expired'
              ? "Confirmation links work once and last 7 days. If you haven't confirmed yet, sign up again and we'll send you a new one."
              : "Open the link in the confirmation email again, or sign up below and we'll send you a new one."}
          </p>
          <div className="mt-6">
            <NewsletterForm variant="card" />
          </div>
        </>
      )}

      {state === 'error' && (
        <>
          <h1 className={heading}>Something went wrong</h1>
          <p className={body}>We couldn&apos;t confirm your subscription just now. Please try again.</p>
          <button type="button" onClick={confirm} className={button}>
            Try again
          </button>
        </>
      )}
    </div>
  );
}
