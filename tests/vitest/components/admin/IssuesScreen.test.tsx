import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IssueRow } from '@/lib/newsletter/issue';

vi.mock('@/lib/newsletter-admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/newsletter-admin')>()),
  listIssues: vi.fn(),
  createIssue: vi.fn(),
}));

import IssuesScreen from '@/components/admin/newsletter/IssuesScreen';
import * as api from '@/lib/newsletter-admin';

afterEach(() => {
  vi.resetAllMocks();
});

describe('IssuesScreen', () => {
  it('lists the issues with their status, and opens one', async () => {
    vi.mocked(api.listIssues).mockResolvedValue({
      issues: [
        {
          id: 'b',
          subject: 'October',
          issue_date: '2026-10-14',
          status: 'sent',
          recipient_count: 312,
          sent_at: '2026-10-14T10:10:00.000Z',
          last_error: null,
          updated_at: '2026-10-14T10:10:00.000Z',
        },
        {
          id: 'a',
          subject: '',
          issue_date: '2026-10-20',
          status: 'draft',
          recipient_count: null,
          sent_at: null,
          last_error: null,
          updated_at: '2026-10-14T09:00:00.000Z',
        },
      ],
      me: 'admin@hopetrustindia.com',
      from: 'Hope Trust <newsletter@hopetrustindia.com>',
      subscribed: 312,
    });
    const onOpen = vi.fn();
    render(<IssuesScreen token="tkn" onUnauthorized={() => {}} onOpen={onOpen} />);
    expect(await screen.findByRole('button', { name: 'October' })).toBeInTheDocument();
    expect(screen.getByText('14th October, 2026')).toBeInTheDocument();
    expect(screen.getByText('Sent')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('312')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '(no subject)' }));
    expect(onOpen).toHaveBeenCalledWith('a');
  });

  it('starts a new issue and opens it', async () => {
    vi.mocked(api.listIssues).mockResolvedValue({ issues: [], me: 'a@x.com', from: 'x', subscribed: 0 });
    vi.mocked(api.createIssue).mockResolvedValue({ id: 'new-id' } as IssueRow);
    const onOpen = vi.fn();
    render(<IssuesScreen token="tkn" onUnauthorized={() => {}} onOpen={onOpen} />);
    expect(await screen.findByText(/No issues yet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /New issue/ }));
    expect(onOpen).toHaveBeenCalledWith('new-id');
  });

  it('sends an expired session back to the login', async () => {
    vi.mocked(api.listIssues).mockRejectedValue(new api.UnauthorizedError());
    const onUnauthorized = vi.fn();
    render(<IssuesScreen token="tkn" onUnauthorized={onUnauthorized} onOpen={() => {}} />);
    await vi.waitFor(() => expect(onUnauthorized).toHaveBeenCalled());
  });

  it('lists the scheduled newsletter first, with its send day, and labels skipped and missed ones', async () => {
    const row = (id: string, status: string, scheduled_for: string | null, subject: string) => ({
      id,
      subject,
      issue_date: '2026-10-20',
      status,
      recipient_count: null,
      sent_at: null,
      last_error: null,
      updated_at: '2026-10-18T04:30:00.000Z',
      kind: scheduled_for ? 'blog' : 'manual',
      scheduled_for,
      reason: null,
    });
    vi.mocked(api.listIssues).mockResolvedValue({
      issues: [
        row('m', 'draft', null, 'A draft by hand'),
        row('s', 'scheduled', '2026-10-20T04:30:00.000Z', 'The Most Important Connection'),
        row('k', 'skipped', '2026-10-06T04:30:00.000Z', 'No newsletter on Tue 6 Oct'),
        row('x', 'missed', '2026-09-22T04:30:00.000Z', 'Missed one'),
      ],
      me: 'a@x',
      from: 'Hope Trust <newsletter@hopetrustindia.com>',
      subscribed: 3,
    } as unknown as Awaited<ReturnType<typeof api.listIssues>>);
    render(<IssuesScreen token="tkn" onUnauthorized={() => {}} onOpen={() => {}} />);
    await screen.findByText('The Most Important Connection');
    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('The Most Important Connection');
    expect(rows[1]).toHaveTextContent('Scheduled · Tue 20 Oct');
    expect(screen.getByText('Skipped')).toBeInTheDocument();
    expect(screen.getByText('Missed')).toBeInTheDocument();
  });
});
