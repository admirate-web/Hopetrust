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
}

export interface ResendClientOptions {
  apiKey: string;
  fetch?: typeof fetch;
  /** Gap between request starts; 110 ms keeps one caller under 10 a second. */
  minIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  clock?: () => number;
  baseUrl?: string;
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

  async function request(method: string, path: string, body?: unknown, retried = false): Promise<Json | null> {
    await pace();
    const res = await doFetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 429 && !retried) {
      const seconds = Number(res.headers.get('retry-after'));
      await sleep(Math.min(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 1000, MAX_RETRY_WAIT_MS));
      return request(method, path, body, true);
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
      const page = await request('GET', `/contacts/${contactKey(contactId)}/segments?limit=100`);
      return Array.isArray(page?.data) ? page.data.map((s: Json) => String(s.id)) : [];
    },

    async listSegmentContacts(segmentId, after) {
      const query = new URLSearchParams({ segment_id: segmentId, limit: '100' });
      if (after) query.set('after', after);
      const page = await request('GET', `/contacts?${query}`);
      return {
        contacts: Array.isArray(page?.data) ? page.data.map(toContact) : [],
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
  };
}
