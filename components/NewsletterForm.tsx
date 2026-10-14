'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { SIGNUP_NOTICE, SIGNUP_SUCCESS_MESSAGE, emailSchema, nameSchema } from '@/lib/newsletter/subscriber';

type Field = 'full_name' | 'email';
type Errors = Partial<Record<Field, string>>;

interface NewsletterFormProps {
  /** inline: one row (blog listing, homepage card). card: stacked (footer dialog, confirm page). */
  variant?: 'inline' | 'card';
  className?: string;
  /** Light text, for dark backgrounds. */
  dark?: boolean;
}

function check(values: { full_name: string; email: string }): Errors {
  const errors: Errors = {};
  const name = nameSchema.safeParse(values.full_name);
  if (!name.success) errors.full_name = name.error.issues[0].message;
  const email = emailSchema.safeParse(values.email);
  if (!email.success) errors.email = email.error.issues[0].message;
  return errors;
}

/**
 * Newsletter sign-up (spec §7.1). Everyone who gets past validation sees the
 * same message, so the form never shows whether an address is on the list.
 */
export default function NewsletterForm({ variant = 'card', className = '', dark = false }: NewsletterFormProps) {
  const id = useId();
  const [values, setValues] = useState({ full_name: '', email: '', website: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const update = (field: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((current) => ({ ...current, [field]: e.target.value }));
    if (field !== 'website') setErrors((current) => ({ ...current, [field]: undefined }));
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError('');
    const found = check(values);
    setErrors(found);
    if (found.full_name || found.email) return;

    setSending(true);
    try {
      const res = await fetch('/api/newsletter-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: values.full_name,
          email: values.email,
          website: values.website,
          page: window.location.pathname,
          notice: SIGNUP_NOTICE.version,
        }),
      });
      if (res.ok) {
        setDone(true);
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (res.status === 400 && body.fields) {
        setErrors(body.fields);
        return;
      }
      setFormError(body.error || 'Something went wrong. Please try again.');
    } catch {
      setFormError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  const text = dark ? 'text-white' : 'text-[#00373E]';
  const muted = dark ? 'text-white/70' : 'text-[#00373E]/70';

  if (done) {
    return (
      <div role="status" className={`flex items-start gap-3 ${className}`}>
        <CheckCircle2 aria-hidden="true" className={`mt-0.5 h-5 w-5 flex-shrink-0 ${dark ? 'text-emerald-300' : 'text-emerald-600'}`} />
        <div>
          <p className={`text-sm font-semibold ${text}`}>{SIGNUP_SUCCESS_MESSAGE}</p>
          <p className={`mt-1 text-xs ${muted}`}>If it isn&apos;t there in a few minutes, look in your spam or promotions folder.</p>
        </div>
      </div>
    );
  }

  const input = `w-full rounded-full border text-sm outline-none transition focus:border-[#ED7428] focus:ring-1 focus:ring-[#ED7428] ${
    dark ? 'border-white/20 bg-white/10 text-white placeholder:text-white/50' : 'border-gray-200 bg-white text-gray-800 placeholder:text-gray-400'
  } ${variant === 'inline' ? 'px-4 py-2.5' : 'px-5 py-3'}`;
  const errorText = `ml-4 mt-1 text-xs ${dark ? 'text-red-200' : 'text-red-600'}`;

  return (
    <form onSubmit={handleSubmit} noValidate className={`relative w-full ${className}`}>
      <div className={variant === 'inline' ? 'flex flex-col gap-2 sm:flex-row' : 'space-y-3'}>
        <div className="flex-1">
          <label htmlFor={`${id}-name`} className="sr-only">Full name</label>
          <input
            id={`${id}-name`}
            name="full_name"
            type="text"
            autoComplete="name"
            placeholder="Full name"
            value={values.full_name}
            onChange={update('full_name')}
            aria-invalid={errors.full_name ? true : undefined}
            aria-describedby={errors.full_name ? `${id}-name-error` : undefined}
            className={input}
          />
          {errors.full_name && <p id={`${id}-name-error`} className={errorText}>{errors.full_name}</p>}
        </div>
        <div className="flex-1">
          <label htmlFor={`${id}-email`} className="sr-only">Email address</label>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="Email address"
            value={values.email}
            onChange={update('email')}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? `${id}-email-error` : undefined}
            className={input}
          />
          {errors.email && <p id={`${id}-email-error`} className={errorText}>{errors.email}</p>}
        </div>
        {/* Bot trap: hidden from people and screen readers, so only bots fill it in. */}
        <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-px w-px overflow-hidden">
          <label htmlFor={`${id}-website`}>Leave this empty</label>
          <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" value={values.website} onChange={update('website')} />
        </div>
        <button
          type="submit"
          disabled={sending}
          className={`flex-shrink-0 rounded-full bg-[#ED7428] text-sm font-semibold text-white shadow-md transition-colors hover:bg-[#d4631f] disabled:opacity-60 ${
            variant === 'inline' ? 'px-6 py-2.5' : 'w-full px-6 py-3'
          }`}
        >
          {sending ? <Loader2 className="mx-auto h-4 w-4 animate-spin" aria-label="Sending" /> : 'Subscribe'}
        </button>
      </div>
      {formError && (
        <p role="alert" className={`mt-2 text-sm ${dark ? 'text-red-200' : 'text-red-600'}`}>
          {formError}
        </p>
      )}
      <p className={`mt-3 text-xs leading-relaxed ${muted}`}>
        {SIGNUP_NOTICE.text}{' '}
        <Link href="/privacy-policy/#newsletter" className="underline underline-offset-2 hover:text-[#ED7428]">
          Privacy policy
        </Link>
      </p>
    </form>
  );
}
