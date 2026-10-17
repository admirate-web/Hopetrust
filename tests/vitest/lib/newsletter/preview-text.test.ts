import { describe, it, expect } from 'vitest';
import type { BodyDoc } from '@/lib/newsletter/content';
import { bodyPreviewText } from '@/lib/newsletter/render';

describe('bodyPreviewText', () => {
  it('never cuts an emoji in half', () => {
    const doc: BodyDoc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: `${'a'.repeat(138)}😀${'b'.repeat(10)}` }] }],
    };
    expect(bodyPreviewText(doc, 140)).toBe(`${'a'.repeat(138)}😀…`);
  });
});
