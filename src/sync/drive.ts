import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';

// drive.appdata = a hidden, app-private folder in the user's own Google Drive.
// The app can't see the user's other files and nothing goes to any third-party server.
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
/** Each phone writes its own file, pettagam-<device>.json; older versions wrote this one shared file. */
export const FILE_PREFIX = 'pettagam-';
export const LEGACY_FILE = 'expense-manager-sync.json';

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

export type DriveFile = { id: string; name: string; modifiedTime: string };

/** Every Pettagam backup in the app folder: one per phone, plus the old shared file if it's there. */
export async function listBackups(): Promise<DriveFile[]> {
  const q = encodeURIComponent(`(name contains '${FILE_PREFIX}' or name = '${LEGACY_FILE}') and trashed = false`);
  const res = await driveFetch(`${API}/files?spaces=appDataFolder&q=${q}&fields=files(id,name,modifiedTime)&pageSize=100`);
  return ((await res.json()) as { files: DriveFile[] }).files;
}

export async function download<T>(id: string): Promise<T> {
  const res = await driveFetch(`${API}/files/${id}?alt=media`);
  return (await res.json()) as T;
}

/** Writes JSON to the named file in the app folder: replaces it when `id` is given, creates it otherwise. */
export async function upload(name: string, body: string, id?: string): Promise<DriveFile> {
  const fields = 'fields=id,name,modifiedTime';
  if (id) {
    const res = await driveFetch(`${UPLOAD}/files/${id}?uploadType=media&${fields}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    return res.json();
  }
  const boundary = `pettagam${Date.now()}`;
  const meta = JSON.stringify({ name, parents: ['appDataFolder'], mimeType: 'application/json' });
  const multipart =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
  const res = await driveFetch(`${UPLOAD}/files?uploadType=multipart&${fields}`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: multipart,
  });
  return res.json();
}
