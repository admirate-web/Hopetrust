import { beforeAll, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import BodyEditor from '@/components/admin/newsletter/BodyEditor';
import type { BodyDoc } from '@/lib/newsletter/content';

// ProseMirror measures the selection to scroll it into view, and jsdom has no layout.
beforeAll(() => {
  const empty = { length: 0, item: () => null, [Symbol.iterator]: Array.prototype[Symbol.iterator] };
  Range.prototype.getClientRects = () => empty as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Element.prototype.scrollIntoView = () => {};
  document.elementFromPoint = () => null;
});

const INITIAL: BodyDoc = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello readers' }] }],
};
const PHOTO = 'https://abc.supabase.co/storage/v1/object/public/newsletter-images/issues/i/p.jpg';

describe('BodyEditor', () => {
  it('shows the body, with a toolbar of only the allowed formatting', async () => {
    render(<BodyEditor initial={INITIAL} onChange={() => {}} onUploadImage={async () => PHOTO} />);
    expect(await screen.findByText('Hello readers')).toBeInTheDocument();
    const toolbar = screen.getByRole('toolbar', { name: 'Formatting' });
    expect(Array.from(toolbar.querySelectorAll('button')).map((b) => b.getAttribute('aria-label'))).toEqual([
      'Bold', 'Italic', 'Heading', 'Subheading', 'Bulleted list', 'Numbered list', 'Pull-quote', 'Divider',
      'Link', 'Image', 'Undo', 'Redo',
    ]);
  });

  it('has no toolbar when read-only', async () => {
    render(<BodyEditor initial={INITIAL} readOnly onChange={() => {}} onUploadImage={async () => PHOTO} />);
    expect(await screen.findByText('Hello readers')).toBeInTheDocument();
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });

  it('uploads a photo through the Image button and adds it with its description', async () => {
    const onChange = vi.fn();
    const onUploadImage = vi.fn(async () => PHOTO);
    vi.spyOn(window, 'prompt').mockReturnValue('  Two people talking ');
    render(<BodyEditor initial={INITIAL} onChange={onChange} onUploadImage={onUploadImage} />);
    await screen.findByText('Hello readers');
    const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Choose a photo for the body'), { target: { files: [file] } });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onUploadImage).toHaveBeenCalledWith(file);
    const doc = onChange.mock.calls[onChange.mock.calls.length - 1][0] as BodyDoc;
    expect(doc.content).toContainEqual({
      type: 'image',
      attrs: expect.objectContaining({ src: PHOTO, alt: 'Two people talking' }),
    });
  });

  it("says why a photo didn't upload, and adds nothing", async () => {
    const onChange = vi.fn();
    vi.spyOn(window, 'prompt').mockReturnValue('A photo');
    render(
      <BodyEditor
        initial={INITIAL}
        onChange={onChange}
        onUploadImage={async () => {
          throw new Error('That photo is over 5 MB.');
        }}
      />,
    );
    await screen.findByText('Hello readers');
    fireEvent.change(screen.getByLabelText('Choose a photo for the body'), {
      target: { files: [new File(['x'], 'p.jpg', { type: 'image/jpeg' })] },
    });
    expect(await screen.findByRole('status')).toHaveTextContent('That photo is over 5 MB.');
    expect(onChange).not.toHaveBeenCalled();
  });
});
