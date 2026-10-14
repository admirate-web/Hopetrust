// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { ResendError, type ResendClient } from '@/netlify/functions/_shared/resend.mts';
import { planPull, pushAndRecord, runSync } from '@/netlify/functions/_shared/newsletter-sync.mts';
import { SEGMENT, makeDeps } from './fakes';

const SYNCED = '2026-10-01T00:00:00.000Z';
const deadline = (deps: { now: () => Date }) => deps.now().getTime() + 7000;

function row(id: string, email: string, status: 'pending' | 'subscribed' | 'unsubscribed', synced: string | null) {
  return { id, email, status, source: 'website' as const, resend_contact_id: null, resend_synced_at: synced, updated_at: SYNCED };
}

describe('planPull', () => {
  it('marks rows unsubscribed on Resend\'s page, when nothing here is waiting to go to Resend', () => {
    const plan = planPull([{ id: 'c1', email: 'a@example.com', unsubscribed: true }], [row('r1', 'a@example.com', 'subscribed', SYNCED)]);
    expect(plan).toEqual({ markUnsubscribed: ['r1'], repush: [], removeFromSegment: [] });
  });

  it('leaves rows with a waiting change for the push: that change is newer consent', () => {
    const plan = planPull([{ id: 'c1', email: 'a@example.com', unsubscribed: true }], [row('r1', 'a@example.com', 'subscribed', null)]);
    expect(plan.markUnsubscribed).toEqual([]);
  });

  it('repushes our unsubscribe when the contact is subscribed in Resend again', () => {
    const plan = planPull([{ id: 'c1', email: 'a@example.com', unsubscribed: false }], [row('r1', 'a@example.com', 'unsubscribed', SYNCED)]);
    expect(plan.repush).toEqual(['r1']);
  });

  it('takes contacts with no consent on record out of the segment', () => {
    const plan = planPull(
      [
        { id: 'c1', email: 'stranger@example.com', unsubscribed: false },
        { id: 'c2', email: 'pending@example.com', unsubscribed: false },
      ],
      [row('r2', 'pending@example.com', 'pending', null)],
    );
    expect(plan.removeFromSegment).toEqual(['c1', 'c2']);
  });

  it('leaves subscribed rows alone and matches addresses whatever their case', () => {
    const plan = planPull([{ id: 'c1', email: 'Asha@Example.com', unsubscribed: false }], [row('r1', 'asha@example.com', 'subscribed', SYNCED)]);
    expect(plan).toEqual({ markUnsubscribed: [], repush: [], removeFromSegment: [] });
  });
});

describe('runSync: push', () => {
  it('creates a contact in the segment for a new subscriber and remembers its id', async () => {
    const { deps, memory, resend } = makeDeps();
    const r = memory.seed({ email: 'a@example.com' });
    const report = await runSync(deps, { pull: false, deadline: deadline(deps) });
    const contact = resend.find('a@example.com')!;
    expect(contact.segments.has(SEGMENT)).toBe(true);
    expect(memory.get(r.id)).toMatchObject({ resend_contact_id: contact.id, resend_synced_at: deps.now().toISOString() });
    expect(report).toMatchObject({ pushed: 1, failed: 0, remaining: 0 });
  });

  it('sends an unsubscribe', async () => {
    const { deps, memory, resend } = makeDeps();
    const contact = resend.add('a@example.com', { segments: [SEGMENT] });
    const r = memory.seed({ email: 'a@example.com', status: 'unsubscribed', resend_contact_id: contact.id });
    await runSync(deps, { pull: false, deadline: deadline(deps) });
    expect(contact.unsubscribed).toBe(true);
    expect(memory.get(r.id)?.resend_synced_at).not.toBeNull();
  });

  it('counts an unsubscribe as sent when Resend never had the contact', async () => {
    const { deps, memory } = makeDeps();
    const r = memory.seed({ email: 'a@example.com', status: 'unsubscribed' });
    await runSync(deps, { pull: false, deadline: deadline(deps) });
    expect(memory.get(r.id)).toMatchObject({ resend_contact_id: null });
    expect(memory.get(r.id)?.resend_synced_at).not.toBeNull();
  });

  it('adds an existing contact to the segment instead of creating a second one', async () => {
    const { deps, memory, resend } = makeDeps();
    const contact = resend.add('a@example.com');
    memory.seed({ email: 'a@example.com' });
    await runSync(deps, { pull: false, deadline: deadline(deps) });
    expect(resend.contacts.size).toBe(1);
    expect(contact.segments.has(SEGMENT)).toBe(true);
  });

  it('keeps an imported address unsubscribed when it already unsubscribed in Resend', async () => {
    const { deps, memory, resend } = makeDeps();
    const contact = resend.add('a@example.com', { unsubscribed: true });
    const r = memory.seed({ email: 'a@example.com', source: 'import' });
    await runSync(deps, { pull: false, deadline: deadline(deps) });
    expect(contact.unsubscribed).toBe(true);
    expect(memory.get(r.id)).toMatchObject({
      status: 'unsubscribed',
      unsubscribe_source: 'resend',
      source: 'import',
      resend_contact_id: contact.id,
    });
  });

  it('re-subscribes a website row whose contact is unsubscribed: a confirmation is fresh consent', async () => {
    const { deps, memory, resend } = makeDeps();
    const contact = resend.add('a@example.com', { unsubscribed: true, segments: [SEGMENT] });
    memory.seed({ email: 'a@example.com', source: 'website' });
    await runSync(deps, { pull: false, deadline: deadline(deps) });
    expect(contact.unsubscribed).toBe(false);
  });

  it('recreates a contact that was deleted in Resend', async () => {
    const { deps, memory, resend } = makeDeps();
    const r = memory.seed({ email: 'a@example.com', resend_contact_id: 'contact-deleted' });
    await runSync(deps, { pull: false, deadline: deadline(deps) });
    const contact = resend.find('a@example.com')!;
    expect(contact.segments.has(SEGMENT)).toBe(true);
    expect(memory.get(r.id)?.resend_contact_id).toBe(contact.id);
  });

  it('treats "already in the segment" as done', async () => {
    const { deps, memory, resend } = makeDeps();
    const contact = resend.add('a@example.com', { segments: [SEGMENT] });
    const r = memory.seed({ email: 'a@example.com', resend_contact_id: contact.id });
    resend.failNext('addToSegment', new ResendError(422, 'validation_error', 'Contact is already in this segment'));
    const report = await runSync(deps, { pull: false, deadline: deadline(deps) });
    expect(report.failed).toBe(0);
    expect(memory.get(r.id)?.resend_synced_at).not.toBeNull();
  });

  it('one failing row doesn\'t stop the others, and stays queued', async () => {
    const { deps, memory, resend } = makeDeps();
    const bad = memory.seed({ email: 'bad@example.com', updated_at: '2026-10-14T09:00:00.000Z' });
    memory.seed({ email: 'good@example.com', updated_at: '2026-10-14T09:30:00.000Z' });
    resend.failNext('getContact');
    const report = await runSync(deps, { pull: false, deadline: deadline(deps) });
    expect(report).toMatchObject({ pushed: 1, failed: 1, remaining: 1 });
    expect(report.errors[0]).toContain('bad@example.com');
    expect(memory.get(bad.id)?.resend_synced_at).toBeNull();
    expect(resend.find('good@example.com')).toBeDefined();
  });

  it('stops starting rows when the time budget runs out', async () => {
    const { deps, memory, clock } = makeDeps();
    // Every Resend call takes a second of the clock.
    const slow = new Proxy(deps.resend, {
      get(target, prop) {
        const value = (target as unknown as Record<string, unknown>)[prop as string];
        return typeof value === 'function'
          ? async (...args: unknown[]) => {
              clock.advance(1000);
              return (value as (...a: unknown[]) => unknown).apply(target, args);
            }
          : value;
      },
    }) as ResendClient;
    for (let i = 0; i < 5; i++) memory.seed({ email: `p${i}@example.com` });
    const report = await runSync({ ...deps, resend: slow }, { pull: false, deadline: deps.now().getTime() + 3000 });
    expect(report.pushed).toBe(2); // each new contact is a lookup and a create: 2 s
    expect(report.remaining).toBe(3);
  });

  it('does not mark a row synced if it changed while being pushed', async () => {
    const { deps, memory, resend } = makeDeps();
    const r = memory.seed({ email: 'a@example.com' });
    // An admin unsubscribes the person while their contact is being created.
    const racing: ResendClient = {
      ...deps.resend,
      async createContact(email, segmentId) {
        await deps.db.update(r.id, { status: 'unsubscribed', unsubscribe_source: 'admin', resend_synced_at: null });
        return deps.resend.createContact(email, segmentId);
      },
    };
    expect(await pushAndRecord({ ...deps, resend: racing }, memory.get(r.id)!)).toBe(false);
    expect(memory.get(r.id)).toMatchObject({ status: 'unsubscribed', resend_synced_at: null });
    await runSync(deps, { pull: false, deadline: deadline(deps) });
    expect(resend.find('a@example.com')?.unsubscribed).toBe(true);
  });
});

describe('runSync: pull', () => {
  it('copies unsubscribes from every page of a large segment', async () => {
    const { deps, memory, resend } = makeDeps();
    for (let i = 0; i < 150; i++) {
      const contact = resend.add(`p${i}@example.com`, { unsubscribed: true, segments: [SEGMENT] });
      memory.seed({ email: `p${i}@example.com`, resend_contact_id: contact.id, resend_synced_at: SYNCED });
    }
    const report = await runSync(deps, { pull: true, deadline: deadline(deps) });
    expect(report.unsubscribedInResend).toBe(150);
    expect((await deps.db.counts()).unsubscribed).toBe(150);
    expect(memory.byEmail('p149@example.com')).toMatchObject({ unsubscribe_source: 'resend' });
  });

  it('takes a stray contact out of the segment and puts our unsubscribe back', async () => {
    const { deps, memory, resend } = makeDeps();
    const stray = resend.add('stray@example.com', { segments: [SEGMENT] });
    const resubscribed = resend.add('left@example.com', { segments: [SEGMENT] });
    memory.seed({ email: 'left@example.com', status: 'unsubscribed', resend_contact_id: resubscribed.id, resend_synced_at: SYNCED });
    const report = await runSync(deps, { pull: true, deadline: deadline(deps) });
    expect(stray.segments.has(SEGMENT)).toBe(false);
    expect(resubscribed.unsubscribed).toBe(true);
    expect(report.removedFromSegment).toBe(1);
  });

  it('skips reading Resend when pull is false', async () => {
    const { deps, resend } = makeDeps();
    await runSync(deps, { pull: false, deadline: deadline(deps) });
    expect(resend.calls).not.toContain('listSegmentContacts');
  });
});
