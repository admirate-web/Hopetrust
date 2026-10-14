import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  UnauthorizedError,
  deleteSubscriber,
  downloadSubscribersCsv,
  fetchSubscribers,
  importSubscribers,
  syncUntilDone,
  unsubscribeSubscriber,
} from '@/lib/newsletter-admin';

const fetchMock = vi.fn();
const reply = (status: number, body: unknown, headers: Record<string, string> = {}) => ({
  ok: status < 300,
  status,
  json: async () => body,
  blob: async () => new Blob(['email\r\n']),
  headers: new Headers(headers),
});
const sync = (over: Record<string, unknown>) => ({
  unsubscribedInResend: 0, removedFromSegment: 0, pushed: 0, failed: 0, remaining: 0, errors: [], ...over,
});

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('newsletter admin client', () => {
  it('lists subscribers, sending the filters and the token', async () => {
    fetchMock.mockResolvedValue(reply(200, { subscribers: [], total: 0 }));
    await fetchSubscribers('t', { q: 'asha rao', status: 'subscribed', source: '', limit: 25, offset: 50 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin-newsletter-subscribers?q=asha+rao&status=subscribed&limit=25&offset=50');
    expect(init.headers.Authorization).toBe('Bearer t');
    expect(init.cache).toBe('no-store');
  });

  it('throws UnauthorizedError on 401, and the server\'s message on other errors', async () => {
    fetchMock.mockResolvedValueOnce(reply(401, { error: 'Unauthorized' }));
    await expect(fetchSubscribers('t')).rejects.toBeInstanceOf(UnauthorizedError);
    fetchMock.mockResolvedValueOnce(reply(409, { error: 'Only subscribed people can be unsubscribed.' }));
    await expect(unsubscribeSubscriber('t', 'a')).rejects.toThrow('Only subscribed people can be unsubscribed.');
  });

  it('posts an import chunk as JSON', async () => {
    fetchMock.mockResolvedValue(reply(200, { inserted: 1 }));
    const chunk = { batch_id: 'b', statement: 'Intake form 2025–26', attested: true as const, rows: [{ email: 'a@example.com', name: null }] };
    await importSubscribers('t', chunk);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin-newsletter-subscribers?action=import');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual(chunk);
  });

  it('unsubscribes and deletes by id', async () => {
    fetchMock.mockResolvedValue(reply(200, { subscriber: { id: 'a' }, ok: true }));
    await unsubscribeSubscriber('t', 'a');
    await deleteSubscriber('t', 'a');
    expect(fetchMock.mock.calls.map(([url, init]) => `${init.method} ${url}`)).toEqual([
      'PATCH /api/admin-newsletter-subscribers?id=a',
      'DELETE /api/admin-newsletter-subscribers?id=a',
    ]);
  });

  it('downloads the CSV for the current filters', async () => {
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:x'), configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
    const downloads: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });
    fetchMock.mockResolvedValue(
      reply(200, null, { 'content-disposition': 'attachment; filename="newsletter-subscribers-2026-10-14.csv"' }),
    );
    await downloadSubscribersCsv('t', { status: 'subscribed' });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin-newsletter-subscribers?status=subscribed&format=csv');
    expect(downloads).toEqual(['newsletter-subscribers-2026-10-14.csv']);
    click.mockRestore();
  });
});

describe('syncUntilDone', () => {
  it('keeps calling until everything is sent, reading Resend only on the first call', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, sync({ pushed: 40, remaining: 60, unsubscribedInResend: 2 })))
      .mockResolvedValueOnce(reply(200, sync({ pushed: 40, remaining: 20 })))
      .mockResolvedValueOnce(reply(200, sync({ pushed: 20, remaining: 0 })));
    const progress: number[] = [];
    const result = await syncUntilDone('t', (p) => progress.push(p.remaining));
    expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).pull)).toEqual([true, false, false]);
    expect(result).toMatchObject({ pushed: 100, remaining: 0, unsubscribedInResend: 2 });
    expect(progress).toEqual([60, 20, 0]);
  });

  it('stops when a call makes no progress, and passes on the errors', async () => {
    fetchMock.mockResolvedValue(reply(200, sync({ pushed: 0, failed: 1, remaining: 3, errors: ['x@example.com: Invalid email'] })));
    const result = await syncUntilDone('t');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ remaining: 3, errors: ['x@example.com: Invalid email'] });
  });
});
