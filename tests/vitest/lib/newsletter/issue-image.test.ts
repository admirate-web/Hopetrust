import { afterEach, describe, it, expect, vi } from 'vitest';
import { ImageError, checkImageFile, outputType, targetSize, uploadIssueImage } from '@/lib/newsletter/issue-image';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('targetSize', () => {
  it('shrinks a wide photo to 1,200 px, keeping its shape, and leaves a smaller one alone', () => {
    expect(targetSize(4000, 3000)).toEqual({ width: 1200, height: 900 });
    expect(targetSize(1200, 50)).toEqual({ width: 1200, height: 50 });
    expect(targetSize(800, 1200)).toEqual({ width: 800, height: 1200 });
    expect(targetSize(100_000, 10)).toEqual({ width: 1200, height: 1 });
  });
});

describe('outputType', () => {
  it('keeps PNG, and turns everything else into JPEG, never WebP', () => {
    expect(outputType('image/png')).toBe('image/png');
    expect(outputType('image/webp')).toBe('image/jpeg');
    expect(outputType('image/heic')).toBe('image/jpeg');
    expect(outputType('image/jpeg')).toBe('image/jpeg');
  });
});

describe('checkImageFile', () => {
  it('turns away a file that is not a photo, or is over 5 MB', () => {
    expect(() => checkImageFile(new File(['x'], 'notes.pdf', { type: 'application/pdf' }))).toThrow(ImageError);
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' });
    expect(() => checkImageFile(big)).toThrow('That photo is over 5 MB');
    expect(() => checkImageFile(new File(['x'], 'ok.jpg', { type: 'image/jpeg' }))).not.toThrow();
  });
});

describe('uploadIssueImage', () => {
  it('asks for an upload URL for the prepared type, uploads to it, and returns the public address', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(
          JSON.stringify({ path: 'issues/i/a.png', token: 'tok', signed_url: 'https://x/sign', public_url: 'https://x/public/issues/i/a.png' }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const image = { blob: new Blob(['png']), type: 'image/png' as const, width: 10, height: 10 };
    const upload = vi.fn(async () => {});
    const url = await uploadIssueImage('tkn', 'i', new File(['x'], 'a.png', { type: 'image/png' }), {
      prepare: async () => image,
      upload,
    });
    expect(url).toBe('https://x/public/issues/i/a.png');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin-newsletter-issues?id=i&action=upload-url',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ content_type: 'image/png' }) }),
    );
    expect(upload).toHaveBeenCalledWith('issues/i/a.png', 'tok', image);
  });
});
