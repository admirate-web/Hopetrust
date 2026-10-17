// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { ResendError, contactKey, createResendClient } from '@/netlify/functions/_shared/resend.mts';

type Reply = { status: number; body?: unknown; headers?: Record<string, string> };

/** A fetch that answers with `replies` in order and records every request. */
function fakeFetch(replies: Reply[]) {
  const calls: Array<{ url: string; method: string; body: any; headers: Record<string, string> }> = [];
  const fn = async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({
      url: String(url),
      method: init.method ?? 'GET',
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      headers: init.headers as Record<string, string>,
    });
    const reply = replies.shift() ?? { status: 200, body: {} };
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status,
      headers: reply.headers,
    });
  };
  return { fn: fn as unknown as typeof fetch, calls };
}

function client(replies: Reply[], extra: { clock?: () => number; sleeps?: number[] } = {}) {
  const fake = fakeFetch(replies);
  const sleeps = extra.sleeps ?? [];
  const resend = createResendClient({
    apiKey: 're_test',
    fetch: fake.fn,
    minIntervalMs: extra.clock ? 110 : 0,
    clock: extra.clock,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { resend, calls: fake.calls, sleeps };
}

describe('contactKey', () => {
  it('encodes a plus sign but keeps the @, as in Resend\'s examples', () => {
    expect(contactKey('asha+news@example.com')).toBe('asha%2Bnews@example.com');
    expect(contactKey('e169aa45-1ecf-4183-9955-b1499d5701d3')).toBe('e169aa45-1ecf-4183-9955-b1499d5701d3');
  });
});

describe('createResendClient', () => {
  it('sends the API key', async () => {
    const { resend, calls } = client([{ status: 200, body: { id: 'c1', email: 'a@example.com', unsubscribed: false } }]);
    await resend.getContact('a@example.com');
    expect(calls[0].headers.Authorization).toBe('Bearer re_test');
  });

  it('getContact maps the contact, and returns null when Resend has no such contact', async () => {
    const { resend, calls } = client([
      { status: 200, body: { object: 'contact', id: 'c1', email: 'a@example.com', unsubscribed: true } },
      { status: 404, body: { statusCode: 404, name: 'not_found', message: 'Contact not found' } },
    ]);
    expect(await resend.getContact('a@example.com')).toEqual({ id: 'c1', email: 'a@example.com', unsubscribed: true });
    expect(await resend.getContact('b@example.com')).toBeNull();
    expect(calls[0].url).toBe('https://api.resend.com/contacts/a@example.com');
  });

  it('createContact puts the contact straight into the segment', async () => {
    const { resend, calls } = client([{ status: 201, body: { object: 'contact', id: 'c9' } }]);
    expect(await resend.createContact('a@example.com', 'seg-1')).toBe('c9');
    expect(calls[0]).toMatchObject({
      url: 'https://api.resend.com/contacts',
      method: 'POST',
      body: { email: 'a@example.com', unsubscribed: false, segments: [{ id: 'seg-1' }] },
    });
  });

  it('updateContact and deleteContact report a missing contact as false', async () => {
    const { resend, calls } = client([
      { status: 200, body: { id: 'c1' } },
      { status: 404, body: { name: 'not_found', message: 'nope' } },
      { status: 200, body: { deleted: true } },
      { status: 404, body: { name: 'not_found', message: 'nope' } },
    ]);
    expect(await resend.updateContact('c1', { unsubscribed: true })).toBe(true);
    expect(await resend.updateContact('x@example.com', { unsubscribed: true })).toBe(false);
    expect(await resend.deleteContact('c1')).toBe(true);
    expect(await resend.deleteContact('c1')).toBe(false);
    expect(calls[0]).toMatchObject({ method: 'PATCH', body: { unsubscribed: true } });
    expect(calls[2]).toMatchObject({ method: 'DELETE', url: 'https://api.resend.com/contacts/c1' });
  });

  it('adds to and removes from a segment by contact id', async () => {
    const { resend, calls } = client([
      { status: 200, body: { id: 'seg-1' } },
      { status: 404, body: { name: 'not_found', message: 'gone' } },
    ]);
    await resend.addToSegment('c1', 'seg-1');
    await resend.removeFromSegment('c1', 'seg-1'); // a 404 counts as already removed
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST https://api.resend.com/contacts/c1/segments/seg-1',
      'DELETE https://api.resend.com/contacts/c1/segments/seg-1',
    ]);
  });

  it('lists a segment a page at a time, lower-casing emails', async () => {
    const { resend, calls } = client([
      {
        status: 200,
        body: { object: 'list', has_more: true, data: [{ id: 'c1', email: 'Asha@Example.com', unsubscribed: false }] },
      },
    ]);
    const page = await resend.listSegmentContacts('seg-1', 'c0');
    expect(page).toEqual({ contacts: [{ id: 'c1', email: 'asha@example.com', unsubscribed: false }], hasMore: true });
    expect(calls[0].url).toBe('https://api.resend.com/contacts?segment_id=seg-1&limit=100&after=c0');
  });

  it('lists the segments a contact is in', async () => {
    const { resend } = client([{ status: 200, body: { data: [{ id: 'seg-1' }, { id: 'seg-2' }], has_more: false } }]);
    expect(await resend.contactSegmentIds('c1')).toEqual(['seg-1', 'seg-2']);
  });

  it('sendEmail maps replyTo to reply_to', async () => {
    const { resend, calls } = client([{ status: 200, body: { id: 'email-1' } }]);
    const id = await resend.sendEmail({
      from: 'Hope Trust <newsletter@hopetrustindia.com>',
      to: ['a@example.com'],
      subject: 'Hi',
      html: '<p>Hi</p>',
      text: 'Hi',
      replyTo: 'frontoffice@hopetrustindia.com',
    });
    expect(id).toBe('email-1');
    expect(calls[0].body).toEqual({
      from: 'Hope Trust <newsletter@hopetrustindia.com>',
      to: ['a@example.com'],
      subject: 'Hi',
      html: '<p>Hi</p>',
      text: 'Hi',
      reply_to: 'frontoffice@hopetrustindia.com',
    });
  });

  it('sendEmail gives up after its time limit', async () => {
    let signal: AbortSignal | null | undefined;
    const slowFetch = (_url: string, init: RequestInit) => {
      signal = init.signal;
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    };
    const resend = createResendClient({ apiKey: 're_test', minIntervalMs: 0, fetch: slowFetch as unknown as typeof fetch });
    const email = { from: 'Hope Trust <newsletter@hopetrustindia.com>', to: ['a@example.com'], subject: 'Hi', html: '<p>Hi</p>' };
    await expect(resend.sendEmail({ ...email, timeoutMs: 20 })).rejects.toThrow();
    expect(signal?.aborted).toBe(true);
  }, 1000);

  it('turns an error reply into a ResendError with its status, type and message', async () => {
    const { resend } = client([
      { status: 422, body: { statusCode: 422, name: 'validation_error', message: 'Invalid `email` field.' } },
    ]);
    const err = await resend.createContact('bad', 'seg-1').catch((e) => e);
    expect(err).toBeInstanceOf(ResendError);
    expect(err).toMatchObject({ status: 422, type: 'validation_error', message: 'Invalid `email` field.' });
  });

  it('waits for retry-after on a 429, at most 2 seconds, then tries once more', async () => {
    const { resend, sleeps, calls } = client([
      { status: 429, headers: { 'retry-after': '5' }, body: { name: 'rate_limit_exceeded', message: 'slow down' } },
      { status: 200, body: { id: 'c1', email: 'a@example.com', unsubscribed: false } },
    ]);
    expect(await resend.getContact('a@example.com')).not.toBeNull();
    expect(sleeps).toContain(2000);
    expect(calls).toHaveLength(2);
  });

  it('gives up after a second 429', async () => {
    const { resend } = client([
      { status: 429, headers: { 'retry-after': '1' }, body: { name: 'rate_limit_exceeded', message: 'slow down' } },
      { status: 429, headers: { 'retry-after': '1' }, body: { name: 'rate_limit_exceeded', message: 'slow down' } },
    ]);
    await expect(resend.getContact('a@example.com')).rejects.toMatchObject({ status: 429 });
  });

  it('spaces requests 110 ms apart', async () => {
    let now = 0;
    const sleeps: number[] = [];
    const fake = fakeFetch([]);
    const resend = createResendClient({
      apiKey: 're_test',
      fetch: fake.fn,
      clock: () => now,
      sleep: async (ms) => {
        sleeps.push(ms);
        now += ms;
      },
    });
    await resend.updateContact('c1', { unsubscribed: true });
    await resend.updateContact('c2', { unsubscribed: true });
    await resend.updateContact('c3', { unsubscribed: true });
    expect(sleeps).toEqual([110, 110]);
  });
});

describe('broadcasts', () => {
  const input = {
    segmentId: 'seg',
    from: 'Hope Trust <newsletter@hopetrustindia.com>',
    replyTo: 'frontoffice@hopetrustindia.com',
    subject: 'Hello',
    html: '<p>Hi</p>',
    name: 'Hello [issue x]',
  };

  it('creates the broadcast and sends it in one call', async () => {
    const { resend, calls } = client([{ status: 200, body: { object: 'broadcast', id: 'b-1' } }]);
    expect(await resend.sendBroadcast(input)).toBe('b-1');
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe('https://api.resend.com/broadcasts');
    expect(calls[0].body).toEqual({
      segment_id: 'seg',
      from: 'Hope Trust <newsletter@hopetrustindia.com>',
      subject: 'Hello',
      html: '<p>Hi</p>',
      name: 'Hello [issue x]',
      send: true,
      reply_to: 'frontoffice@hopetrustindia.com',
    });
  });

  it('treats an answer without an id as a server error', async () => {
    const { resend } = client([{ status: 200, body: {} }]);
    await expect(resend.sendBroadcast(input)).rejects.toMatchObject({ status: 502 });
  });

  it('passes on a refusal with its status', async () => {
    const { resend } = client([{ status: 422, body: { name: 'validation_error', message: 'Bad from' } }]);
    await expect(resend.sendBroadcast(input)).rejects.toMatchObject({ status: 422, message: 'Bad from' });
  });

  it('gives up on a broadcast that takes too long, so the send can be checked later', async () => {
    let signal: AbortSignal | null | undefined;
    const slowFetch = (_url: string, init: RequestInit) => {
      signal = init.signal;
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    };
    const resend = createResendClient({
      apiKey: 're_test',
      minIntervalMs: 0,
      broadcastTimeoutMs: 20,
      fetch: slowFetch as unknown as typeof fetch,
    });
    await expect(resend.sendBroadcast(input)).rejects.toThrow();
    expect(signal?.aborted).toBe(true);
  });

  it('lists broadcasts a page at a time', async () => {
    const { resend, calls } = client([
      {
        status: 200,
        body: {
          object: 'list',
          has_more: true,
          data: [
            { id: 'b-2', name: 'Two [issue y]', status: 'sent', sent_at: '2026-10-14T10:00:00.000Z', segment_id: 'seg' },
            { id: 'b-1', name: null, status: 'draft', sent_at: null },
          ],
        },
      },
    ]);
    expect(await resend.listBroadcasts('b-3')).toEqual({
      broadcasts: [
        { id: 'b-2', name: 'Two [issue y]', status: 'sent', sentAt: '2026-10-14T10:00:00.000Z' },
        { id: 'b-1', name: '', status: 'draft', sentAt: null },
      ],
      hasMore: true,
    });
    expect(calls[0].url).toBe('https://api.resend.com/broadcasts?limit=100&after=b-3');
  });
});
