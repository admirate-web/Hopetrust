import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SIGNUP_NOTICE, SIGNUP_SUCCESS_MESSAGE } from '@/lib/newsletter/subscriber';
import NewsletterForm from '@/components/NewsletterForm';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const fetchMock = vi.fn();
const reply = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

async function fillAndSubmit(name = 'Asha Rao', email = 'asha@example.com') {
  const user = userEvent.setup();
  if (name) await user.type(screen.getByLabelText('Full name'), name);
  if (email) await user.type(screen.getByLabelText('Email address'), email);
  await user.click(screen.getByRole('button', { name: 'Subscribe' }));
}

describe('NewsletterForm', () => {
  it('checks the fields before sending anything', async () => {
    render(<NewsletterForm />);
    await fillAndSubmit('', '');
    expect(screen.getByText('Please enter your full name')).toBeInTheDocument();
    expect(screen.getByText('Please enter your email address')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the name, email, page and notice version, then asks the person to check their inbox', async () => {
    fetchMock.mockResolvedValue(reply(200, { ok: true, message: SIGNUP_SUCCESS_MESSAGE }));
    render(<NewsletterForm variant="inline" />);
    await fillAndSubmit();

    expect(await screen.findByRole('status')).toHaveTextContent(SIGNUP_SUCCESS_MESSAGE);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/newsletter-subscribe');
    expect(JSON.parse(init.body)).toEqual({
      full_name: 'Asha Rao',
      email: 'asha@example.com',
      website: '',
      page: '/',
      notice: SIGNUP_NOTICE.version,
    });
  });

  it('shows the field errors the server sends back', async () => {
    fetchMock.mockResolvedValue(reply(400, { error: 'Please check the form.', fields: { email: 'Please enter a valid email address' } }));
    render(<NewsletterForm />);
    await fillAndSubmit();
    expect(await screen.findByText('Please enter a valid email address')).toBeInTheDocument();
  });

  it('shows the server\'s message when it refuses, such as too many sign-ups', async () => {
    fetchMock.mockResolvedValue(reply(429, { error: 'Too many sign-ups from your connection. Please try again in a few minutes.' }));
    render(<NewsletterForm />);
    await fillAndSubmit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many sign-ups from your connection.');
  });

  it('says so when the server cannot be reached', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<NewsletterForm />);
    await fillAndSubmit();
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't reach/i);
  });

  it('shows the notice, with a link to the privacy policy', () => {
    render(<NewsletterForm />);
    expect(screen.getByText(SIGNUP_NOTICE.text, { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', '/privacy-policy/#newsletter');
  });

  it('keeps the bot trap away from people and screen readers', () => {
    const { container } = render(<NewsletterForm />);
    const trap = container.querySelector('input[name="website"]') as HTMLInputElement;
    expect(trap.tabIndex).toBe(-1);
    expect(trap.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});
