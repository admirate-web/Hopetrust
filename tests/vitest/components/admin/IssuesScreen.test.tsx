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
});
