// Photos for an issue (spec §6.4, §10.4). Each is resized in the browser to
// at most 1,200 px wide and saved as JPEG, or PNG when the original is a PNG,
// never WebP. Then it goes to the image bucket through a signed upload URL.

import { issueUploadUrl } from '@/lib/newsletter-admin';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_WIDTH = 1200;
const JPEG_QUALITY = 0.85;
/** Every upload gets a new file name, so a photo can be cached for a year. */
const CACHE_SECONDS = '31536000';

export class ImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageError';
  }
}

export interface PreparedImage {
  blob: Blob;
  type: 'image/jpeg' | 'image/png';
  width: number;
  height: number;
}

export function targetSize(width: number, height: number, maxWidth = MAX_IMAGE_WIDTH): { width: number; height: number } {
  if (width <= maxWidth) return { width, height };
  return { width: maxWidth, height: Math.max(1, Math.round((height * maxWidth) / width)) };
}

export function outputType(inputType: string): 'image/jpeg' | 'image/png' {
  return inputType === 'image/png' ? 'image/png' : 'image/jpeg';
}

/** Checks a chosen file before any work. Throws ImageError with a message for staff. */
export function checkImageFile(file: File): void {
  if (!file.type.startsWith('image/')) throw new ImageError('Choose a photo: a JPEG or PNG file.');
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ImageError('That photo is over 5 MB. Choose a smaller one, or export it at a smaller size.');
  }
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  checkImageFile(file);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageError("That file couldn't be opened as a photo. Try a JPEG or PNG.");
  }
  const size = targetSize(bitmap.width, bitmap.height);
  const type = outputType(file.type);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new ImageError("This browser couldn't resize the photo. Try another browser.");
  if (type === 'image/jpeg') {
    // JPEG has no transparency: a transparent area becomes white, not black.
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, size.width, size.height);
  }
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, type === 'image/jpeg' ? JPEG_QUALITY : undefined),
  );
  if (!blob) throw new ImageError("This browser couldn't resize the photo. Try another browser.");
  return { blob, type, ...size };
}

export interface UploadDeps {
  prepare?: (file: File) => Promise<PreparedImage>;
  upload?: (path: string, token: string, image: PreparedImage) => Promise<void>;
}

async function uploadToBucket(path: string, token: string, image: PreparedImage): Promise<void> {
  // Imported here, not at the top: lib/supabase reads the public env vars as it loads.
  const { supabase } = await import('@/lib/supabase');
  const { error } = await supabase.storage
    .from('newsletter-images')
    .uploadToSignedUrl(path, token, image.blob, { contentType: image.type, cacheControl: CACHE_SECONDS });
  if (error) throw new ImageError(`The photo didn't upload: ${error.message}`);
}

/** Resizes and uploads a photo for the issue, and returns its public address. */
export async function uploadIssueImage(token: string, issueId: string, file: File, deps: UploadDeps = {}): Promise<string> {
  const image = await (deps.prepare ?? prepareImage)(file);
  const ticket = await issueUploadUrl(token, issueId, image.type);
  await (deps.upload ?? uploadToBucket)(ticket.path, ticket.token, image);
  return ticket.public_url;
}
