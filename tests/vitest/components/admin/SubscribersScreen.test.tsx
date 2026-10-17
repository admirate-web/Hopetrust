import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SubscribersScreen from '@/components/admin/newsletter/SubscribersScreen';
import { UnauthorizedError } from '@/lib/newsletter-admin';
import type { AdminSubscriber } from '@/lib/newsletter/subscriber';

const mocks = vi.hoisted(() => ({
  fetchSubscribers: vi.fn(),
  unsubscribeSubscriber: vi.fn(),
  deleteSubscriber: vi.fn(),
  downloadSubscribersCsv: vi.fn(),
  syncUntilDone: vi.fn(),
}));

vi.mock('@/lib/newsletter-admin', () => {
  class UnauthorizedError extends Error {}
  return { UnauthorizedError, ...mocks };
});

function subscriber(over: Partial<AdminSubscriber>): AdminSubscriber {
  return {
    id: 'a', email: 'asha@example.com', full_name: 'Asha Rao', status: 'subscribed', source: 'website',
    consent_at: '2026-10-10T06:30:00.000Z', consent_note: null, imported_by: null, import_batch_id: null,
    signup_page: '/blogs/', signup_ip: null, signup_user_agent: null, signup_notice: '2026-10',
    confirm_sent_at: null, confirm_send_count: 0, unsubscribed_at: null, unsubscribe_source: null,
    resend_contact_id: null, resend_synced_at: null,
    created_at: '2026-10-10T06:00:00.000Z', updated_at: '2026-10-10T06:30:00.000Z',
    ...over,
  };
}

const LIST = {
  subscribers: [
    subscriber({}),
    subscriber({ id: 'b', email: 'ravi@example.com', full_name: 'Ravi', status: 'pending', consent_at: null }),
  ],
  total: 2,
  counts: { pending: 1, subscribed: 1, unsubscribed: 0 },
  needs_push: 1,
  limit: 25,
  offset: 0,
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.fetchSubscribers.mockResolvedValue(LIST);
});

function setup() {
  const onUnauthorized = vi.fn();
  render(<SubscribersScreen token="t" onUnauthorized={onUnauthorized} />);
  return { onUnauthorized };
}

describe('SubscribersScreen', () => {
  it('lists subscribers with their status, and the counts', async () => {
    setup();
    const list = await screen.findByRole('list');
    expect(within(list).getByText('asha@example.com')).toBeInTheDocument();
    expect(within(list).getByText('Subscribed')).toBeInTheDocument();
    expect(within(list).getByText('Not confirmed yet')).toBeInTheDocument();
    expect(screen.getByText(/1 subscribed · 1 not confirmed yet · 0 unsubscribed · 1 change waiting for Resend/)).toBeInTheDocument();
  });

  it('offers Unsubscribe only to subscribed people', async () => {
    setup();
    await screen.findByRole('list');
    expect(screen.getByRole('button', { name: 'Unsubscribe asha@example.com' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unsubscribe ravi@example.com' })).toBeNull();
  });

  it('unsubscribes after asking, then reloads', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mocks.unsubscribeSubscriber.mockResolvedValue(subscriber({ status: 'unsubscribed' }));
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Unsubscribe asha@example.com' }));
    expect(mocks.unsubscribeSubscriber).toHaveBeenCalledWith('t', 'a');
    expect(await screen.findByText('asha@example.com is unsubscribed.')).toBeInTheDocument();
    expect(mocks.fetchSubscribers).toHaveBeenCalledTimes(2);
  });

  it('does nothing when the admin cancels', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete asha@example.com' }));
    expect(mocks.deleteSubscriber).not.toHaveBeenCalled();
  });

  it('deletes after asking', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mocks.deleteSubscriber.mockResolvedValue(undefined);
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete ravi@example.com' }));
    expect(mocks.deleteSubscriber).toHaveBeenCalledWith('t', 'b');
    expect(await screen.findByText('ravi@example.com was deleted.')).toBeInTheDocument();
  });

  it('syncs until Resend is up to date and says what happened', async () => {
    mocks.syncUntilDone.mockResolvedValue({ unsubscribedInResend: 1, removedFromSegment: 0, pushed: 3, failed: 0, remaining: 0, errors: [] });
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Sync with Resend' }));
    expect(await screen.findByText('Sent 3 changes to Resend; 1 unsubscribed from an email.')).toBeInTheDocument();
  });

  it('opens the import dialog', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Import' }));
    expect(screen.getByRole('dialog', { name: 'Import subscribers' })).toBeInTheDocument();
  });

  it('sends an expired session back to the login', async () => {
    mocks.fetchSubscribers.mockRejectedValue(new UnauthorizedError());
    const { onUnauthorized } = setup();
    await vi.waitFor(() => expect(onUnauthorized).toHaveBeenCalled());
  });
});
