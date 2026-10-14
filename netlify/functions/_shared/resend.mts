// The Resend REST calls the newsletter needs (spec §5, §9.3): contacts, the
// "Newsletter" segment and single emails. Contacts are global per address and
// segments group them (Resend's model since November 2025).
// API: https://resend.com/docs/api-reference
//
// Requests are spaced at least `minIntervalMs` apart to stay under Resend's
// 10 a second. A 429 waits for retry-after (at most 2 s) and tries once more.

export class ResendError extends Error {
  readonly status: number;
  readonly type: string;

  constructor(status: number, type: string, message: string) {
    super(message);
    this.name = 'ResendError';
    this.status = status;
    this.type = type;
  }
}

export interface ResendContact {
  id: string;
  email: string;
  unsubscribed: boolean;
}

export interface ContactPage {
  contacts: ResendContact[];
  hasMore: boolean;
}

export interface EmailInput {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface BroadcastInput {
  segmentId: string;
  from: string;
  replyTo?: string;
  subject: string;
  html: string;
  /** Resend's own label; the newsletter puts the issue id in it, so Check status can find it (spec §9.1). */
  name: string;
}

export interface BroadcastSummary {
  id: string;
  name: string;
  status: string;
  sentAt: string | null;
}

export interface BroadcastPage {
  broadcasts: BroadcastSummary[];
  hasMore: boolean;
}

export interface ResendClient {
  getContact(idOrEmail: string): Promise<ResendContact | null>;
  createContact(email: string, segmentId: string): Promise<string>;
  updateContact(idOrEmail: string, patch: { unsubscribed: boolean }): Promise<boolean>;
  deleteContact(idOrEmail: string): Promise<boolean>;
  addToSegment(contactId: string, segmentId: string): Promise<void>;
  removeFromSegment(contactId: string, segmentId: string): Promise<void>;
  contactSegmentIds(contactId: string): Promise<string[]>;
  listSegmentContacts(segmentId: string, after?: string): Promise<ContactPage>;
  sendEmail(input: EmailInput): Promise<string>;
  /** Creates a broadcast to the segment and sends it at once. Returns its id. */
  sendBroadcast(input: BroadcastInput): Promise<string>;
  /** One page of broadcasts, as Resend lists them. */
  listBroadcasts(after?: string): Promise<BroadcastPage>;
}

export interface ResendClientOptions {
  apiKey: string;
  fetch?: typeof fetch;
  /** Gap between request starts; 110 ms keeps one caller under 10 a second. */
  minIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  clock?: () => number;
  baseUrl?: string;
  /**
   * Gives up on creating a broadcast after this long (default 4 s), so the
   * function can still record that the outcome is unclear before Netlify
   * stops it.
   */
  broadcastTimeoutMs?: number;
}

const MAX_RETRY_WAIT_MS = 2000;
const NOT_FOUND = 404;

/** A contact id or email as a path segment. Resend's own examples keep a raw "@". */
export function contactKey(idOrEmail: string): string {
  return encodeURIComponent(idOrEmail).replace(/%40/g, '@');
}

function isNotFound(err: unknown): boolean {
  return err instanceof ResendError && err.status === NOT_FOUND;
}

type Json = Record<string, any>;

export function createResendClient(options: ResendClientOptions): ResendClient {
  const doFetch = options.fetch ?? fetch;
  const minInterval = options.minIntervalMs ?? 110;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const clock = options.clock ?? Date.now;
  const base = options.baseUrl ?? 'https://api.resend.com';
  let nextStart = 0;

  async function pace(): Promise<void> {
    const now = clock();
    const wait = nextStart - now;
    nextStart = Math.max(now, nextStart) + minInterval;
    if (wait > 0) await sleep(wait);
  }

  async function request(
    method: string,
    path: string,
    body?: unknown,
    retried = false,
    timeoutMs?: number,
  ): Promise<Json | null> {
    await pace();
    const res = await doFetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
    });
    if (res.status === 429 && !retried) {
      const seconds = Number(res.headers.get('retry-after'));
      await sleep(Math.min(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 1000, MAX_RETRY_WAIT_MS));
      return request(method, path, body, true, timeoutMs);
    }
    const text = await res.text();
    let data: Json | null = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }
    if (!res.ok) {
      throw new ResendError(
        res.status,
        typeof data?.name === 'string' ? data.name : 'http_error',
        typeof data?.message === 'string' ? data.message : `Resend returned ${res.status}`,
      );
    }
    return data;
  }

  const toContact = (c: Json): ResendContact => ({
    id: String(c.id),
    email: String(c.email).toLowerCase(),
    unsubscribed: Boolean(c.unsubscribed),
  });

  return {
    async getContact(idOrEmail) {
      try {
        return toContact((await request('GET', `/contacts/${contactKey(idOrEmail)}`)) ?? {});
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },

    async createContact(email, segmentId) {
      const created = await request('POST', '/contacts', { email, unsubscribed: false, segments: [{ id: segmentId }] });
      if (typeof created?.id !== 'string') throw new ResendError(502, 'bad_response', 'Resend did not return a contact id');
      return created.id;
    },

    async updateContact(idOrEmail, patch) {
      try {
        await request('PATCH', `/contacts/${contactKey(idOrEmail)}`, { unsubscribed: patch.unsubscribed });
        return true;
      } catch (err) {
        if (isNotFound(err)) return false;
        throw err;
      }
    },

    async deleteContact(idOrEmail) {
      try {
        await request('DELETE', `/contacts/${contactKey(idOrEmail)}`);
        return true;
      } catch (err) {
        if (isNotFound(err)) return false;
        throw err;
      }
    },

    async addToSegment(contactId, segmentId) {
      await request('POST', `/contacts/${contactKey(contactId)}/segments/${encodeURIComponent(segmentId)}`);
    },

    async removeFromSegment(contactId, segmentId) {
      try {
        await request('DELETE', `/contacts/${contactKey(contactId)}/segments/${encodeURIComponent(segmentId)}`);
      } catch (err) {
        if (!isNotFound(err)) throw err;
      }
    },

    async contactSegmentIds(contactId) {
      const data = (await request('GET', `/contacts/${contactKey(contactId)}/segments?limit=100`))?.data;
      return Array.isArray(data) ? data.map((s: Json) => String(s.id)) : [];
    },

    async listSegmentContacts(segmentId, after) {
      const query = new URLSearchParams({ segment_id: segmentId, limit: '100' });
      if (after) query.set('after', after);
      const page = await request('GET', `/contacts?${query}`);
      const data = page?.data;
      return {
        contacts: Array.isArray(data) ? data.map(toContact) : [],
        hasMore: Boolean(page?.has_more),
      };
    },

    async sendEmail(input) {
      const sent = await request('POST', '/emails', {
        from: input.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      });
      return String(sent?.id ?? '');
    },

    async sendBroadcast(input) {
      const created = await request(
        'POST',
        '/broadcasts',
        {
          segment_id: input.segmentId,
          from: input.from,
          subject: input.subject,
          html: input.html,
          name: input.name,
          send: true,
          ...(input.replyTo ? { reply_to: input.replyTo } : {}),
        },
        false,
        options.broadcastTimeoutMs ?? 4000,
      );
      if (typeof created?.id !== 'string') throw new ResendError(502, 'bad_response', 'Resend did not return a broadcast id');
      return created.id;
    },

    async listBroadcasts(after) {
      const query = new URLSearchParams({ limit: '100' });
      if (after) query.set('after', after);
      const page = await request('GET', `/broadcasts?${query}`);
      const data = page?.data;
      return {
        broadcasts: (Array.isArray(data) ? data : []).map((b: Json) => ({
          id: String(b.id),
          name: String(b.name ?? ''),
          status: String(b.status ?? ''),
          sentAt: typeof b.sent_at === 'string' ? b.sent_at : null,
        })),
        hasMore: Boolean(page?.has_more),
      };
    },
  };
}
