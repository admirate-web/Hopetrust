import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NewsletterConfirm from '@/components/NewsletterConfirm';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123456';
const fetchMock = vi.fn();
const reply = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  window.history.replaceState(null, '', `/newsletter/confirm/#t=${TOKEN}`);
});

describe('NewsletterConfirm', () => {
  it('waits for a click before confirming', async () => {
    render(<NewsletterConfirm />);
    expect(await screen.findByRole('button', { name: 'Confirm my subscription' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('confirms with the token from the link, then takes the token out of the address bar', async () => {
    fetchMock.mockResolvedValue(reply(200, { ok: true }));
    render(<NewsletterConfirm />);
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm my subscription' }));

    expect(await screen.findByRole('heading', { name: "You're subscribed" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/newsletter-confirm', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ token: TOKEN });
    expect(window.location.hash).toBe('');
  });

  it('offers the form again when the link has expired', async () => {
    fetchMock.mockResolvedValue(reply(400, { error: 'expired', message: 'This link has expired or was already used.' }));
    render(<NewsletterConfirm />);
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm my subscription' }));
    expect(await screen.findByRole('heading', { name: 'This link has expired' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
  });

  it('says when the link is incomplete', async () => {
    window.history.replaceState(null, '', '/newsletter/confirm/');
    render(<NewsletterConfirm />);
    expect(await screen.findByRole('heading', { name: 'This link is incomplete' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
  });

  it('lets the person try again after an error', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(reply(200, { ok: true }));
    render(<NewsletterConfirm />);
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm my subscription' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: "You're subscribed" })).toBeInTheDocument();
  });
});
