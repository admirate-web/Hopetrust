import { afterEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_SETTINGS } from '@/lib/newsletter/settings';

vi.mock('@/lib/newsletter-admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/newsletter-admin')>()),
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
}));

import AutomaticScreen from '@/components/admin/newsletter/AutomaticScreen';
import * as api from '@/lib/newsletter-admin';

const ON = { ...DEFAULT_SETTINGS, auto_enabled: true, first_send_date: '2026-10-20' };
const NEXT = {
  preview_at: '2026-10-18T04:30:00.000Z',
  send_at: '2026-10-20T04:30:00.000Z',
  post: { slug: 'p', title: 'The Most Important Connection You Can Have: With Yourself' },
  blocked: null,
};

afterEach(() => {
  vi.resetAllMocks();
});

function show(reply: Awaited<ReturnType<typeof api.getSettings>>) {
  vi.mocked(api.getSettings).mockResolvedValue(reply);
  render(<AutomaticScreen token="tkn" onUnauthorized={() => {}} />);
}

describe('AutomaticScreen', () => {
  it('starts off, with the previews going to essentials@admirate.in', async () => {
    show({ settings: DEFAULT_SETTINGS, next: null });
    const toggle = await screen.findByRole('switch', { name: 'Automatic sending' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Off')).toBeInTheDocument();
    expect(screen.getByLabelText('Preview recipients')).toHaveValue('essentials@admirate.in');
  });

  it('shows the next preview, the send and the post when it is on', async () => {
    show({ settings: ON, next: NEXT });
    expect(await screen.findByText('Next preview: Sun 18 Oct, 10:00 am')).toBeInTheDocument();
    expect(screen.getByText('Next send: Tue 20 Oct, 10:00 am')).toBeInTheDocument();
    expect(screen.getByText(NEXT.post.title)).toBeInTheDocument();
    expect(screen.getByText('On')).toBeInTheDocument();
  });

  it("says why the next send won't go out", async () => {
    show({ settings: ON, next: { ...NEXT, blocked: 'A newsletter went out on Mon 12 Oct, less than 14 days before.' } });
    expect(await screen.findByText('A newsletter went out on Mon 12 Oct, less than 14 days before.')).toBeInTheDocument();
  });

  it('switches it on with a first date and a list of recipients', async () => {
    show({ settings: DEFAULT_SETTINGS, next: null });
    vi.mocked(api.saveSettings).mockResolvedValue({ settings: { ...ON, preview_recipients: ['a@x.com', 'b@x.com'] }, next: NEXT });
    await userEvent.click(await screen.findByRole('switch', { name: 'Automatic sending' }));
    fireEvent.change(screen.getByLabelText('First send date'), { target: { value: '2026-10-20' } });
    const recipients = screen.getByLabelText('Preview recipients');
    await userEvent.clear(recipients);
    await userEvent.type(recipients, 'a@x.com, b@x.com');
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(api.saveSettings).toHaveBeenCalledWith(
      'tkn',
      expect.objectContaining({ auto_enabled: true, first_send_date: '2026-10-20', preview_recipients: ['a@x.com', 'b@x.com'] }),
    );
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });

  it('shows a flipped switch as not saved, and the saved state as what holds, until Save', async () => {
    show({ settings: ON, next: NEXT });
    vi.mocked(api.saveSettings).mockImplementation(async (_t, settings) => ({ settings, next: NEXT }));
    await userEvent.click(await screen.findByRole('switch', { name: 'Automatic sending' }));
    expect(screen.getByText('On')).toBeInTheDocument();
    expect(screen.getByText('Not saved yet: it stays on until you press Save settings.')).toBeInTheDocument();
    expect(screen.queryByText(/nothing goes out until it/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByText('Off')).toBeInTheDocument();
    expect(screen.getByText(/nothing goes out until it/)).toBeInTheDocument();
    expect(screen.queryByText(/Not saved yet/)).toBeNull();
  });

  it('says there are unsaved changes until they are saved', async () => {
    show({ settings: ON, next: NEXT });
    vi.mocked(api.saveSettings).mockImplementation(async (_t, settings) => ({ settings, next: NEXT }));
    const recipients = await screen.findByLabelText('Preview recipients');
    expect(screen.queryByText("You have changes that aren't saved.")).toBeNull();
    await userEvent.type(recipients, ', b@x.com');
    expect(screen.getByText("You have changes that aren't saved.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await screen.findByText('Saved.');
    expect(screen.queryByText("You have changes that aren't saved.")).toBeNull();
  });

  it("shows the server's reason when a save is refused", async () => {
    show({ settings: DEFAULT_SETTINGS, next: null });
    vi.mocked(api.saveSettings).mockRejectedValue(new api.IssueApiError('The first send date must be a Tuesday.', 400, null, []));
    fireEvent.change(await screen.findByLabelText('First send date'), { target: { value: '2026-10-21' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The first send date must be a Tuesday.');
  });

  it("shows the book panel's fields only when it is switched on, starting from the client's sample", async () => {
    show({ settings: DEFAULT_SETTINGS, next: null });
    vi.mocked(api.saveSettings).mockImplementation(async (_t, settings) => ({ settings, next: null }));
    expect(await screen.findByRole('switch', { name: 'Book panel' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByLabelText('Panel title')).toBeNull();
    await userEvent.click(screen.getByRole('switch', { name: 'Book panel' }));
    expect(screen.getByLabelText('Panel title')).toHaveValue('I, Bhogi');
    expect(screen.getByLabelText('Panel eyebrow')).toHaveValue('From Rahul Luther');
    await userEvent.type(screen.getByLabelText('Panel link'), 'https://example.com/i-bhogi');
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(api.saveSettings).toHaveBeenCalledWith(
      'tkn',
      expect.objectContaining({ panel_enabled: true, panel_title: 'I, Bhogi', panel_url: 'https://example.com/i-bhogi' }),
    );
  });
});
