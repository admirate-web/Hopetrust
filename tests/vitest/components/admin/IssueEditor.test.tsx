import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BodyDoc } from '@/lib/newsletter/content';
import { toDraft, type IssueRow } from '@/lib/newsletter/issue';
import { formatSlot, sendTimeOn } from '@/lib/newsletter/schedule';

// IMAGES_BASE is read as the preview module loads, so the URL has to be set first.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
});

vi.mock('@/lib/newsletter-admin', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/newsletter-admin')>();
  return {
    ...real,
    getIssue: vi.fn(),
    saveIssue: vi.fn(),
    sendIssue: vi.fn(),
    sendTestIssue: vi.fn(),
    checkIssue: vi.fn(),
    deleteIssue: vi.fn(),
    syncUntilDone: vi.fn(),
    swapIssuePost: vi.fn(),
    skipIssue: vi.fn(),
    listPosts: vi.fn(),
  };
});
vi.mock('@/lib/newsletter/issue-image', () => ({ uploadIssueImage: vi.fn() }));
// The real body editor has its own tests. Here, a stand-in that edits the body on request.
vi.mock('@/components/admin/newsletter/BodyEditor', () => ({
  default: ({ initial, readOnly, onChange }: { initial: BodyDoc; readOnly?: boolean; onChange: (doc: BodyDoc) => void }) => (
    <div>
      <p data-testid="body">{JSON.stringify(initial)}</p>
      {!readOnly && (
        <button
          type="button"
          onClick={() => onChange({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'New words' }] }] })}
        >
          Type in the body
        </button>
      )}
    </div>
  ),
}));

import IssueEditor from '@/components/admin/newsletter/IssueEditor';
import * as api from '@/lib/newsletter-admin';
import { uploadIssueImage } from '@/lib/newsletter/issue-image';

const IMAGES = 'https://test.supabase.co/storage/v1/object/public/newsletter-images';
const ISSUE: IssueRow = {
  id: '11111111-1111-4111-8111-000000000001',
  subject: 'Know thyself',
  preheader: '',
  issue_date: '2026-10-14',
  title: 'Know Thyself',
  hero_image_url: `${IMAGES}/issues/i/hero.jpg`,
  hero_image_alt: 'A window',
  body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] },
  share_url: null,
  status: 'draft',
  last_error: null,
  resend_broadcast_id: null,
  recipient_count: null,
  sent_at: null,
  sent_by: null,
  created_by: 'admin@hopetrustindia.com',
  updated_by: null,
  created_at: '2026-10-14T10:00:00.000Z',
  updated_at: '2026-10-14T10:00:00.000Z',
};
const ABOUT = { me: 'admin@hopetrustindia.com', from: 'Hope Trust <newsletter@hopetrustindia.com>', subscribed: 3 };
const SENT: IssueRow = {
  ...ISSUE,
  status: 'sent',
  recipient_count: 3,
  resend_broadcast_id: 'b-1',
  sent_at: '2026-10-14T10:10:00.000Z',
  sent_by: 'admin@hopetrustindia.com',
};
/** What the issues API answers when a save has a Share link without https:// (lib/newsletter/issue.ts). */
const SHARE_LINK_ERROR = 'The Share link must be a web address, such as https://hopetrustindia.com/blogs/…';

function open(change: Partial<IssueRow> = {}) {
  vi.mocked(api.getIssue).mockResolvedValue({ issue: { ...ISSUE, ...change }, ...ABOUT });
  const onClose = vi.fn();
  render(<IssueEditor token="tkn" id={ISSUE.id} onClose={onClose} onUnauthorized={() => {}} />);
  return { onClose };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

describe('IssueEditor', () => {
  it('loads the issue into the fields, with a live preview', async () => {
    open();
    expect(await screen.findByLabelText('Subject')).toHaveValue('Know thyself');
    expect(screen.getByLabelText('Title')).toHaveValue('Know Thyself');
    await waitFor(() => expect(screen.getByTitle('Email preview').getAttribute('srcdoc')).toContain('Know Thyself'));
    expect(screen.getByText('All changes saved')).toBeInTheDocument();
  });

  it('saves the whole draft with the version it was loaded at, and then has nothing left to save', async () => {
    open();
    const subject = await screen.findByLabelText('Subject');
    expect(screen.getByRole('button', { name: /^Save$/ })).toBeDisabled();
    await userEvent.clear(subject);
    await userEvent.type(subject, 'Know yourself');
    await userEvent.click(screen.getByRole('button', { name: 'Type in the body' }));
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    vi.mocked(api.saveIssue).mockImplementation(async (_token, _id, draft) => ({
      ...ISSUE,
      ...draft,
      updated_at: '2026-10-14T10:05:00.000Z',
    }));
    await userEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(api.saveIssue).toHaveBeenCalledWith(
      'tkn',
      ISSUE.id,
      expect.objectContaining({
        subject: 'Know yourself',
        title: 'Know Thyself',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'New words' }] }] },
      }),
      '2026-10-14T10:00:00.000Z',
    );
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Save$/ })).toBeDisabled();
  });

  it("on a clashing save, offers Reload and won't overwrite the other person's version", async () => {
    open();
    await userEvent.type(await screen.findByLabelText('Subject'), '!');
    const theirs = { ...ISSUE, title: 'Their title', updated_at: '2026-10-14T10:03:00.000Z' };
    vi.mocked(api.saveIssue).mockRejectedValue(
      new api.IssueApiError('Someone saved this issue after you opened it. Reload to see their changes, then make yours again.', 409, theirs, []),
    );
    await userEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Someone saved this issue after you opened it.');
    await userEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(vi.mocked(api.saveIssue).mock.calls.map((call) => call[3])).toEqual([ISSUE.updated_at, ISSUE.updated_at]);
    vi.mocked(api.getIssue).mockResolvedValue({ issue: theirs, ...ABOUT });
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Their title'));
  });

  it('asks before leaving with unsaved changes', async () => {
    const { onClose } = open();
    await userEvent.type(await screen.findByLabelText('Subject'), '!');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await userEvent.click(screen.getByRole('button', { name: /Issues/ }));
    expect(confirm).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: /Issues/ }));
    expect(onClose).toHaveBeenCalled();
  });

  it('offers back the unsaved changes this browser kept', async () => {
    window.localStorage.setItem(
      `newsletter-issue-draft:${ISSUE.id}`,
      JSON.stringify({
        version: ISSUE.updated_at,
        draft: { ...toDraft(ISSUE), subject: 'Kept in the browser' },
        at: '2026-10-14T10:02:00.000Z',
      }),
    );
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Restore them' }));
    expect(screen.getByLabelText('Subject')).toHaveValue('Kept in the browser');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('keeps unsaved changes in this browser while they are unsaved', async () => {
    open();
    await userEvent.type(await screen.findByLabelText('Subject'), '!');
    await waitFor(() => {
      const kept = JSON.parse(window.localStorage.getItem(`newsletter-issue-draft:${ISSUE.id}`) ?? 'null');
      expect(kept).toMatchObject({ version: ISSUE.updated_at, draft: { subject: 'Know thyself!' } });
    });
  });

  it('uploads the hero photo and shows it', async () => {
    open({ hero_image_url: null });
    await screen.findByLabelText('Subject');
    vi.mocked(uploadIssueImage).mockResolvedValue(`${IMAGES}/issues/i/new.jpg`);
    const file = new File(['x'], 'hero.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Choose the hero photo'), { target: { files: [file] } });
    expect(await screen.findByRole('img', { name: 'A window' })).toHaveAttribute('src', `${IMAGES}/issues/i/new.jpg`);
    expect(uploadIssueImage).toHaveBeenCalledWith('tkn', ISSUE.id, file);
  });

  it('lists what stops the issue from being sent, and keeps Send disabled', async () => {
    open({ hero_image_url: null, hero_image_alt: '' });
    expect(await screen.findByText('Add a hero photo.')).toBeInTheDocument();
    expect(screen.getByText("Describe the hero photo for people who can't see it.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send to subscribers/ })).toBeDisabled();
  });

  it('sends a test to the signed-in admin by default', async () => {
    open();
    await screen.findByLabelText('Subject');
    vi.mocked(api.sendTestIssue).mockResolvedValue(['admin@hopetrustindia.com']);
    await userEvent.click(screen.getByRole('button', { name: /Send test/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Send a test' });
    expect(within(dialog).getByLabelText(/Send to/)).toHaveValue('admin@hopetrustindia.com');
    await userEvent.click(within(dialog).getByRole('button', { name: /Send test/ }));
    expect(api.sendTestIssue).toHaveBeenCalledWith('tkn', ISSUE.id, ['admin@hopetrustindia.com']);
    expect(await screen.findByText('Test sent to admin@hopetrustindia.com.')).toBeInTheDocument();
  });

  it('syncs with Resend, then sends, and shows the issue as sent', async () => {
    open();
    vi.mocked(api.syncUntilDone).mockResolvedValue({
      unsubscribedInResend: 0,
      removedFromSegment: 0,
      pushed: 0,
      failed: 0,
      remaining: 0,
      errors: [],
    });
    vi.mocked(api.sendIssue).mockResolvedValue({ issue: SENT });
    const send = await screen.findByRole('button', { name: /Send to subscribers/ });
    await waitFor(() => expect(send).toBeEnabled());
    await userEvent.click(send);
    const dialog = await screen.findByRole('dialog', { name: 'Send to subscribers' });
    expect(within(dialog).getByText('3 subscribers')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: /Send now/ }));
    expect(await screen.findByText('Sent to 3 subscribers.')).toBeInTheDocument();
    expect(vi.mocked(api.syncUntilDone).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(api.sendIssue).mock.invocationCallOrder[0],
    );
    expect(screen.getByLabelText('Subject')).toBeDisabled();
  });

  it("doesn't send while a subscriber change can't reach Resend", async () => {
    open();
    vi.mocked(api.syncUntilDone).mockResolvedValue({
      unsubscribedInResend: 0,
      removedFromSegment: 0,
      pushed: 0,
      failed: 1,
      remaining: 1,
      errors: ['asha@example.com: Invalid email'],
    });
    const send = await screen.findByRole('button', { name: /Send to subscribers/ });
    await waitFor(() => expect(send).toBeEnabled());
    await userEvent.click(send);
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Send now/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('asha@example.com: Invalid email');
    expect(api.sendIssue).not.toHaveBeenCalled();
  });

  // The error shows on the page, so a dialog left open over it would hide it.
  it("closes the test dialog to show why the test didn't send", async () => {
    open();
    await screen.findByLabelText('Subject');
    vi.mocked(api.sendTestIssue).mockRejectedValue(
      new api.IssueApiError("Resend didn't send the test: This API key can't send emails right now", 502, null, []),
    );
    await userEvent.click(screen.getByRole('button', { name: /Send test/ }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Send test/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Resend didn't send the test");
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the test dialog to show why saving first failed, and sends no test', async () => {
    open();
    await userEvent.type(await screen.findByLabelText('Article link'), 'hopetrustindia.com/blogs/');
    vi.mocked(api.saveIssue).mockRejectedValue(new api.IssueApiError(SHARE_LINK_ERROR, 400, null, []));
    await userEvent.click(screen.getByRole('button', { name: /Send test/ }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Send test/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The Share link must be a web address');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.sendTestIssue).not.toHaveBeenCalled();
  });

  it('closes the send dialog to show why saving first failed, and sends nothing', async () => {
    open();
    await userEvent.type(await screen.findByLabelText('Article link'), 'hopetrustindia.com/blogs/');
    vi.mocked(api.saveIssue).mockRejectedValue(new api.IssueApiError(SHARE_LINK_ERROR, 400, null, []));
    const send = screen.getByRole('button', { name: /Send to subscribers/ });
    await waitFor(() => expect(send).toBeEnabled());
    await userEvent.click(send);
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Send now/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The Share link must be a web address');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.syncUntilDone).not.toHaveBeenCalled();
    expect(api.sendIssue).not.toHaveBeenCalled();
  });

  it('shows a sent issue read-only, with a link to its numbers in Resend', async () => {
    open(SENT);
    expect(await screen.findByRole('link', { name: /Opens and clicks in Resend/ })).toHaveAttribute(
      'href',
      'https://resend.com/broadcasts/b-1',
    );
    expect(screen.getByLabelText('Subject')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^Save$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Send to subscribers/ })).not.toBeInTheDocument();
  });

  it('settles an unclear send with Check status', async () => {
    open({ status: 'needs_check', last_error: "We couldn't confirm whether Resend sent this issue." });
    vi.mocked(api.checkIssue).mockResolvedValue({ issue: SENT, found: true });
    await userEvent.click(await screen.findByRole('button', { name: /Check status/ }));
    expect(await screen.findByText('Resend sent it, so the issue is now marked sent.')).toBeInTheDocument();
  });
});

// The Hope Letter (fortnightly plan Task 8). Far-future dates keep these
// independent of today's date.
const FULL_ABOUT = {
  ...ABOUT,
  next_issue_number: 2,
  last_sent_at: null,
  next_allowed_date: null,
  panel: null,
  next_send_at: null,
};
const BLOG: IssueRow = {
  ...ISSUE,
  kind: 'blog',
  status: 'scheduled',
  scheduled_for: '2099-10-20T04:30:00.000Z',
  preview_sent_at: '2099-10-18T04:30:00.000Z',
  reason: null,
  post_slug: 'the-most-important-connection-you-can-have-with-yourself',
  share_url: 'https://hopetrustindia.com/blogs/the-most-important-connection-you-can-have-with-yourself/',
  kicker: 'A moment for yourself',
  intro: 'Before you can love, trust, or genuinely know another person, you must first reconcile with yourself.',
  question: '',
  reading_minutes: 9,
  issue_number: null,
};

function openWith(issue: IssueRow, about: Partial<typeof FULL_ABOUT> = {}) {
  vi.mocked(api.getIssue).mockResolvedValue({ issue, ...FULL_ABOUT, ...about });
  render(<IssueEditor token="tkn" id={issue.id} onClose={() => {}} onUnauthorized={() => {}} />);
}

describe('IssueEditor: The Hope Letter', () => {
  it('gives a manual issue a kicker, a question and an article link', async () => {
    openWith(ISSUE);
    expect(await screen.findByLabelText('Kicker')).toHaveValue('');
    expect(screen.getByLabelText('Question')).toHaveValue('');
    expect(screen.getByLabelText('Article link')).toHaveValue('');
    expect(screen.queryByText('Blog link for the Share button')).toBeNull();
  });

  it('shows a scheduled blog issue with its send time, an intro instead of the body, Swap and Skip, and no Send', async () => {
    openWith(BLOG);
    expect(await screen.findByText(`Goes out ${formatSlot(new Date(BLOG.scheduled_for as string))}, 10:00 am`)).toBeInTheDocument();
    expect(screen.getByLabelText('Intro')).toHaveValue(BLOG.intro);
    expect(screen.queryByTestId('body')).toBeNull();
    expect(screen.getByRole('button', { name: 'Swap post' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Skip this fortnight' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Send to subscribers' })).toBeNull();
  });

  it('skips this fortnight after asking, and shows it skipped', async () => {
    openWith(BLOG);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await userEvent.click(await screen.findByRole('button', { name: 'Skip this fortnight' }));
    expect(api.skipIssue).not.toHaveBeenCalled();
    vi.mocked(api.skipIssue).mockResolvedValue({ ...BLOG, status: 'skipped', reason: 'Skipped in /arel-ops by admin@hopetrustindia.com.' });
    await userEvent.click(screen.getByRole('button', { name: 'Skip this fortnight' }));
    expect(api.skipIssue).toHaveBeenCalledWith('tkn', BLOG.id);
    expect(await screen.findByText('Skipped in /arel-ops by admin@hopetrustindia.com.')).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Intro')).toBeDisabled();
  });

  it('swaps the post after asking, through the post picker', async () => {
    openWith(BLOG);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.listPosts).mockResolvedValue([
      { slug: 'surrender-to-win', title: 'Surrender to Win', date: '2025-11-08T11:22:02', has_image: true, sent: false },
    ]);
    vi.mocked(api.swapIssuePost).mockResolvedValue({ ...BLOG, post_slug: 'surrender-to-win', subject: 'Surrender to Win', title: 'Surrender to Win' });
    await userEvent.click(await screen.findByRole('button', { name: 'Swap post' }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose a post' });
    await userEvent.click(within(dialog).getByRole('button', { name: /Surrender to Win/ }));
    expect(api.swapIssuePost).toHaveBeenCalledWith('tkn', BLOG.id, 'surrender-to-win');
    expect(await screen.findByText('Swapped to “Surrender to Win”.')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Surrender to Win');
  });

  it('shows a missed blog issue read-only, with the reason', async () => {
    openWith({ ...BLOG, status: 'missed', reason: "It was more than 3 hours late, so it wasn't sent." });
    expect(await screen.findByText("It was more than 3 hours late, so it wasn't sent.")).toBeInTheDocument();
    expect(screen.getByLabelText('Intro')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^Save$/ })).toBeNull();
  });

  it('holds back a manual send while the 14-day gap runs, naming the next date', async () => {
    openWith(ISSUE, { next_allowed_date: '2099-01-06' });
    expect(await screen.findByText(`The next newsletter can go out on ${formatSlot(sendTimeOn('2099-01-06'))}.`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send to subscribers' })).toBeDisabled();
  });

  it('warns in the send dialog when the send will skip the next automatic newsletter', async () => {
    const nextSend = new Date(Date.now() + 5 * 86_400_000).toISOString();
    openWith(ISSUE, { next_send_at: nextSend });
    vi.mocked(api.getIssue).mockResolvedValue({ issue: ISSUE, ...FULL_ABOUT, next_send_at: nextSend });
    await userEvent.click(await screen.findByRole('button', { name: 'Send to subscribers' }));
    const dialog = await screen.findByRole('dialog', { name: 'Send to subscribers' });
    expect(within(dialog).getByText(`This will skip the automatic newsletter on ${formatSlot(new Date(nextSend))}.`)).toBeInTheDocument();
  });
});
