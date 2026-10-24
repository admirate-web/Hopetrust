import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChatBubble from '@/components/ChatBubble';

// The page the widget renders on, which a test can move to /arel-ops.
const nav = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

function reply(body: Record<string, unknown>) {
  return { ok: true, json: async () => body };
}

beforeEach(() => {
  nav.pathname = '/';
  sessionStorage.clear();
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      reply({ reply: 'Hi there.', links: [], therapists: [], allTherapistsUrl: null, state: {} })
    )
  );
});

async function open() {
  render(<ChatBubble />);
  fireEvent.click(screen.getByRole('button', { name: /chat/i }));
  return screen.findByRole('log');
}

describe('ChatBubble', () => {
  it('starts closed and opens on click', async () => {
    render(<ChatBubble />);
    expect(screen.queryByRole('log')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /chat/i }));
    expect(await screen.findByRole('log')).toBeTruthy();
  });

  // The assistant answers an empty message with its intro, so opening sends one
  // empty turn rather than the widget holding a second copy of the intro to drift.
  it('greets without the visitor having to say anything', async () => {
    await open();
    await waitFor(() => expect(screen.getByText('Hi there.')).toBeTruthy());
  });

  it('shows the reply that comes back', async () => {
    await open();
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'hi' } });
    fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => expect(screen.getAllByText('Hi there.')).toHaveLength(2));
  });

  // Someone on a shared computer asking about addiction treatment must not
  // leave the conversation sitting there for the next person.
  it('stores nothing in sessionStorage or localStorage', async () => {
    await open();
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'hi' } });
    fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => expect(screen.getAllByText('Hi there.')).toHaveLength(2));
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);
  });

  it('sends the conversation so far with the next message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply({ reply: 'Hi there.', links: [], therapists: [], allTherapistsUrl: null, state: {} }));
    vi.stubGlobal('fetch', fetchMock);
    await open();
    await screen.findByText('Hi there.');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'who treats OCD?' } });
    fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.message).toBe('who treats OCD?');
    expect(body.history).toEqual([{ from: 'them', body: 'Hi there.' }]);
    expect(body.state).toBeUndefined();
  });

  // n8n compares earlier replies with its own answers character for character,
  // so each goes back exactly as it was shown. The opening turn has nothing
  // before it, and a failed turn is not something the assistant said.
  it('sends each message back as it was shown, leaving failed turns out', async () => {
    const intro = '  Hi.\n\nAsk me anything.  ';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply({ reply: intro, links: [], therapists: [], allTherapistsUrl: null, state: {} }))
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockResolvedValue(reply({ reply: 'Hi there.', links: [], therapists: [], allTherapistsUrl: null, state: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await open();
    await screen.findByText(/Ask me anything/);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello' } });
    fireEvent.submit(screen.getByRole('form'));
    await screen.findByRole('link', { name: /WhatsApp/i });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'who treats OCD?' } });
    fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ message: '', history: [] });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
      message: 'who treats OCD?',
      history: [
        { from: 'them', body: intro },
        { from: 'us', body: 'hello' }
      ]
    });
  });

  it('sends no more than the last six messages', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply({ reply: 'Hi there.', links: [], therapists: [], allTherapistsUrl: null, state: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await open();
    const said = ['one', 'two', 'three', 'four'];
    for (let i = 0; i < said.length; i++) {
      await waitFor(() => expect(screen.getAllByText('Hi there.')).toHaveLength(i + 1));
      fireEvent.change(screen.getByRole('textbox'), { target: { value: said[i] } });
      fireEvent.submit(screen.getByRole('form'));
    }
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));

    expect(JSON.parse(fetchMock.mock.calls[4][1].body).history).toEqual([
      { from: 'us', body: 'one' },
      { from: 'them', body: 'Hi there.' },
      { from: 'us', body: 'two' },
      { from: 'them', body: 'Hi there.' },
      { from: 'us', body: 'three' },
      { from: 'them', body: 'Hi there.' }
    ]);
  });

  it('names itself as the Hope Trust AI Assistant', async () => {
    await open();
    expect(screen.getByText('Hope Trust AI Assistant')).toBeTruthy();
    expect(screen.getByPlaceholderText('Ask about therapists, services or articles…')).toBeTruthy();
  });

  it('shows therapist rows, the all-therapists link and tagged reading', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({
      reply: 'That sounds hard.',
      links: [{ label: 'Intervention Services', url: 'https://hopetrustindia.com/intervention-services/', kind: 'page' }],
      therapists: [{ name: 'Rahul Luther', line: 'Substance use disorders · Behavioural addictions', photo: 'https://example.com/r.jpg', url: 'https://hopetrustindia.com/therapists/rahul-luther/' }],
      allTherapistsUrl: 'https://hopetrustindia.com/book-your-session/',
      state: {}
    })));
    await open();
    expect((await screen.findByRole('link', { name: /rahul luther/i })).getAttribute('href')).toBe('https://hopetrustindia.com/therapists/rahul-luther/');
    expect(screen.getByRole('link', { name: /see all therapists/i }).getAttribute('href')).toBe('https://hopetrustindia.com/book-your-session/');
    expect(screen.getByText('Therapists who help with this')).toBeTruthy();
    expect(screen.getByText('Page')).toBeTruthy();
  });

  // The fee and therapist answers offer to show the therapists without naming
  // anyone, so the link comes alone, with no heading over rows that aren't there.
  it('offers all the therapists under an answer that names none', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({
      reply: 'Would you like me to show you the available therapists?',
      links: [],
      therapists: [],
      allTherapistsUrl: 'https://hopetrustindia.com/book-your-session/',
      state: {}
    })));
    await open();
    expect((await screen.findByRole('link', { name: /see all therapists/i })).getAttribute('href')).toBe('https://hopetrustindia.com/book-your-session/');
    expect(screen.queryByText('Therapists who help with this')).toBeNull();
  });

  it('renders the links the engine returned', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        reply({
          reply: 'Here is what we have on that:',
          links: [{ label: 'Book a session', url: 'https://hopetrustindia.com/book-your-session' }],
          state: { step: 'HELPING' }
        })
      )
    );

    await open();
    const link = await screen.findByRole('link', { name: /book a session/i });
    expect(link.getAttribute('href')).toBe('https://hopetrustindia.com/book-your-session');
    // No kind, so no tag above the title.
    expect(link.textContent).toBe('Book a session');
  });

  // What comes back is n8n's own, but a row it cannot draw must cost only that
  // row, never the conversation.
  it('draws only the rows and links that have what they need', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({
      reply: 'That sounds hard.',
      links: [
        null,
        'Intervention Services',
        { label: 'No address' },
        { label: 'Not a web address', url: 'javascript:alert(1)' },
        { label: 'Intervention Services', url: 'https://hopetrustindia.com/intervention-services/', kind: 'page' }
      ],
      therapists: [
        null,
        { name: 'No profile', line: 'Anxiety', photo: 'https://example.com/n.jpg' },
        { name: 'Rahul Luther', line: 'Substance use disorders', photo: 'https://example.com/r.jpg', url: 'https://hopetrustindia.com/therapists/rahul-luther/' }
      ],
      allTherapistsUrl: null,
      state: {}
    })));
    await open();
    expect(await screen.findByText('That sounds hard.')).toBeTruthy();
    expect(screen.getByRole('link', { name: /intervention services/i }).getAttribute('href')).toBe('https://hopetrustindia.com/intervention-services/');
    expect(screen.getByRole('link', { name: /rahul luther/i }).getAttribute('href')).toBe('https://hopetrustindia.com/therapists/rahul-luther/');
    expect(screen.queryByText('No address')).toBeNull();
    expect(screen.queryByText('Not a web address')).toBeNull();
    expect(screen.queryByText('No profile')).toBeNull();
  });

  it('leaves out See all therapists when its address is not a web address', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({
      reply: 'Would you like me to show you the available therapists?',
      links: [],
      therapists: [],
      allTherapistsUrl: 'javascript:alert(1)',
      state: {}
    })));
    await open();
    expect(await screen.findByText('Would you like me to show you the available therapists?')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /see all therapists/i })).toBeNull();
  });

  // The answer to "where are you?" ends in the map's address, and an address
  // that cannot be tapped is no use on a phone.
  it('turns an address in a reply into a link that opens in a new tab', async () => {
    const map = 'https://maps.app.goo.gl/1jBEohMn1fL8RGua7?g_st=ic';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({
      reply: `We're in Banjara Hills, Hyderabad. You can find us here: ${map}`,
      links: [],
      therapists: [],
      allTherapistsUrl: null,
      state: {}
    })));
    await open();
    const link = await screen.findByRole('link', { name: map });
    expect(link.getAttribute('href')).toBe(map);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(screen.getByText("We're in Banjara Hills, Hyderabad. You can find us here:", { exact: false })).toBeTruthy();
  });

  it('leaves the full stop after an address out of the link', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({
      reply: 'It is all at https://example.com/a.',
      links: [],
      therapists: [],
      allTherapistsUrl: null,
      state: {}
    })));
    await open();
    expect((await screen.findByRole('link', { name: 'https://example.com/a' })).getAttribute('href')).toBe('https://example.com/a');
  });

  it("leaves an address in the visitor's own message as they typed it", async () => {
    await open();
    await screen.findByText('Hi there.');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'is this you? https://example.com/x' } });
    fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => expect(screen.getAllByText('Hi there.')).toHaveLength(2));
    expect(screen.getByText('is this you? https://example.com/x')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'https://example.com/x' })).toBeNull();
  });

  // A failed turn offers a real way out, not just an apology. Every failed
  // turn carries one, so this asserts presence rather than uniqueness.
  it('offers WhatsApp when the proxy fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 }));
    await open();
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'hi' } });
    fireEvent.submit(screen.getByRole('form'));

    const links = await screen.findAllByRole('link', { name: /WhatsApp/i });
    expect(links.length).toBeGreaterThan(0);
    expect(links[0].getAttribute('href')).toContain('wa.me/');
  });

  it('offers WhatsApp when the request throws outright', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await open();
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'hi' } });
    fireEvent.submit(screen.getByRole('form'));
    expect((await screen.findAllByRole('link', { name: /WhatsApp/i })).length).toBeGreaterThan(0);
  });

  // What n8n sends when its webhook answers before the workflow runs: a 200
  // with nothing to show, which is a failure like any other.
  it('offers WhatsApp when an answer comes back with no reply in it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ message: 'Workflow was started' })));
    await open();
    expect((await screen.findAllByRole('link', { name: /WhatsApp/i })).length).toBeGreaterThan(0);
  });

  it('does not send an empty message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      reply({ reply: 'Hello.', links: [], state: { step: 'ASK_NAME' } })
    );
    vi.stubGlobal('fetch', fetchMock);

    await open();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.change(await screen.findByRole('textbox'), { target: { value: '   ' } });
    fireEvent.submit(screen.getByRole('form'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('announces new messages to a screen reader', async () => {
    const log = await open();
    expect(log.getAttribute('aria-live')).toBe('polite');
  });

  // Right above the chat button sits the clinic's WhatsApp number, which the
  // CRM bot answers: some people would rather talk in WhatsApp itself.
  it('offers WhatsApp above the chat, opening the clinic number in a new tab', () => {
    render(<ChatBubble />);
    const link = screen.getByRole('link', { name: /message us on whatsapp/i });
    expect(link.getAttribute('href')).toBe('https://wa.me/919000720003');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  // The open chat window covers that corner of the screen.
  it('hides the WhatsApp button while the chat is open', async () => {
    await open();
    expect(screen.queryByRole('link', { name: /message us on whatsapp/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /close conversation/i }));
    expect(await screen.findByRole('link', { name: /message us on whatsapp/i })).toBeTruthy();
  });

  // /arel-ops is the clinic's internal operations page, not somewhere a
  // patient lands. The old WhatsApp button stayed off it; both launchers do.
  it('stays off the internal /arel-ops page', () => {
    nav.pathname = '/arel-ops';
    render(<ChatBubble />);
    expect(screen.queryByRole('button', { name: /chat/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /whatsapp/i })).toBeNull();
  });
});
