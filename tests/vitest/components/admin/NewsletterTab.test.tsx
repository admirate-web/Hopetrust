import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/components/admin/newsletter/IssuesScreen', () => ({
  default: ({ onOpen }: { onOpen: (id: string) => void }) => (
    <button type="button" onClick={() => onOpen('issue-1')}>
      Open issue 1
    </button>
  ),
}));
vi.mock('@/components/admin/newsletter/SubscribersScreen', () => ({
  default: () => <h2>Newsletter subscribers</h2>,
}));
vi.mock('@/components/admin/newsletter/IssueEditor', () => ({
  default: ({ id, onClose, onDirtyChange }: { id: string; onClose: () => void; onDirtyChange?: (dirty: boolean) => void }) => (
    <div>
      <p>Editing {id}</p>
      <button type="button" onClick={() => onDirtyChange?.(true)}>
        Make a change
      </button>
      <button type="button" onClick={onClose}>
        Close editor
      </button>
    </div>
  ),
}));

import NewsletterTab from '@/components/admin/newsletter/NewsletterTab';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NewsletterTab', () => {
  it('shows Issues first, and opens an issue in the editor', async () => {
    render(<NewsletterTab token="tkn" onUnauthorized={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Issues' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Open issue 1' }));
    expect(await screen.findByText('Editing issue-1')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close editor' }));
    expect(screen.getByRole('button', { name: 'Open issue 1' })).toBeInTheDocument();
  });

  it('asks before switching screens with unsaved changes', async () => {
    render(<NewsletterTab token="tkn" onUnauthorized={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open issue 1' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Make a change' }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await userEvent.click(screen.getByRole('tab', { name: 'Subscribers' }));
    expect(confirm).toHaveBeenCalled();
    expect(screen.getByText('Editing issue-1')).toBeInTheDocument();
    confirm.mockReturnValue(true);
    await userEvent.click(screen.getByRole('tab', { name: 'Subscribers' }));
    expect(screen.getByRole('heading', { name: 'Newsletter subscribers' })).toBeInTheDocument();
  });
});
