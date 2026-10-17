// What the automatic newsletter emails staff (fortnightly spec §5.3, §5.5): the
// preview 48 hours before a send, and short notes when it skips, sends, fails
// or misses. They go to the settings' preview recipients.

import { HOPE, SANS, esc } from './render';
import { formatSlot } from './schedule';

export const ADMIN_URL = 'https://hopetrustindia.com/arel-ops/';

const subscribers = (n: number) => `${n} subscriber${n === 1 ? '' : 's'}`;

/** The issue as it will look (its test render), with a note at the top: when it goes out, to how many, where to change it. */
export function previewEmail(
  issueHtml: string,
  info: { sendAt: Date; subscribed: number; adminUrl: string },
): { subject: (issueSubject: string) => string; html: string } {
  const when = `${formatSlot(info.sendAt)}, 10:00 am India time`;
  const note =
    `<div style="margin:0;padding:16px 20px;background-color:#FFF4D6;border-bottom:1px solid #E8D9A8;font-family:${SANS};font-size:14px;line-height:1.6;color:${HOPE.teal};">` +
    `<strong>Preview of the next Hope Letter.</strong> This goes to ${subscribers(info.subscribed)} on ${esc(when)}. ` +
    `To change the text, swap the post or skip this fortnight, open the Newsletter tab at ` +
    `<a href="${esc(info.adminUrl)}" style="color:${HOPE.teal};">${esc(info.adminUrl)}</a>. ` +
    `If nobody does anything, it goes out as it is.</div>`;
  return {
    subject: (issueSubject) => `[Preview] ${formatSlot(info.sendAt)}: ${issueSubject}`,
    html: issueHtml.replace(/<body[^>]*>/, (tag) => `${tag}\n${note}`),
  };
}

/** A short note to staff; every line is escaped. */
export function noteEmail(subject: string, lines: string[]): { subject: string; html: string } {
  const body = lines.map((line) => `<p style="margin:0 0 12px 0;">${esc(line)}</p>`).join('');
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:24px;background-color:${HOPE.page};">
<div style="max-width:560px;margin:0 auto;padding:24px;background-color:${HOPE.white};font-family:${SANS};font-size:15px;line-height:1.6;color:${HOPE.teal};">${body}<p style="margin:16px 0 0 0;font-size:13px;color:${HOPE.muted};">The Hope Letter · <a href="${ADMIN_URL}" style="color:${HOPE.muted};">${ADMIN_URL}</a></p></div>
</body></html>`;
  return { subject, html };
}
