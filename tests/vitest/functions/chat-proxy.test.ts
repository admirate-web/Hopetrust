import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

let handler: (req: Request) => Promise<Response>;

beforeAll(async () => {
  const mod = await import('../../../netlify/functions/whatsapp-crm.mjs');
  handler = mod.default;
});

// A distinct IP per test. The rate limiter is deliberately in-process, so
// sharing one address would let an earlier test spend a later one's budget.
function post(
  body: unknown,
  { origin = 'https://hopetrustindia.com', ip = '10.0.0.1' } = {}
) {
  return new Request('https://hopetrustindia.com/api/chat', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body)
  });
}

beforeEach(() => {
  process.env.CRM_ENDPOINT = 'https://n8n.example/webhook/web-chat';
  process.env.WHATSAPP_CRM_TOKEN = 'test-token';
  vi.restoreAllMocks();
});

describe('chat proxy', () => {
  it('forwards the message and never leaks the token to the caller', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ reply: 'hi', links: [], state: {} }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await handler(post({ message: 'hello', state: {} }, { ip: '10.0.1.1' }));
    const sent = fetchMock.mock.calls[0][1];

    expect(JSON.parse(sent.body).message).toBe('hello');
    expect(sent.headers.authorization).toBe('Bearer test-token');
    expect(await res.text()).not.toContain('test-token');
  });

  it('forwards the last six messages of history, cleaned', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const history = [
      ...Array.from({ length: 8 }, (_, i) => ({ from: i % 2 ? 'them' : 'us', body: `m${i}` })),
      { from: 'admin', body: 'x' }, { from: 'us', body: 'y'.repeat(5000) }
    ];
    await handler(post({ message: 'and the first one?', history, state: { step: 'X' } }, { ip: '10.0.2.1' }));
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.history).toHaveLength(6);
    expect(sent.history[5].body).toHaveLength(1000);
    expect(sent.history.some((h: { from: string }) => h.from === 'admin')).toBe(false);
    expect(sent.state).toBeUndefined();
  });

  it('forwards an empty history when the browser sends rubbish', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await handler(post({ message: 'hi', history: 'nope' }, { ip: '10.0.2.2' }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).history).toEqual([]);
  });

  // A body arrives exactly as written, because n8n matches earlier replies
  // against its own answers character for character. Only who spoke and what
  // they said go with it.
  it('passes each body on exactly as written, with only who spoke', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const body = '  Our coordinators\n\ncan help.  ';
    await handler(post({ message: 'ok', history: [{ from: 'them', body, at: 1 }] }, { ip: '10.0.2.3' }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).history).toEqual([{ from: 'them', body }]);
  });

  it('refuses a request from an origin that is not the site', async () => {
    const res = await handler(post({ message: 'hi' }, { origin: 'https://evil.example', ip: '10.0.3.1' }));
    expect(res.headers.get('access-control-allow-origin')).not.toBe('https://evil.example');
  });

  it('rate limits a caller that floods it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    let last: Response | undefined;
    for (let i = 0; i < 40; i += 1) last = await handler(post({ message: 'hi' }, { ip: '10.0.4.1' }));
    expect(last?.status).toBe(429);
  });

  it('returns 502 rather than throwing when n8n is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const res = await handler(post({ message: 'hi' }, { ip: '10.0.5.1' }));
    expect(res.status).toBe(502);
  });

  // Nothing a person typed may sit in a Netlify log line. The transcript rule
  // that shaped the database applies to the pipe as much as to the store.
  it('says nothing about the message when it fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const res = await handler(post({ message: 'i drink every night' }, { ip: '10.0.6.1' }));
    expect(await res.text()).not.toContain('drink');
  });

  it('refuses a method that is not POST', async () => {
    const res = await handler(
      new Request('https://hopetrustindia.com/api/chat', {
        method: 'GET',
        headers: { origin: 'https://hopetrustindia.com', 'x-forwarded-for': '10.0.7.1' }
      })
    );
    expect(res.status).toBe(405);
  });

  it('answers a CORS preflight', async () => {
    const res = await handler(
      new Request('https://hopetrustindia.com/api/chat', {
        method: 'OPTIONS',
        headers: { origin: 'https://hopetrustindia.com', 'x-forwarded-for': '10.0.8.1' }
      })
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://hopetrustindia.com');
  });

  // Env is read at invoke, not at module load: a missing secret must fail
  // closed on the request rather than at deploy time in a way nobody sees.
  it('refuses to run unconfigured', async () => {
    delete process.env.WHATSAPP_CRM_TOKEN;
    const res = await handler(post({ message: 'hi' }, { ip: '10.0.9.1' }));
    expect(res.status).toBe(500);
  });
});
