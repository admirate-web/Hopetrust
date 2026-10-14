import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NewsletterDialogButton from '@/components/NewsletterDialogButton';

vi.mock('motion/react', () => ({
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      ...props
    }: Record<string, unknown> & { children?: React.ReactNode }) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Records when the form's module (and with it zod) is first loaded.
const loaded = vi.hoisted(() => ({ form: false }));
vi.mock('@/components/NewsletterForm', async (importOriginal) => {
  loaded.form = true;
  return importOriginal();
});

describe('NewsletterDialogButton', () => {
  // Must run first: once loaded, the module stays loaded for the rest of the file.
  it('loads the form only when someone reaches for the button, so the footer stays light', async () => {
    render(<NewsletterDialogButton />);
    expect(loaded.form).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Subscribe to our newsletter' }));
    expect(await screen.findByLabelText('Full name')).toBeInTheDocument();
    expect(loaded.form).toBe(true);
  });

  it('opens the sign-up form in a dialog and puts focus in the first field', async () => {
    render(<NewsletterDialogButton />);
    await userEvent.click(screen.getByRole('button', { name: 'Subscribe to our newsletter' }));
    expect(screen.getByRole('dialog', { name: 'Subscribe to our newsletter' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Full name')).toHaveFocus());
  });

  it('closes on Escape and gives focus back to the button', async () => {
    render(<NewsletterDialogButton />);
    const button = screen.getByRole('button', { name: 'Subscribe to our newsletter' });
    await userEvent.click(button);
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(button).toHaveFocus();
  });

  it('closes when the backdrop is clicked, but not when the form is', async () => {
    render(<NewsletterDialogButton />);
    await userEvent.click(screen.getByRole('button', { name: 'Subscribe to our newsletter' }));
    fireEvent.mouseDown(await screen.findByLabelText('Full name'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId('newsletter-backdrop'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
