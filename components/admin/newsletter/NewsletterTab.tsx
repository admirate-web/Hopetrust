'use client';

import SubscribersScreen from './SubscribersScreen';

export interface NewsletterTabProps {
  token: string;
  onUnauthorized: () => void;
}

/** The Newsletter tab in /arel-ops. Plan 3 adds the Issues screen next to Subscribers. */
export default function NewsletterTab({ token, onUnauthorized }: NewsletterTabProps) {
  return <SubscribersScreen token={token} onUnauthorized={onUnauthorized} />;
}
