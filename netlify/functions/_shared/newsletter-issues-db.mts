// Data access for newsletter issues (Database/newsletter.sql §6) and their
// images (Database/newsletter-storage.sql), through the service-role Supabase
// client. Status changes are guarded updates: a send can only start from a
// draft, and only finish from 'sending' or 'needs_check' (spec §9.1). Tests
// use the in-memory versions in tests/vitest/functions/newsletter/fakes.ts.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { IssueDraft, IssueRow, IssueStatus, IssueSummary } from '../../../lib/newsletter/issue';

export interface SentFields {
  resend_broadcast_id: string;
  recipient_count: number | null;
  sent_at: string;
}

/** A blog issue as the automatic run creates it: scheduled, or skipped with the reason (fortnightly spec §5.3). */
export type BlogSlotFields = IssueDraft & {
  kind: 'blog';
  post_slug: string | null;
  reading_minutes: number | null;
  scheduled_for: string;
  status: 'scheduled' | 'skipped';
  reason: string | null;
};

/** Who the automatic run writes as. */
export const AUTOMATIC_ACTOR = 'automatic';

export interface IssuesDb {
  /** Newest first. */
  list(): Promise<IssueSummary[]>;
  get(id: string): Promise<IssueRow | null>;
  create(fields: IssueDraft, actor: string): Promise<IssueRow>;
  /** Saves a draft's or scheduled issue's fields if unchanged since `ifUpdatedAt`; otherwise null. */
  saveDraft(id: string, fields: IssueDraft, actor: string, ifUpdatedAt: string): Promise<IssueRow | null>;
  /** Deletes a draft; false when there is no draft with that id. */
  deleteDraft(id: string): Promise<boolean>;
  /** `from` → sending, with who started it and the issue number the email shows; null when it wasn't `from`. */
  lockForSend(id: string, actor: string, issueNumber: number, from: 'draft' | 'scheduled'): Promise<IssueRow | null>;
  /** sending or needs_check → sent. */
  markSent(id: string, fields: SentFields): Promise<IssueRow | null>;
  /** sending or needs_check → `to` (draft unless a scheduled send will retry), with the reason the editor shows. */
  backToDraft(id: string, error: string | null, to?: 'draft' | 'scheduled'): Promise<IssueRow | null>;
  /** sending → needs_check: Resend's answer was unclear. */
  markNeedsCheck(id: string, error: string): Promise<IssueRow | null>;
  /** The blog issue for a send time; null when another run created it first. */
  createBlog(fields: BlogSlotFields): Promise<IssueRow | null>;
  blogSlot(scheduledFor: string): Promise<IssueRow | null>;
  /** Marks the preview as sent; false when a run already claimed it. */
  claimPreview(id: string, at: string): Promise<boolean>;
  /** Gives the claim back after the preview email failed, so the next run retries. */
  releasePreview(id: string): Promise<void>;
  /** One of `from` → `to`, with the reason; null when it wasn't in `from`. */
  setOutcome(id: string, from: IssueStatus[], to: 'skipped' | 'missed' | 'draft', reason: string): Promise<IssueRow | null>;
  /** Blog issues still scheduled for before `before`. */
  overdueScheduled(before: string): Promise<IssueRow[]>;
  /** Blog issues whose send is unconfirmed: needs_check, or sending (the caller checks how long). */
  blogNeedsCheck(): Promise<IssueRow[]>;
  lastSentAt(): Promise<string | null>;
  sentPostSlugs(): Promise<string[]>;
  /** The hero photos of the last `n` sent issues, newest first. */
  recentHeroImages(n: number): Promise<string[]>;
  /** One more than the highest number given so far, or 1. */
  nextIssueNumber(): Promise<number>;
}

export interface UploadTicket {
  path: string;
  token: string;
  signedUrl: string;
  publicUrl: string;
}

export interface ImageStorage {
  /** A signed URL the browser uploads one image to (spec §10.4). */
  createUploadUrl(path: string): Promise<UploadTicket>;
}

const ISSUES = 'newsletter_issues';
export const IMAGES_BUCKET = 'newsletter-images';
const SUMMARY_COLUMNS =
  'id, subject, issue_date, status, recipient_count, sent_at, last_error, updated_at, kind, scheduled_for, reason';
const LIST_LIMIT = 200;
/** The columns' check constraints. */
const MAX_ERROR = 2000;
const MAX_REASON = 500;
const UNIQUE_VIOLATION = '23505';

const clip = (error: string | null) => (error === null ? null : error.slice(0, MAX_ERROR));

export function createIssuesDb(supabase: SupabaseClient): IssuesDb {
  const table = () => supabase.from(ISSUES);

  function check(error: { message: string } | null): void {
    if (error) throw new Error(`${ISSUES}: ${error.message}`);
  }

  /** Runs a guarded update: the changed row, or null when the guard didn't match. */
  async function changed(query: any): Promise<IssueRow | null> {
    const { data, error } = await query.select('*').maybeSingle();
    check(error);
    return (data as IssueRow | null) ?? null;
  }

  return {
    async list() {
      const { data, error } = await table()
        .select(SUMMARY_COLUMNS)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(LIST_LIMIT);
      check(error);
      return (data ?? []) as IssueSummary[];
    },

    async get(id) {
      const { data, error } = await table().select('*').eq('id', id).maybeSingle();
      check(error);
      return (data as IssueRow | null) ?? null;
    },

    async create(fields, actor) {
      const { data, error } = await table()
        .insert({ ...fields, created_by: actor, updated_by: actor })
        .select('*')
        .single();
      check(error);
      return data as IssueRow;
    },

    saveDraft: (id, fields, actor, ifUpdatedAt) =>
      changed(
        table()
          .update({ ...fields, updated_by: actor })
          .eq('id', id)
          .in('status', ['draft', 'scheduled'])
          .eq('updated_at', ifUpdatedAt),
      ),

    async deleteDraft(id) {
      const { data, error } = await table().delete().eq('id', id).eq('status', 'draft').select('id');
      check(error);
      return (data?.length ?? 0) > 0;
    },

    lockForSend: (id, actor, issueNumber, from) =>
      changed(
        table()
          .update({ status: 'sending', sent_by: actor, last_error: null, issue_number: issueNumber })
          .eq('id', id)
          .eq('status', from),
      ),

    markSent: (id, fields) =>
      changed(
        table()
          .update({ ...fields, status: 'sent', last_error: null })
          .eq('id', id)
          .in('status', ['sending', 'needs_check']),
      ),

    backToDraft: (id, error, to = 'draft') =>
      changed(
        table()
          .update({ status: to, sent_by: null, last_error: clip(error), issue_number: null })
          .eq('id', id)
          .in('status', ['sending', 'needs_check']),
      ),

    markNeedsCheck: (id, error) =>
      changed(table().update({ status: 'needs_check', last_error: clip(error) }).eq('id', id).eq('status', 'sending')),

    async createBlog(fields) {
      const { data, error } = await table()
        .insert({ ...fields, created_by: AUTOMATIC_ACTOR, updated_by: AUTOMATIC_ACTOR })
        .select('*')
        .single();
      if (error?.code === UNIQUE_VIOLATION) return null;
      check(error);
      return data as IssueRow;
    },

    async blogSlot(scheduledFor) {
      const { data, error } = await table().select('*').eq('kind', 'blog').eq('scheduled_for', scheduledFor).maybeSingle();
      check(error);
      return (data as IssueRow | null) ?? null;
    },

    async claimPreview(id, at) {
      const { data, error } = await table().update({ preview_sent_at: at }).eq('id', id).is('preview_sent_at', null).select('id');
      check(error);
      return (data?.length ?? 0) > 0;
    },

    async releasePreview(id) {
      const { error } = await table().update({ preview_sent_at: null }).eq('id', id);
      check(error);
    },

    setOutcome: (id, from, to, reason) =>
      changed(table().update({ status: to, reason: reason.slice(0, MAX_REASON) }).eq('id', id).in('status', from)),

    async overdueScheduled(before) {
      const { data, error } = await table()
        .select('*')
        .eq('kind', 'blog')
        .eq('status', 'scheduled')
        .lt('scheduled_for', before);
      check(error);
      return (data ?? []) as IssueRow[];
    },

    async blogNeedsCheck() {
      const { data, error } = await table().select('*').eq('kind', 'blog').in('status', ['needs_check', 'sending']);
      check(error);
      return (data ?? []) as IssueRow[];
    },

    async lastSentAt() {
      const { data, error } = await table()
        .select('sent_at')
        .eq('status', 'sent')
        .order('sent_at', { ascending: false })
        .limit(1);
      check(error);
      return (data?.[0] as { sent_at: string | null } | undefined)?.sent_at ?? null;
    },

    async sentPostSlugs() {
      const { data, error } = await table().select('post_slug').eq('status', 'sent').not('post_slug', 'is', null);
      check(error);
      return ((data ?? []) as { post_slug: string }[]).map((row) => row.post_slug);
    },

    async recentHeroImages(n) {
      const { data, error } = await table()
        .select('hero_image_url')
        .eq('status', 'sent')
        .not('hero_image_url', 'is', null)
        .order('sent_at', { ascending: false })
        .limit(n);
      check(error);
      return ((data ?? []) as { hero_image_url: string }[]).map((row) => row.hero_image_url);
    },

    async nextIssueNumber() {
      const { data, error } = await table()
        .select('issue_number')
        .not('issue_number', 'is', null)
        .order('issue_number', { ascending: false })
        .limit(1);
      check(error);
      return ((data?.[0] as { issue_number: number } | undefined)?.issue_number ?? 0) + 1;
    },
  };
}

export function createImageStorage(supabase: SupabaseClient, imagesBase: string): ImageStorage {
  const base = imagesBase.replace(/\/+$/, '');
  return {
    async createUploadUrl(path) {
      const { data, error } = await supabase.storage.from(IMAGES_BUCKET).createSignedUploadUrl(path);
      if (error || !data) throw new Error(`${IMAGES_BUCKET}: ${error?.message ?? 'no upload URL'}`);
      return { path: data.path, token: data.token, signedUrl: data.signedUrl, publicUrl: `${base}/${data.path}` };
    },
  };
}
