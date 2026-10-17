'use client';

// The Swap post dialog (fortnightly spec §5.4): every blog post, newest first,
// searchable by title. Posts already sent, and posts without a photo the email
// can use, are marked.

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { UnauthorizedError, listPosts, type PostChoice } from '@/lib/newsletter-admin';
import { Dialog } from './IssueSendDialogs';

export interface PostPickerProps {
  token: string;
  onUnauthorized: () => void;
  onPick: (slug: string) => void;
  onClose: () => void;
}

export default function PostPicker({ token, onUnauthorized, onPick, onClose }: PostPickerProps) {
  const [posts, setPosts] = useState<PostChoice[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    listPosts(token)
      .then((list) => {
        if (live) setPosts(list);
      })
      .catch((e: unknown) => {
        if (!live) return;
        if (e instanceof UnauthorizedError) onUnauthorized();
        else setError(e instanceof Error ? e.message : "The posts didn't load.");
      });
    return () => {
      live = false;
    };
  }, [token, onUnauthorized]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (posts ?? []).filter((post) => !q || post.title.toLowerCase().includes(q));
  }, [posts, query]);

  return (
    <Dialog title="Choose a post" busy={false} onClose={onClose}>
      <label htmlFor="nl-post-search" className="sr-only">
        Search posts
      </label>
      <input
        id="nl-post-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by title"
        className="w-full rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2.5 text-sm outline-none transition focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20"
      />
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {!posts && !error ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the posts…
        </p>
      ) : (
        <ul className="mt-3 max-h-[50vh] space-y-1 overflow-y-auto pr-1">
          {shown.map((post) => (
            <li key={post.slug}>
              <button
                type="button"
                onClick={() => onPick(post.slug)}
                className="w-full rounded-xl px-3 py-2.5 text-left transition hover:bg-[#F7F6F4] focus:bg-[#F7F6F4] focus:outline-none"
              >
                <span className="block text-sm font-semibold text-[#00373E]">{post.title}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                  {post.date.slice(0, 10)}
                  {post.sent && <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">Sent</span>}
                  {!post.has_image && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">No photo</span>
                  )}
                </span>
              </button>
            </li>
          ))}
          {posts && shown.length === 0 && <li className="px-3 py-4 text-sm text-gray-500">No post matches.</li>}
        </ul>
      )}
    </Dialog>
  );
}
