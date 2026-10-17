'use client';

// The Newsletter tab in /arel-ops (spec §8): Issues, Subscribers and Automatic. The issue
// editor, with the TipTap editor inside it, loads only when an issue is
// opened, so the rest of the dashboard stays light.

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import IssuesScreen from './IssuesScreen';
import SubscribersScreen from './SubscribersScreen';
import AutomaticScreen from './AutomaticScreen';

const IssueEditor = dynamic(() => import('./IssueEditor'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center gap-2 rounded-2xl bg-white p-6 text-sm text-gray-500 shadow-sm">
      <Loader2 className="h-4 w-4 animate-spin" />
      Opening the editor…
    </div>
  ),
});

export interface NewsletterTabProps {
  token: string;
  onUnauthorized: () => void;
}

type Screen = 'issues' | 'subscribers' | 'automatic';
const LEAVE = 'You have unsaved changes in this issue. Leave without saving?';

/** The Newsletter tab in /arel-ops. */
export default function NewsletterTab({ token, onUnauthorized }: NewsletterTabProps) {
  const [screen, setScreen] = useState<Screen>('issues');
  const [openId, setOpenId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  function show(next: Screen) {
    if (dirty && !window.confirm(LEAVE)) return;
    setDirty(false);
    setOpenId(null);
    setScreen(next);
  }

  const tab = (value: Screen, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={screen === value}
      onClick={() => show(value)}
      className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
        screen === value ? 'bg-[#00373E] text-white shadow-sm' : 'text-gray-600 hover:bg-white'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div role="tablist" aria-label="Newsletter screens" className="mb-5 inline-flex gap-1 rounded-2xl bg-[#F7F6F4] p-1">
        {tab('issues', 'Issues')}
        {tab('subscribers', 'Subscribers')}
        {tab('automatic', 'Automatic')}
      </div>
      {screen === 'automatic' ? (
        <AutomaticScreen token={token} onUnauthorized={onUnauthorized} />
      ) : screen === 'subscribers' ? (
        <SubscribersScreen token={token} onUnauthorized={onUnauthorized} />
      ) : openId ? (
        <IssueEditor
          key={openId}
          token={token}
          id={openId}
          onUnauthorized={onUnauthorized}
          onDirtyChange={setDirty}
          onClose={() => {
            setDirty(false);
            setOpenId(null);
          }}
        />
      ) : (
        <IssuesScreen token={token} onUnauthorized={onUnauthorized} onOpen={setOpenId} />
      )}
    </div>
  );
}
