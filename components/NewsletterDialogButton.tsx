'use client';

import { useEffect, useId, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2, X } from 'lucide-react';

// The form (and zod with it) loads when the dialog first opens, so the footer
// doesn't add it to every page.
const NewsletterForm = dynamic(() => import('@/components/NewsletterForm'), {
  ssr: false,
  loading: () => <Loader2 aria-label="Loading" className="mx-auto my-16 h-5 w-5 animate-spin text-[#ED7428]" />,
});

/**
 * Starts fetching the form as soon as someone points at or tabs to the button.
 * A failed fetch is harmless: the dialog loads the form again when it opens.
 */
function preloadForm() {
  import('@/components/NewsletterForm').catch(() => {});
}

/** The footer's "Subscribe to our newsletter" button and its dialog (spec §7.1). */
export default function NewsletterDialogButton({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  // Hand focus back to the button on close. The form focuses its own first
  // field when it appears, which may be after the dialog opens.
  useEffect(() => {
    if (open) wasOpen.current = true;
    else if (wasOpen.current) buttonRef.current?.focus();
  }, [open]);

  // While open: no page scrolling behind the dialog, and Escape closes it.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(true)}
        onPointerEnter={preloadForm}
        onFocus={preloadForm}
        className={className}
      >
        Subscribe to our newsletter
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            data-testid="newsletter-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
            onMouseDown={(e: React.MouseEvent) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 0.61, 0.36, 1] }}
              className="relative w-full max-w-[460px] rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
            >
              <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="p-6 sm:p-8">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="absolute right-4 top-4 rounded-full p-2 text-[#00373E]/60 transition hover:bg-[#00373E]/5 hover:text-[#00373E]"
                >
                  <X className="h-5 w-5" />
                </button>
                <h2 id={titleId} className="pr-10 text-xl font-semibold text-[#00373E]">
                  Subscribe to our newsletter
                </h2>
                <p className="mb-5 mt-2 text-sm text-[#00373E]/70">
                  A fortnightly letter from our team, with ideas you can use between sessions.
                </p>
                <NewsletterForm variant="card" autoFocus />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
