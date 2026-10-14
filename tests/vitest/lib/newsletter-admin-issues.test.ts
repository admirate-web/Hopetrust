import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  IssueApiError,
  UnauthorizedError,
  checkIssue,
  createIssue,
  saveIssue,
  sendIssue,
  sendTestIssue,
} from '@/lib/newsletter-admin';

afterEach(() => {
  vi.unstubAllGlobals();
});

function respond(status: number, body: unknown) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const DRAFT = {
  subject: 'S',
  preheader: '',
  issue_date: '2026-10-14',
  title: 'T',
  hero_image_url: null,
  hero_image_alt: '',
  body: { type: 'doc' as const, content: [] },
  share_url: null,
};

describe('the issues API client', () => {
  it('saves the whole draft with the version it was loaded at', async () => {
    const fetchMock = respond(200, { issue: { id: 'i', ...DRAFT } });
    await saveIssue('tkn', 'i', DRAFT, '2026-10-14T10:00:00.000Z');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin-newsletter-issues?id=i',
      expect.objectContaining({
        method: 'PATCH',
        headers: { Authorization: 'Bearer tkn', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...DRAFT, updated_at: '2026-10-14T10:00:00.000Z' }),
      }),
    );
  });

  it('creates, tests, sends and checks with POSTs to the right actions', async () => {
    const fetchMock = respond(200, { issue: { id: 'i' }, to: ['a@x.com'], found: true });
    await createIssue('tkn');
    await sendTestIssue('tkn', 'i', ['a@x.com']);
    await sendIssue('tkn', 'i');
    await checkIssue('tkn', 'i');
    expect(fetchMock.mock.calls.map(([url, init]) => `${init?.method} ${url}`)).toEqual([
      'POST /api/admin-newsletter-issues?',
      'POST /api/admin-newsletter-issues?id=i&action=test',
      'POST /api/admin-newsletter-issues?id=i&action=send',
      'POST /api/admin-newsletter-issues?id=i&action=check',
    ]);
  });

  it('passes on the issue and the problems when the server refuses', async () => {
    respond(400, { error: 'Add a title.', problems: ['Add a title.'], issue: { id: 'i', status: 'draft' } });
    const err = await sendIssue('tkn', 'i').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(IssueApiError);
    expect(err).toMatchObject({
      message: 'Add a title.',
      status: 400,
      problems: ['Add a title.'],
      issue: { id: 'i', status: 'draft' },
    });
  });

  it('reports an expired session', async () => {
    respond(401, { error: 'Unauthorized' });
    await expect(createIssue('tkn')).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
