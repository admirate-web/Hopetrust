import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BodyDoc } from '@/lib/newsletter/content';
import { toDraft, type IssueRow } from '@/lib/newsletter/issue';

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
    await userEvent.type(await screen.findByLabelText(/Blog link/), 'hopetrustindia.com/blogs/');
    vi.mocked(api.saveIssue).mockRejectedValue(new api.IssueApiError(SHARE_LINK_ERROR, 400, null, []));
    await userEvent.click(screen.getByRole('button', { name: /Send test/ }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Send test/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The Share link must be a web address');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.sendTestIssue).not.toHaveBeenCalled();
  });

  it('closes the send dialog to show why saving first failed, and sends nothing', async () => {
    open();
    await userEvent.type(await screen.findByLabelText(/Blog link/), 'hopetrustindia.com/blogs/');
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
