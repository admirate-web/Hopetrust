// Data access for newsletter issues (Database/newsletter.sql §6) and their
// images (Database/newsletter-storage.sql), through the service-role Supabase
// client. Status changes are guarded updates: a send can only start from a
// draft, and only finish from 'sending' or 'needs_check' (spec §9.1). Tests
// use the in-memory versions in tests/vitest/functions/newsletter/fakes.ts.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { IssueDraft, IssueRow, IssueSummary } from '../../../lib/newsletter/issue';

export interface SentFields {
  resend_broadcast_id: string;
  recipient_count: number | null;
  sent_at: string;
}

export interface IssuesDb {
  /** Newest first. */
  list(): Promise<IssueSummary[]>;
  get(id: string): Promise<IssueRow | null>;
  create(fields: IssueDraft, actor: string): Promise<IssueRow>;
  /** Saves a draft's fields if it is still a draft and unchanged since `ifUpdatedAt`; otherwise null. */
  saveDraft(id: string, fields: IssueDraft, actor: string, ifUpdatedAt: string): Promise<IssueRow | null>;
  /** Deletes a draft; false when there is no draft with that id. */
  deleteDraft(id: string): Promise<boolean>;
  /** draft → sending, recording who started it; null when it wasn't a draft. */
  lockForSend(id: string, actor: string): Promise<IssueRow | null>;
  /** sending or needs_check → sent. */
  markSent(id: string, fields: SentFields): Promise<IssueRow | null>;
  /** sending or needs_check → draft, with the reason the editor shows. */
  backToDraft(id: string, error: string | null): Promise<IssueRow | null>;
  /** sending → needs_check: Resend's answer was unclear. */
  markNeedsCheck(id: string, error: string): Promise<IssueRow | null>;
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
const SUMMARY_COLUMNS = 'id, subject, issue_date, status, recipient_count, sent_at, last_error, updated_at';
const LIST_LIMIT = 200;
/** The column's check constraint. */
const MAX_ERROR = 2000;

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
          .eq('status', 'draft')
          .eq('updated_at', ifUpdatedAt),
      ),

    async deleteDraft(id) {
      const { data, error } = await table().delete().eq('id', id).eq('status', 'draft').select('id');
      check(error);
      return (data?.length ?? 0) > 0;
    },

    lockForSend: (id, actor) =>
      changed(table().update({ status: 'sending', sent_by: actor, last_error: null }).eq('id', id).eq('status', 'draft')),

    markSent: (id, fields) =>
      changed(
        table()
          .update({ ...fields, status: 'sent', last_error: null })
          .eq('id', id)
          .in('status', ['sending', 'needs_check']),
      ),

    backToDraft: (id, error) =>
      changed(
        table()
          .update({ status: 'draft', sent_by: null, last_error: clip(error) })
          .eq('id', id)
          .in('status', ['sending', 'needs_check']),
      ),

    markNeedsCheck: (id, error) =>
      changed(table().update({ status: 'needs_check', last_error: clip(error) }).eq('id', id).eq('status', 'sending')),
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
