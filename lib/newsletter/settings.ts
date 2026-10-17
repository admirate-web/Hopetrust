// The Hope Letter's settings (fortnightly spec §5.1, §7): automatic sending,
// its first send date, who gets the preview, and the optional book panel.
// One row of newsletter_settings (Database/newsletter.sql §7).

import { z } from 'zod';
import { resolveHref, type BookPanel } from './render';
import { emailSchema } from './subscriber';

export interface NewsletterSettings {
  auto_enabled: boolean;
  /** YYYY-MM-DD, a Tuesday; sends repeat every 14 days from it. */
  first_send_date: string | null;
  preview_recipients: string[];
  panel_enabled: boolean;
  panel_eyebrow: string;
  panel_title: string;
  panel_text: string;
  panel_link_text: string;
  panel_url: string;
}

export const DEFAULT_SETTINGS: NewsletterSettings = {
  auto_enabled: false,
  first_send_date: null,
  preview_recipients: ['essentials@admirate.in'],
  panel_enabled: false,
  panel_eyebrow: '',
  panel_title: '',
  panel_text: '',
  panel_link_text: '',
  panel_url: '',
};

export const MAX_PREVIEW_RECIPIENTS = 5;

const isTuesday = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && date.getUTCDay() === 2;
};

const text = (max: number, label: string) =>
  z
    .string()
    .transform((value) => value.replace(/\s+/g, ' ').trim())
    .pipe(z.string().max(max, `${label} can be at most ${max} characters.`));

export const settingsSchema = z
  .object({
    auto_enabled: z.boolean(),
    first_send_date: z
      .string()
      .nullable()
      .transform((value) => (value === null ? null : value.trim() || null))
      .refine((value) => value === null || isTuesday(value), 'The first send date must be a Tuesday.'),
    preview_recipients: z
      .array(z.string())
      .min(1, 'Add at least one address for the preview.')
      .max(MAX_PREVIEW_RECIPIENTS, `Up to ${MAX_PREVIEW_RECIPIENTS} addresses get the preview.`)
      .transform((list, ctx) => {
        const out: string[] = [];
        for (const raw of list) {
          const email = emailSchema.safeParse(raw);
          if (!email.success) {
            ctx.addIssue({ code: 'custom', message: `"${raw.trim().slice(0, 80)}" isn't a valid email address.` });
            return z.NEVER;
          }
          if (!out.includes(email.data)) out.push(email.data);
        }
        return out;
      }),
    panel_enabled: z.boolean(),
    panel_eyebrow: text(80, 'The panel eyebrow'),
    panel_title: text(80, 'The panel title'),
    panel_text: text(200, 'The panel text'),
    panel_link_text: text(40, 'The panel link text'),
    panel_url: z.string().trim().max(1000, 'The panel link can be at most 1000 characters.'),
  })
  .superRefine((s, ctx) => {
    if (s.auto_enabled && !s.first_send_date) {
      ctx.addIssue({ code: 'custom', message: 'Choose the first send date before switching automatic sending on.' });
    }
    if (!s.panel_enabled) return;
    if (!s.panel_title || !s.panel_text || !s.panel_link_text || !s.panel_url) {
      ctx.addIssue({ code: 'custom', message: 'Fill in the book panel, or switch it off.' });
    } else if (!/^https?:/i.test(resolveHref(s.panel_url, 'https://hopetrustindia.com') ?? '')) {
      ctx.addIssue({ code: 'custom', message: 'The panel link must be a web address, such as https://…' });
    }
  });

/** The book panel the email shows, or null when it's switched off. */
export function bookPanel(s: NewsletterSettings): BookPanel | null {
  if (!s.panel_enabled) return null;
  return { eyebrow: s.panel_eyebrow, title: s.panel_title, text: s.panel_text, linkText: s.panel_link_text, url: s.panel_url };
}
