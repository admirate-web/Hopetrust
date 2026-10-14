import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NewsletterDialogButton from '@/components/NewsletterDialogButton';

// The form's chunk can't be fetched, e.g. after a deploy renamed it. This has
// its own file because the form module must fail on its first import.
vi.mock('@/components/NewsletterForm', async () => {
  throw new Error('Loading chunk components_NewsletterForm_tsx failed');
});

describe('NewsletterDialogButton preload', () => {
  it('ignores a failed preload: the dialog loads the form again when it opens', async () => {
    const unhandled: unknown[] = [];
    const record = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', record);
    try {
      render(<NewsletterDialogButton />);
      const button = screen.getByRole('button', { name: 'Subscribe to our newsletter' });
      await userEvent.hover(button);
      button.focus();
      // Long enough for Node to report a rejection nobody handled.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', record);
    }
  });
});
