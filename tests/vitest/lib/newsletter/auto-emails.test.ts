import { describe, it, expect } from 'vitest';
import { ADMIN_URL, noteEmail, previewEmail } from '@/lib/newsletter/auto-emails';

const ISSUE = '<!DOCTYPE html>\n<html><head><title>x</title></head>\n<body style="margin:0;">\n<table><tr><td>The Hope Letter</td></tr></table>\n</body></html>';
const SEND = new Date('2026-10-20T04:30:00.000Z');

describe('previewEmail', () => {
  it('puts the note right after <body>: when it goes out, to how many, and where to change it', () => {
    const preview = previewEmail(ISSUE, { sendAt: SEND, subscribed: 1, adminUrl: ADMIN_URL });
    const body = preview.html.indexOf('<body');
    const note = preview.html.indexOf('Tue 20 Oct, 10:00 am India time');
    expect(body).toBeGreaterThan(-1);
    expect(note).toBeGreaterThan(body);
    expect(note).toBeLessThan(preview.html.indexOf('<table>'));
    expect(preview.html).toContain('This goes to 1 subscriber on Tue 20 Oct, 10:00 am India time.');
    expect(preview.html).toContain(`href="${ADMIN_URL}"`);
    expect(preview.html).toContain('If nobody does anything, it goes out as it is.');
    expect(preview.subject('The Most Important Connection')).toBe('[Preview] Tue 20 Oct: The Most Important Connection');
  });

  it('counts subscribers in the plural', () => {
    expect(previewEmail(ISSUE, { sendAt: SEND, subscribed: 3, adminUrl: ADMIN_URL }).html).toContain('This goes to 3 subscribers on');
  });
});

describe('noteEmail', () => {
  it('escapes its lines and keeps the subject', () => {
    const note = noteEmail('[The Hope Letter] No newsletter on Tue 20 Oct', ['<b>A newsletter</b> went out on Mon 12 Oct.']);
    expect(note.subject).toBe('[The Hope Letter] No newsletter on Tue 20 Oct');
    expect(note.html).toContain('&lt;b&gt;A newsletter&lt;/b&gt; went out on Mon 12 Oct.');
    expect(note.html).not.toContain('<b>');
    expect(note.html).toContain(ADMIN_URL);
  });
});
