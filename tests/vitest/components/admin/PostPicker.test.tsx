import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/newsletter-admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/newsletter-admin')>()),
  listPosts: vi.fn(),
}));

import PostPicker from '@/components/admin/newsletter/PostPicker';
import * as api from '@/lib/newsletter-admin';

const POSTS = [
  { slug: 'a', title: 'The Most Important Connection You Can Have: With Yourself', date: '2025-12-20T11:30:02', has_image: true, sent: true },
  { slug: 'b', title: 'Surrender to Win: The Liberating Paradox', date: '2025-11-08T11:22:02', has_image: true, sent: false },
  { slug: 'c', title: 'A Post Without a Photo', date: '2025-12-25T09:00:00', has_image: false, sent: false },
];

afterEach(() => {
  vi.resetAllMocks();
});

describe('PostPicker', () => {
  it('lists the posts, marking sent ones and those without a photo', async () => {
    vi.mocked(api.listPosts).mockResolvedValue(POSTS);
    render(<PostPicker token="tkn" onUnauthorized={() => {}} onPick={() => {}} onClose={() => {}} />);
    const dialog = await screen.findByRole('dialog', { name: 'Choose a post' });
    const sent = await within(dialog).findByRole('button', { name: /The Most Important Connection/ });
    expect(within(sent).getByText('Sent')).toBeInTheDocument();
    const noPhoto = within(dialog).getByRole('button', { name: /A Post Without a Photo/ });
    expect(within(noPhoto).getByText('No photo')).toBeInTheDocument();
  });

  it('filters by title, whatever the case, and picks a post', async () => {
    vi.mocked(api.listPosts).mockResolvedValue(POSTS);
    const onPick = vi.fn();
    render(<PostPicker token="tkn" onUnauthorized={() => {}} onPick={onPick} onClose={() => {}} />);
    await screen.findByRole('button', { name: /Surrender to Win/ });
    await userEvent.type(screen.getByLabelText('Search posts'), 'SURRENDER');
    expect(screen.queryByRole('button', { name: /The Most Important Connection/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Surrender to Win/ }));
    expect(onPick).toHaveBeenCalledWith('b');
  });
});
