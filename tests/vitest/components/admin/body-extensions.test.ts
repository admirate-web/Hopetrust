import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import { bodyExtensions, withoutImages } from '@/components/admin/newsletter/body-extensions';
import { normalizeBody } from '@/lib/newsletter/issue';

/** Every node type, and every mark type as "mark:<type>", in a document. */
function types(node: unknown, found = new Set<string>()): Set<string> {
  const n = node as { type?: string; marks?: Array<{ type: string }>; content?: unknown[] } | null;
  if (n?.type) found.add(n.type);
  n?.marks?.forEach((mark) => found.add(`mark:${mark.type}`));
  n?.content?.forEach((child) => types(child, found));
  return found;
}

const ALLOWED = [
  'doc', 'paragraph', 'heading', 'text', 'hardBreak', 'bulletList', 'orderedList', 'listItem',
  'blockquote', 'horizontalRule', 'image', 'mark:bold', 'mark:italic', 'mark:link',
];

/** Roughly what Google Docs puts on the clipboard: styled spans, h1 and h4, a table, an image, links. */
const GOOGLE_DOCS = `<meta charset="utf-8"><b id="docs-internal-guid-1" style="font-weight:normal;">
<h1 dir="ltr"><span style="font-size:20pt;font-family:Arial;">Big title</span></h1>
<p dir="ltr"><span style="font-weight:700;">Bold</span> <span style="font-style:italic;">italic</span> <span style="text-decoration:line-through;">struck</span> <span style="text-decoration:underline;">under</span> <code>code</code></p>
<p><img src="https://lh7.googleusercontent.com/abc" width="200"></p>
<table><tbody><tr><td><p>In a table</p></td></tr></tbody></table>
<h4>Small heading</h4>
<ul><li><p>One</p></li><li><p>Two</p></li></ul>
<p><a href="javascript:alert(1)">bad link</a> <a href="https://hopetrustindia.com/blogs/">good link</a></p>
</b>`;

function parse(html: string) {
  const editor = new Editor({ extensions: bodyExtensions(), content: html });
  const json = editor.getJSON();
  editor.destroy();
  return json;
}

describe('the body editor schema', () => {
  it('reduces a Google Docs paste to the content the email allows, keeping the words', () => {
    const json = parse(withoutImages(GOOGLE_DOCS).html);
    expect(Array.from(types(json)).filter((type) => !ALLOWED.includes(type))).toEqual([]);
    const text = JSON.stringify(json);
    for (const words of ['Big title', 'Bold', 'italic', 'struck', 'under', 'code', 'In a table', 'Small heading', 'One', 'Two', 'bad link', 'good link']) {
      expect(text).toContain(words);
    }
    expect(text).not.toContain('javascript:');
    expect(text).not.toContain('googleusercontent');
    expect(text).toContain('https://hopetrustindia.com/blogs/');
    // Saving keeps every kind of content the editor holds.
    expect(types(normalizeBody(json))).toEqual(types(json));
  });

  it('keeps headings at the two allowed levels', () => {
    const json = parse('<h2>Two</h2><h3>Three</h3>');
    expect(json.content?.map((node) => node.attrs?.level)).toEqual([2, 3]);
  });
});

describe('withoutImages', () => {
  it('removes images and pictures from pasted HTML, and says so', () => {
    expect(withoutImages('<p>a<img src="x.png">b</p><picture><source srcset="y.webp"><img src="y.jpg"></picture>')).toEqual({
      html: '<p>ab</p>',
      removed: true,
    });
    expect(withoutImages('<p>plain</p>')).toEqual({ html: '<p>plain</p>', removed: false });
  });
});
