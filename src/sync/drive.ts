import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';

import { LEGACY_FILE, LOG_PREFIX, SNAPSHOT_PREFIX, type RemoteFile as DriveFile } from './drive-plan';

// drive.appdata = a hidden, app-private folder in the user's own Google Drive.
// The app can't see the user's other files and nothing goes to any third-party server.
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
let configured = false;
function configure() {
  if (configured) return;
  GoogleSignin.configure({
    scopes: [DRIVE_SCOPE],
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined,
  });
  configured = true;
}

/** Interactive Google sign-in with Drive app-folder access. The account's email, or null if cancelled. */
export async function signIn(): Promise<string | null> {
  configure();
  await GoogleSignin.hasPlayServices();
  const res = await GoogleSignin.signIn();
  if (!isSuccessResponse(res)) return null;
  if (!res.data.scopes?.includes(DRIVE_SCOPE)) {
    const added = await GoogleSignin.addScopes({ scopes: [DRIVE_SCOPE] });
    if (!added) return null;
  }
  return res.data.user.email;
}

export async function signOut() {
  configure();
  await GoogleSignin.signOut().catch(() => {});
}

/** Quietly restores the Google session after an app restart (no UI); throws if it can't. */
async function token(): Promise<string> {
  configure();
  if (!GoogleSignin.getCurrentUser()) await GoogleSignin.signInSilently();
  const { accessToken } = await GoogleSignin.getTokens();
  return accessToken;
}

async function driveFetch(url: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${await token()}`, ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Google Drive ${res.status}: ${await res.text()}`);
  return res;
}

export type { RemoteFile as DriveFile } from './drive-plan';

const FIELDS = 'id,name,modifiedTime,appProperties';
const q = (query: string) => encodeURIComponent(`${query} and trashed = false`);

/** Pettagam's files in the app folder, only those changed after `since` (RFC 3339) when given. */
export async function listFiles(since?: string): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let page = '';
  do {
    const filter = `(name contains '${SNAPSHOT_PREFIX}' or name contains '${LOG_PREFIX}' or name = '${LEGACY_FILE}')${since ? ` and modifiedTime > '${since}'` : ''}`;
    const res = await driveFetch(`${API}/files?spaces=appDataFolder&q=${q(filter)}&fields=nextPageToken,files(${FIELDS})&pageSize=1000${page ? `&pageToken=${page}` : ''}`);
    const json = (await res.json()) as { files: DriveFile[]; nextPageToken?: string };
    out.push(...json.files);
    page = json.nextPageToken ?? '';
  } while (page);
  return out;
}

export async function findByName(name: string): Promise<DriveFile | null> {
  const res = await driveFetch(`${API}/files?spaces=appDataFolder&q=${q(`name = '${name}'`)}&fields=files(${FIELDS})`);
  return ((await res.json()) as { files: DriveFile[] }).files[0] ?? null;
}

/** The file's JSON, or null if it's gone (deleted by its phone's clean-up since it was listed). */
export async function download<T>(id: string): Promise<T | null> {
  try {
    const res = await driveFetch(`${API}/files/${id}?alt=media`);
    return (await res.json()) as T;
  } catch (e) {
    if (/Google Drive 404/.test(String(e))) return null;
    throw e;
  }
}

/** Writes JSON to the named file in the app folder (replacing file `id` when given), with optional properties. */
export async function upload(name: string, body: string, id?: string, props?: Record<string, string>): Promise<DriveFile> {
  const boundary = `pettagam${Date.now()}`;
  const meta = JSON.stringify(id ? { appProperties: props ?? {} } : { name, parents: ['appDataFolder'], mimeType: 'application/json', appProperties: props ?? {} });
  const multipart =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
  const res = await driveFetch(`${UPLOAD}/files${id ? `/${id}` : ''}?uploadType=multipart&fields=${FIELDS}`, {
    method: id ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: multipart,
  });
  return res.json();
}

export async function remove(id: string) {
  await driveFetch(`${API}/files/${id}`, { method: 'DELETE' }).catch((e) => {
    if (!/Google Drive 404/.test(String(e))) throw e;
  });
}
