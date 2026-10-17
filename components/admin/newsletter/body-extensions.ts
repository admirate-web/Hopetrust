// The TipTap extensions for an issue's body: exactly the content spec §6.3
// allows, so the editor can't hold anything the email can't show. Pasted
// HTML is parsed against this schema, which reduces Google Docs and Word
// formatting to it. Pasted images are removed first (withoutImages), so every
// image is uploaded, and resized, through the Image button.

import type { Extensions } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import StarterKit from '@tiptap/starter-kit';
import { isAllowedLink } from '@/lib/newsletter/issue';

export const PASTED_IMAGES_NOTE =
  'Pasted images were left out. Add photos with the Image button, so they are resized for email.';

export function bodyExtensions(): Extensions {
  return [
    StarterKit.configure({
      code: false,
      codeBlock: false,
      strike: false,
      underline: false,
      trailingNode: false,
      heading: { levels: [2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
        isAllowedUri: (url) => isAllowedLink(url),
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: null },
      },
    }),
    Image.configure({ inline: false, allowBase64: false }),
  ];
}

/** Pasted HTML without its images, and whether it had any. */
export function withoutImages(html: string): { html: string; removed: boolean } {
  const cleaned = html.replace(/<picture\b[\s\S]*?<\/picture>/gi, '').replace(/<img\b[^>]*>/gi, '');
  return { html: cleaned, removed: cleaned !== html };
}
