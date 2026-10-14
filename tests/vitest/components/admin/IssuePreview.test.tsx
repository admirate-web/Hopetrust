import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IssuePreview, { renderPreview, sizeNote } from '@/components/admin/newsletter/IssuePreview';
import { SendDialog, TestSendDialog, parseAddresses } from '@/components/admin/newsletter/IssueSendDialogs';
import type { IssueForRender } from '@/lib/newsletter/content';

const IMAGES = 'https://abc.supabase.co/storage/v1/object/public/newsletter-images';

describe('IssuePreview', () => {
  it('shows the email in a sandboxed frame, at phone width on request, with its size', async () => {
    render(<IssuePreview html="<p>Hello</p>" bytes={2048} />);
    const frame = screen.getByTitle('Email preview');
    expect(frame).toHaveAttribute('sandbox', '');
    expect(frame).toHaveAttribute('srcdoc', '<p>Hello</p>');
    expect(frame).toHaveStyle({ width: '640px' });
    await userEvent.click(screen.getByRole('button', { name: 'Phone' }));
    expect(frame).toHaveStyle({ width: '375px' });
    expect(screen.getByText('Email size: 2.0 KB')).toBeInTheDocument();
  });

  it('warns above 80 KB, and says it is too big above 95 KB', () => {
    expect(sizeNote(81 * 1024)).toEqual({ text: '81.0 KB: getting long. Gmail cuts emails off at 102 KB.', tone: 'warn' });
    expect(sizeNote(96 * 1024)).toEqual({ text: '96.0 KB: too big to send. Shorten it or remove an image.', tone: 'over' });
    expect(sizeNote(50 * 1024).tone).toBe('ok');
  });

  it('previews without the unsubscribe placeholder, and measures the send version', () => {
    const issue: IssueForRender = {
      subject: 'S',
      preheader: '',
      issue_date: '2026-10-14',
      title: 'Hello there',
      hero_image_url: null,
      hero_image_alt: '',
      body: { type: 'doc', content: [] },
      share_url: null,
    };
    const out = renderPreview(issue, IMAGES);
    expect(out.html).toContain('Hello there');
    expect(out.html).not.toContain('{{{RESEND_UNSUBSCRIBE_URL}}}');
    expect(out.sendHtml).toContain('{{{RESEND_UNSUBSCRIBE_URL}}}');
    expect(out.bytes).toBe(new TextEncoder().encode(out.sendHtml).length);
    expect(out.imagePrefixes).toEqual([`${IMAGES}/`]);
  });
});

describe('the sending dialogs', () => {
  it('reads addresses separated by commas, spaces or lines, once each', () => {
    expect(parseAddresses(' A@x.com, b@x.com;\nb@x.com  c@x.com ')).toEqual(['a@x.com', 'b@x.com', 'c@x.com']);
  });

  it('sends a test to the addresses typed, five at most', async () => {
    const onSend = vi.fn();
    render(<TestSendDialog defaultTo="me@hopetrustindia.com" busy={false} onSend={onSend} onClose={() => {}} />);
    const box = screen.getByLabelText(/Send to/);
    expect(box).toHaveValue('me@hopetrustindia.com');
    await userEvent.clear(box);
    await userEvent.type(box, 'a@x.com b@x.com c@x.com d@x.com e@x.com f@x.com');
    expect(screen.getByRole('alert')).toHaveTextContent("That's more than 5 addresses.");
    expect(screen.getByRole('button', { name: /Send test/ })).toBeDisabled();
    await userEvent.clear(box);
    await userEvent.type(box, 'a@x.com, b@x.com');
    await userEvent.click(screen.getByRole('button', { name: /Send test/ }));
    expect(onSend).toHaveBeenCalledWith(['a@x.com', 'b@x.com']);
  });

  it('shows what will go out before the final click', async () => {
    const onSend = vi.fn();
    render(
      <SendDialog
        subject="Know thyself"
        from="Hope Trust <newsletter@hopetrustindia.com>"
        subscribed={312}
        busy={false}
        progress=""
        onSend={onSend}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Send to subscribers' })).toBeInTheDocument();
    expect(screen.getByText('Know thyself')).toBeInTheDocument();
    expect(screen.getByText('Hope Trust <newsletter@hopetrustindia.com>')).toBeInTheDocument();
    expect(screen.getByText('312 subscribers')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Send now/ }));
    expect(onSend).toHaveBeenCalledTimes(1);
  });
});
