// Admin sign-in check for the newsletter functions: the JWT that admin-login
// issues (24-hour expiry), as the other admin functions check it.

import jwt from 'jsonwebtoken';

export interface AdminUser {
  email: string;
}

export function verifyAdminToken(req: Request, secret = process.env.ADMIN_JWT_SECRET): AdminUser | null {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || !secret) return null;
  try {
    const payload = jwt.verify(token, secret) as { email?: unknown; role?: unknown };
    return payload.role === 'admin' && typeof payload.email === 'string' ? { email: payload.email } : null;
  } catch {
    return null;
  }
}
