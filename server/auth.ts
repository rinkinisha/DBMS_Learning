import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import type { DataStore, StudentFullRow } from './storeTypes.ts';

export const SESSION_COOKIE_NAME = 'dbms_arena_session';
const SESSION_TTL_DAYS = 7;

export type AuthStudentRow = StudentFullRow;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, expectedHex] = storedHash.split(':');
  if (!salt || !expectedHex) return false;
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (derivedBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(derivedBuf, expectedBuf);
}

export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return 'Email address is required.';
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) return 'Please enter a valid email address.';
  return null;
}

export function validateUsername(username: string): string | null {
  const trimmed = username.trim();
  if (!trimmed) return 'Username is required.';
  if (trimmed.length < 3 || trimmed.length > 24) {
    return 'Username must be between 3 and 24 characters.';
  }
  if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
    return 'Username may only contain letters, numbers, and underscores.';
  }
  return null;
}

export function validatePasswordStrength(password: string): string | null {
  if (!password) return 'Password is required.';
  if (password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must include at least one letter and one number.';
  }
  return null;
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) result[key] = decodeURIComponent(val);
  }
  return result;
}

export function extractSessionToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE_NAME] || null;
}

function isSecureRequest(req?: Request): boolean {
  if (!req) return false;
  if (req.secure) return true;
  const proto = req.headers['x-forwarded-proto'];
  if (typeof proto === 'string' && proto.split(',')[0].trim() === 'https') return true;
  return false;
}

export function setSessionCookie(res: Response, token: string, req?: Request): void {
  const maxAge = SESSION_TTL_DAYS * 24 * 60 * 60;
  const secureAttrs = isSecureRequest(req) ? '; SameSite=None; Secure' : '; SameSite=Lax';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/${secureAttrs}; Max-Age=${maxAge}`
  );
}

export function clearSessionCookie(res: Response, req?: Request): void {
  const secureAttrs = isSecureRequest(req) ? '; SameSite=None; Secure' : '; SameSite=Lax';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/${secureAttrs}; Max-Age=0`
  );
}

export async function createUserSession(store: DataStore, studentId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await store.createSession({
    token,
    student_id: studentId,
    expires_at: expiresAt,
    created_at: now.toISOString(),
  });
  return token;
}

export async function deleteUserSession(store: DataStore, token: string): Promise<void> {
  await store.deleteSession(token);
}

export async function getAuthenticatedUser(
  store: DataStore,
  req: Request
): Promise<AuthStudentRow | null> {
  const token = extractSessionToken(req);
  if (!token) return null;

  const session = await store.getSessionByToken(token);
  if (!session) return null;

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await deleteUserSession(store, token);
    return null;
  }

  const user = await store.getStudentById(session.student_id);
  return user ?? null;
}

export function sanitizeUserForClient(user: AuthStudentRow) {
  return {
    id: user.id,
    name: user.name,
    username: user.username || `learner_${user.id}`,
    email: user.email || '',
    avatar_seed: user.avatar_seed,
    xp: user.xp,
    hearts: user.hearts,
    max_hearts: user.max_hearts,
    gems: user.gems,
    streak_days: user.streak_days,
    longest_streak: user.longest_streak ?? user.streak_days,
    last_active_date: user.last_active_date,
    league: user.league,
    weekly_xp: user.weekly_xp,
    role: user.role,
    is_demo: Boolean(user.is_demo),
    timezone: user.timezone || 'Asia/Kolkata',
    sql_solved_count: user.sql_solved_count ?? 0,
    created_at: user.created_at,
  };
}
