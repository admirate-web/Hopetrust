'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { MessageCircle, X, ArrowUp, ArrowUpRight } from 'lucide-react';
import { getLogoUrl } from '@/lib/assets';
import { siteConfig } from '@/lib/config';
import WhatsAppButton from '@/components/WhatsAppButton';

/**
 * The website chat bubble. Every decision about what to say is made by the CRM
 * engine behind /api/chat — this renders the turn and carries the state.
 *
 * It holds no conversation of its own: the message list lives in component
 * state and dies with the tab, and only the four-field state object is
 * persisted. Nothing a person types is ever written down here.
 */

const STATE_KEY = 'ht_chat_state';

const FAILURE_LINE =
  "I can't reach our team just now. You can message us on WhatsApp instead — someone will pick it up.";

interface ChatLink {
  label: string;
  url: string;
}

interface ChatState {
  step: string;
  first_name: string | null;
  age: number | null;
  focus_tags: string[];
}

interface Message {
  from: 'them' | 'us';
  body: string;
  links?: ChatLink[];
  failed?: boolean;
}

const FRESH_STATE: ChatState = {
  step: 'WELCOME',
  first_name: null,
  age: null,
  focus_tags: [],
};

// sessionStorage, never localStorage. Someone on a shared computer asking
// about addiction treatment must not leave the conversation for whoever sits
// down next; a closed tab is the end of it.
function readState(): ChatState {
  try {
    const raw = sessionStorage.getItem(STATE_KEY);
    return raw ? { ...FRESH_STATE, ...JSON.parse(raw) } : FRESH_STATE;
  } catch {
    return FRESH_STATE;
  }
}

function writeState(state: ChatState) {
  try {
    sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // A browser refusing storage costs continuity between turns, not the
    // conversation. Carrying on beats failing in front of the person.
  }
}

// Not on /arel-ops, the clinic's internal operations page: nobody there is a
// patient looking for help, and the old WhatsApp button stayed off it too.
export default function ChatBubble() {
  const pathname = usePathname();
  if (pathname?.startsWith('/arel-ops')) return null;
  return <Bubble />;
}

function Bubble() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const stateRef = useRef<ChatState>(FRESH_STATE);
  const greeted = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const still = useReducedMotion();

  async function send(text: string) {
    setSending(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, state: stateRef.current }),
      });

      if (!res.ok) throw new Error(String(res.status));

      const data = await res.json();
      if (data?.state) {
        stateRef.current = { ...stateRef.current, ...data.state };
        writeState(stateRef.current);
      }

      setMessages((prev) => [
        ...prev,
        {
          from: 'them',
          body: typeof data?.reply === 'string' ? data.reply : FAILURE_LINE,
          links: Array.isArray(data?.links) ? data.links : [],
        },
      ]);
    } catch {
      // Never fail silently. A person who has just typed something difficult
      // and got nothing back assumes they were ignored.
      setMessages((prev) => [...prev, { from: 'them', body: FAILURE_LINE, failed: true }]);
    } finally {
      setSending(false);
    }
  }

  // The engine greets at its WELCOME step, so opening sends one empty turn.
  // Holding a copy of the greeting here would be a second place for approved
  // copy to live, and the two would drift.
  useEffect(() => {
    if (!open || greeted.current) return;
    greeted.current = true;
    stateRef.current = readState();
    void send('');
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Scroll the transcript, not the page. scrollIntoView on a fixed panel drags
  // the document behind it on some mobile browsers; setting scrollTop on the
  // container that actually overflows cannot.
  useEffect(() => {
    const log = endRef.current?.parentElement;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, sending]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Closing must hand the keyboard back to the launcher, or focus falls to the
  // top of the document and a keyboard user restarts the page to get out.
  function close() {
    setOpen(false);
    launcherRef.current?.focus();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    setMessages((prev) => [...prev, { from: 'us', body: text }]);
    void send(text);
  }

  const armed = draft.trim().length > 0 && !sending;

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Chat with Hope Trust"
            initial={still ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={still ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: still ? 0.12 : 0.22, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: 'bottom right' }}
            className="fixed inset-x-0 bottom-0 z-50 flex h-[86vh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-[0_-8px_40px_-12px_rgba(0,55,62,0.3)] sm:inset-x-auto sm:bottom-24 sm:right-6 sm:h-[min(34rem,calc(100vh-9rem))] sm:w-[24rem] sm:rounded-3xl sm:shadow-[0_24px_60px_-12px_rgba(0,55,62,0.4)]"
          >
            {/* Header. The warm light rising from its lower edge is the site's
                own hero — the sun sitting just below the horizon. */}
            <div className="relative shrink-0 overflow-hidden bg-[#00373E]">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-[radial-gradient(115%_100%_at_50%_100%,rgba(237,116,40,0.34),rgba(237,116,40,0)_72%)]"
              />
              <div className="relative flex items-center gap-3 px-4 py-3.5">
                {/* The mark is served from storage, so it can be slow or absent.
                    The monogram sits underneath rather than behind a state flag:
                    an unpainted image reveals it, and a blank white disc never
                    shows. */}
                <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-white/25">
                  <span
                    aria-hidden="true"
                    className="text-[12px] font-bold tracking-tight text-[#00373E]"
                  >
                    HT
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getLogoUrl()}
                    alt=""
                    width={36}
                    height={36}
                    className="absolute inset-0 h-full w-full object-contain p-0.5"
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold leading-tight tracking-[-0.01em] text-white">
                    Hope Trust
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-[10px] font-medium uppercase leading-none tracking-[0.09em] text-white/60">
                    <span className="relative flex h-1.5 w-1.5 shrink-0">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-[#ED7428] opacity-70 motion-safe:animate-ping" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#ED7428]" />
                    </span>
                    Replies straight away
                  </p>
                </div>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close conversation"
                  className="-mr-1 shrink-0 rounded-full p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  <X className="h-[18px] w-[18px]" aria-hidden="true" />
                </button>
              </div>
              <div
                aria-hidden="true"
                className="h-px bg-gradient-to-r from-transparent via-[#ED7428]/50 to-transparent"
              />
            </div>

            <div
              role="log"
              aria-live="polite"
              aria-label="Conversation"
              className="flex-1 space-y-2.5 overflow-y-auto overscroll-contain bg-[#F7F5EF] px-3.5 py-4"
            >
              {messages.map((m, i) => (
                <motion.div
                  key={i}
                  initial={still ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className={
                    m.from === 'us' ? 'flex justify-end' : 'flex flex-col items-start'
                  }
                >
                  <div
                    className={
                      m.from === 'us'
                        ? 'max-w-[85%] rounded-2xl rounded-br-md bg-[#00373E] px-3.5 py-2.5 text-[14px] leading-[1.55] text-white'
                        : 'max-w-[88%] rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-[14px] leading-[1.55] text-[#374151] shadow-[0_1px_2px_rgba(0,55,62,0.06),0_4px_12px_-6px_rgba(0,55,62,0.14)]'
                    }
                  >
                    <p className="whitespace-pre-wrap">{m.body}</p>

                    {m.failed && (
                      <a
                        href={siteConfig.contact.whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-[#ED7428] px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#d4631f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ED7428]/40 focus-visible:ring-offset-2"
                      >
                        Message us on WhatsApp
                        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    )}

                  </div>

                  {/* These arrive as full article titles, not short labels, and
                      they are the way out of the chat and into help. On the
                      cream ground they carry their own weight; nested inside
                      the bubble they read as footnotes. */}
                  {m.from === 'them' && m.links && m.links.length > 0 && (
                    <div className="mt-2 w-[88%]">
                      <p className="mb-1.5 pl-0.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-[#00373E]/60">
                        Related reading
                      </p>
                      {/* ml-0 defeats the site-wide `ul { margin-left: 1rem }`
                          in globals.css, which would otherwise push these off
                          the message's left edge. */}
                      <ul className="ml-0 space-y-1.5">
                        {m.links.map((l) => (
                          <li key={l.url}>
                            <a
                              href={l.url}
                              className="group flex items-start gap-2.5 rounded-xl border border-[#00373E]/10 bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(0,55,62,0.06)] transition-all hover:border-[#ED7428]/40 hover:shadow-[0_2px_10px_-3px_rgba(0,55,62,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ED7428]/40"
                            >
                              <span className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-[#00373E]">
                                {l.label}
                              </span>
                              <ArrowUpRight
                                className="mt-px h-3.5 w-3.5 shrink-0 text-[#00373E]/30 transition-colors group-hover:text-[#ED7428]"
                                aria-hidden="true"
                              />
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </motion.div>
              ))}

              {/* Silence after someone types something hard reads as being
                  ignored. The turn is always visibly in hand. */}
              {sending && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(0,55,62,0.06),0_4px_12px_-6px_rgba(0,55,62,0.14)]">
                    <span className="sr-only">Hope Trust is typing</span>
                    {[0, 1, 2].map((d) => (
                      <span
                        key={d}
                        aria-hidden="true"
                        className="h-1.5 w-1.5 rounded-full bg-[#00373E]/40 motion-safe:animate-chat-dot"
                        style={{ animationDelay: `${d * 0.16}s` }}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div ref={endRef} />
            </div>

            <form
              onSubmit={handleSubmit}
              aria-label="Send a message"
              className="flex shrink-0 items-center gap-2 border-t border-[#00373E]/10 bg-white px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3"
            >
              <label htmlFor="ht-chat-input" className="sr-only">
                Your message
              </label>
              <input
                id="ht-chat-input"
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type your message"
                autoComplete="off"
                enterKeyHint="send"
                className="min-w-0 flex-1 rounded-full bg-[#F7F5EF] px-4 py-2.5 text-[14px] text-[#374151] outline-none ring-1 ring-[#00373E]/10 transition-shadow placeholder:text-[#00373E]/30 focus:ring-2 focus:ring-[#00373E]/50"
              />
              <button
                type="submit"
                disabled={!armed}
                aria-label="Send"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00373E] text-white transition-all hover:bg-[#024a53] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00373E]/40 focus-visible:ring-offset-2 disabled:bg-[#00373E]/20 disabled:text-[#00373E]/40"
              >
                <ArrowUp className="h-[18px] w-[18px]" aria-hidden="true" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* WhatsApp sits 12px above the chat launcher (bottom-6 + h-14 + 0.75rem)
          and goes while the window is open: the window covers this corner. */}
      {!open && <WhatsAppButton className="fixed bottom-[5.75rem] right-4 z-50 sm:right-6" />}

      <button
        ref={launcherRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label="Chat with us"
        aria-expanded={open}
        className={`fixed bottom-6 right-4 z-50 h-14 w-14 items-center justify-center rounded-full bg-[#00373E] text-white shadow-[0_8px_24px_-6px_rgba(0,55,62,0.5)] transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00373E]/40 focus-visible:ring-offset-2 active:scale-95 sm:right-6 sm:flex ${
          open ? 'hidden' : 'flex'
        }`}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={open ? 'close' : 'open'}
            initial={still ? false : { opacity: 0, rotate: -60, scale: 0.7 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={still ? { opacity: 0 } : { opacity: 0, rotate: 60, scale: 0.7 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="flex items-center justify-center"
          >
            {open ? (
              <X className="h-6 w-6" aria-hidden="true" />
            ) : (
              <MessageCircle className="h-6 w-6" aria-hidden="true" />
            )}
          </motion.span>
        </AnimatePresence>
      </button>
    </>
  );
}
