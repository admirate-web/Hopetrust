'use client';

// The body of an issue (spec §6.3, §8.1). TipTap holds only the content the
// email can show, with a toolbar for it. Photos go through the Image button,
// which resizes and uploads them. Pasted images are removed, with a note.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ChainedCommands } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import {
  Bold,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Quote,
  Redo2,
  Undo2,
} from 'lucide-react';
import type { BodyDoc } from '@/lib/newsletter/content';
import { isAllowedLink } from '@/lib/newsletter/issue';
import { PASTED_IMAGES_NOTE, bodyExtensions, withoutImages } from './body-extensions';

export interface BodyEditorProps {
  /** Read once, when the editor mounts. Give it a new `key` to replace the content. */
  initial: BodyDoc;
  readOnly?: boolean;
  onChange: (doc: BodyDoc) => void;
  /** Resizes and uploads a photo, and returns its public address. */
  onUploadImage: (file: File) => Promise<string>;
}

/** Close to the email's look, so staff see roughly what readers will. */
const BODY_CSS = `
.nl-body{font-size:15px;line-height:1.65;color:#111}
.nl-body p{margin:0 0 12px}
.nl-body h2{font-size:22px;font-weight:700;text-align:center;margin:24px 0 10px}
.nl-body h3{font-size:18px;font-weight:700;margin:20px 0 8px}
.nl-body ul{list-style:disc;padding-left:24px;margin:0 0 12px}
.nl-body ol{list-style:decimal;padding-left:24px;margin:0 0 12px}
.nl-body li p{margin:0 0 4px}
.nl-body blockquote{background:#EE7429;color:#fff;border-radius:16px;padding:16px 20px;margin:20px 0;text-align:center;font-size:20px}
.nl-body hr{border:0;border-top:2px solid #EE7429;margin:24px 0}
.nl-body img{display:block;max-width:100%;height:auto;border-radius:12px;margin:8px 0 16px}
.nl-body img.ProseMirror-selectednode{outline:3px solid #EE7429}
.nl-body a{color:#EE7429;text-decoration:underline}
`;

function ToolButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      // Keeps the text selection, so the button acts on what is selected.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition disabled:opacity-40 ${
        active ? 'bg-[#ED7428] text-white' : 'text-gray-700 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  );
}

export default function BodyEditor({ initial, readOnly = false, onChange, onUploadImage }: BodyEditorProps) {
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const changed = useRef(onChange);
  changed.current = onChange;

  const editor = useEditor({
    extensions: bodyExtensions(),
    content: initial,
    editable: !readOnly,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class: 'nl-body min-h-[320px] px-4 py-3 outline-none',
        role: 'textbox',
        'aria-label': 'Body',
        'aria-multiline': 'true',
      },
      transformPastedHTML(html) {
        const result = withoutImages(html);
        if (result.removed) setNote(PASTED_IMAGES_NOTE);
        return result.html;
      },
      handlePaste(_view, event) {
        const data = event.clipboardData;
        if (!data) return false;
        const hasText = data.types.includes('text/html') || data.types.includes('text/plain');
        // A screenshot or copied photo alone. Word also adds a picture of the
        // selection beside its HTML, so pastes with text still go through.
        if (!hasText && Array.from(data.files).some((file) => file.type.startsWith('image/'))) {
          setNote(PASTED_IMAGES_NOTE);
          return true;
        }
        return false;
      },
      handleDrop(_view, event) {
        if (event.dataTransfer?.files.length) {
          setNote(PASTED_IMAGES_NOTE);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: current }) => changed.current(current.getJSON() as BodyDoc),
  });

  useEffect(() => {
    // false: switching editability isn't an edit, so it mustn't report a change.
    editor?.setEditable(!readOnly, false);
  }, [editor, readOnly]);

  function setLink() {
    if (!editor) return;
    const current = editor.getAttributes('link').href as string | undefined;
    const input = window.prompt('Link address: https://…, mailto:… or tel:…. Leave it empty to remove the link.', current ?? 'https://');
    if (input === null) return;
    const href = input.trim();
    const chain = editor.chain().focus(null, { scrollIntoView: false }).extendMarkRange('link');
    if (href === '' || href === 'https://') {
      chain.unsetLink().run();
    } else if (isAllowedLink(href)) {
      chain.setLink({ href }).run();
      setNote('');
    } else {
      setNote('A link must start with https://, http://, mailto: or tel:.');
    }
  }

  async function addImage(file: File | undefined) {
    if (fileInput.current) fileInput.current.value = '';
    if (!file || !editor) return;
    const alt = window.prompt("Describe the photo for people who can't see it:", '');
    if (alt === null) return;
    setUploading(true);
    setNote('');
    try {
      const src = await onUploadImage(file);
      editor.chain().focus(null, { scrollIntoView: false }).setImage({ src, alt: alt.trim() }).run();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "The photo didn't upload.");
    } finally {
      setUploading(false);
    }
  }

  const ready = Boolean(editor) && !readOnly;
  const run = (command: (chain: ChainedCommands) => ChainedCommands) => () => {
    if (editor) command(editor.chain().focus()).run();
  };

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <style>{BODY_CSS}</style>
      {!readOnly && (
        <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-1 border-b border-gray-100 bg-[#F7F6F4]/60 px-2 py-1.5">
          <ToolButton label="Bold" active={editor?.isActive('bold')} disabled={!ready} onClick={run((c) => c.toggleBold())}>
            <Bold className="h-4 w-4" />
          </ToolButton>
          <ToolButton label="Italic" active={editor?.isActive('italic')} disabled={!ready} onClick={run((c) => c.toggleItalic())}>
            <Italic className="h-4 w-4" />
          </ToolButton>
          <ToolButton
            label="Heading"
            active={editor?.isActive('heading', { level: 2 })}
            disabled={!ready}
            onClick={run((c) => c.toggleHeading({ level: 2 }))}
          >
            <Heading2 className="h-4 w-4" />
          </ToolButton>
          <ToolButton
            label="Subheading"
            active={editor?.isActive('heading', { level: 3 })}
            disabled={!ready}
            onClick={run((c) => c.toggleHeading({ level: 3 }))}
          >
            <Heading3 className="h-4 w-4" />
          </ToolButton>
          <ToolButton label="Bulleted list" active={editor?.isActive('bulletList')} disabled={!ready} onClick={run((c) => c.toggleBulletList())}>
            <List className="h-4 w-4" />
          </ToolButton>
          <ToolButton label="Numbered list" active={editor?.isActive('orderedList')} disabled={!ready} onClick={run((c) => c.toggleOrderedList())}>
            <ListOrdered className="h-4 w-4" />
          </ToolButton>
          <ToolButton label="Pull-quote" active={editor?.isActive('blockquote')} disabled={!ready} onClick={run((c) => c.toggleBlockquote())}>
            <Quote className="h-4 w-4" />
          </ToolButton>
          <ToolButton label="Divider" disabled={!ready} onClick={run((c) => c.setHorizontalRule())}>
            <Minus className="h-4 w-4" />
          </ToolButton>
          <ToolButton label="Link" active={editor?.isActive('link')} disabled={!ready} onClick={setLink}>
            <Link2 className="h-4 w-4" />
          </ToolButton>
          <ToolButton label="Image" disabled={!ready || uploading} onClick={() => fileInput.current?.click()}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          </ToolButton>
          <ToolButton label="Undo" disabled={!ready || !editor?.can().undo()} onClick={run((c) => c.undo())}>
            <Undo2 className="h-4 w-4" />
          </ToolButton>
          <ToolButton label="Redo" disabled={!ready || !editor?.can().redo()} onClick={run((c) => c.redo())}>
            <Redo2 className="h-4 w-4" />
          </ToolButton>
        </div>
      )}
      <EditorContent editor={editor} />
      {note && (
        <p role="status" className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          {note}
        </p>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        aria-label="Choose a photo for the body"
        onChange={(e) => addImage(e.target.files?.[0])}
      />
    </div>
  );
}
