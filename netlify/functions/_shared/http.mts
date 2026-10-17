// JSON, CORS and request helpers for the newsletter functions.

import { SITE_ORIGIN } from './newsletter-deps.mts';

export function corsHeaders(methods: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': SITE_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': methods,
  };
}

export function jsonResponse(body: unknown, status: number, methods: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(methods), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export function preflight(methods: string): Response {
  return new Response(null, { status: 204, headers: corsHeaders(methods) });
}

export type BodyResult = { ok: true; value: unknown } | { ok: false; status: number; error: string };

/** Reads a JSON body of at most `maxBytes`. */
export async function readJsonBody(req: Request, maxBytes: number): Promise<BodyResult> {
  if (!(req.headers.get('content-type') || '').includes('application/json')) {
    return { ok: false, status: 415, error: 'Content-Type must be application/json' };
  }
  if (Number(req.headers.get('content-length') || '0') > maxBytes) {
    return { ok: false, status: 413, error: 'Request body too large' };
  }
  let text: string;
  try {
    text = await req.text();
  } catch {
    return { ok: false, status: 400, error: 'Could not read the request body' };
  }
  if (new TextEncoder().encode(text).length > maxBytes) {
    return { ok: false, status: 413, error: 'Request body too large' };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, error: 'Invalid JSON body' };
  }
}

/** The visitor's IP: Netlify's own header first, because a visitor can't set it. */
export function clientIp(req: Request): string | null {
  return (
    req.headers.get('x-nf-client-connection-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    null
  );
}
