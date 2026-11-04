import * as SecureStore from 'expo-secure-store';

import { cookieHeader, jwtExpiry, mergeCookies, parseSetCookie } from '@/sync/wire';

/**
 * Minimal Neon Auth (Better Auth) client for React Native.
 *
 * Neon Auth's browser SDK relies on cookies/BroadcastChannel, so on the phone we call its REST
 * endpoints directly: the session cookie is kept in the device keychain (SecureStore) and
 * `/get-session` returns a short-lived JWT in the `set-auth-jwt` header. That JWT is sent to the
 * Data API, where Postgres row-level security turns it into auth.user_id().
 */

export const AUTH_URL = (process.env.EXPO_PUBLIC_NEON_AUTH_URL ?? '').replace(/\/$/, '');
// Better Auth rejects sign-up without an Origin (MISSING_ORIGIN) and only trusts known origins.
// A native app has no web origin, so we present the auth server's own origin, which it always trusts.
const AUTH_ORIGIN = AUTH_URL.match(/^https?:\/\/[^/]+/)?.[0] ?? '';

export type AuthUser = { id: string; email: string; name: string | null };

const COOKIE_KEY = 'neon_auth_cookies';
const USER_KEY = 'neon_auth_user';

let jar: Record<string, string> | null = null;
let jwt: { token: string; exp: number } | null = null;

export class AuthError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

async function loadJar() {
  if (jar) return jar;
  const raw = await SecureStore.getItemAsync(COOKIE_KEY);
  jar = raw ? (JSON.parse(raw) as Record<string, string>) : {};
  return jar;
}

async function saveJar(next: Record<string, string>) {
  jar = next;
  await SecureStore.setItemAsync(COOKIE_KEY, JSON.stringify(next));
}

async function authFetch(path: string, init: RequestInit = {}) {
  if (!AUTH_URL) throw new AuthError('EXPO_PUBLIC_NEON_AUTH_URL is not set (see .env.example)', 0);
  const cookies = await loadJar();
  const res = await fetch(`${AUTH_URL}${path}`, {
    ...init,
    credentials: 'omit', // we manage the cookie ourselves
    headers: {
      'Content-Type': 'application/json',
      Origin: AUTH_ORIGIN,
      ...(Object.keys(cookies).length ? { Cookie: cookieHeader(cookies) } : {}),
      ...(init.headers ?? {}),
    },
  });
  const updates = parseSetCookie(res.headers.get('set-cookie'));
  if (Object.keys(updates).length) await saveJar(mergeCookies(cookies, updates));
  const headerJwt = res.headers.get('set-auth-jwt');
  if (headerJwt) jwt = { token: headerJwt, exp: jwtExpiry(headerJwt) };
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new AuthError(body.message || `Auth request failed (${res.status})`, res.status);
  }
  return res;
}

function toUser(u: { id: string; email: string; name?: string | null }): AuthUser {
  return { id: u.id, email: u.email, name: u.name ?? null };
}

async function finishSignIn(): Promise<AuthUser> {
  const user = await refreshSession();
  if (!user) throw new AuthError('Signed in, but no session was returned', 401);
  return user;
}

export async function signUpWithEmail(email: string, password: string, name: string) {
  await authFetch('/sign-up/email', { method: 'POST', body: JSON.stringify({ email, password, name }) });
  return finishSignIn();
}

export async function signInWithEmail(email: string, password: string) {
  await authFetch('/sign-in/email', { method: 'POST', body: JSON.stringify({ email, password }) });
  return finishSignIn();
}

/** Fetches the session (and a fresh JWT). Returns null if the session ended. */
export async function refreshSession(): Promise<AuthUser | null> {
  const res = await authFetch('/get-session', { method: 'GET' });
  const body = (await res.json().catch(() => null)) as { user?: { id: string; email: string; name?: string } } | null;
  if (!body?.user) {
    jwt = null;
    await SecureStore.deleteItemAsync(USER_KEY);
    return null;
  }
  const user = toUser(body.user);
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  return user;
}

/** The last signed-in user, readable offline (no network needed to open the app). */
export async function cachedUser(): Promise<AuthUser | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  return raw ? (JSON.parse(raw) as AuthUser) : null;
}

/** JWT for the Data API; refreshed a minute before it expires. */
export async function getJwt(force = false): Promise<string> {
  if (!force && jwt && jwt.exp - Date.now() > 60_000) return jwt.token;
  jwt = null;
  const user = await refreshSession();
  if (!user || !jwt) throw new AuthError('Session expired. Please sign in again.', 401);
  return (jwt as { token: string }).token;
}

export async function signOut() {
  try {
    await authFetch('/sign-out', { method: 'POST', body: '{}' });
  } catch {
    // Offline or already expired: clearing local credentials is what matters.
  }
  jwt = null;
  jar = {};
  await SecureStore.deleteItemAsync(COOKIE_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}
