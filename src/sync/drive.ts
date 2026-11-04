import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';

// drive.appdata = a hidden, app-private folder in the user's own Google Drive.
// The app can't see the user's other files and nothing goes to any third-party server.
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const FILE_NAME = 'expense-manager-sync.json';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

let configured = false;
function configure() {
  if (configured) return;
  GoogleSignin.configure({
    scopes: [DRIVE_SCOPE],
    // Optional: only needed if you later want an idToken for a backend.
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined,
  });
  configured = true;
}

export async function signIn(): Promise<string | null> {
  configure();
  await GoogleSignin.hasPlayServices();
  const res = await GoogleSignin.signIn();
  if (!isSuccessResponse(res)) return null;
  if (!res.data.scopes?.includes(DRIVE_SCOPE)) {
    await GoogleSignin.addScopes({ scopes: [DRIVE_SCOPE] });
  }
  return res.data.user.email;
}

export async function currentUserEmail(): Promise<string | null> {
  configure();
  if (!GoogleSignin.hasPreviousSignIn()) return null;
  const res = await GoogleSignin.signInSilently();
  return res.type === 'success' ? res.data.user.email : null;
}

export async function signOut() {
  configure();
  await GoogleSignin.signOut();
}

async function token(): Promise<string> {
  configure();
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

async function findFileId(): Promise<string | null> {
  const q = encodeURIComponent(`name = '${FILE_NAME}' and trashed = false`);
  const res = await driveFetch(`${API}/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)`);
  const json = (await res.json()) as { files: { id: string }[] };
  return json.files[0]?.id ?? null;
}

export async function downloadSnapshot<T>(): Promise<{ fileId: string | null; data: T | null }> {
  const fileId = await findFileId();
  if (!fileId) return { fileId: null, data: null };
  const res = await driveFetch(`${API}/files/${fileId}?alt=media`);
  return { fileId, data: (await res.json()) as T };
}

export async function uploadSnapshot(fileId: string | null, data: unknown) {
  const body = JSON.stringify(data);
  if (fileId) {
    await driveFetch(`${UPLOAD}/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    return;
  }
  const boundary = 'pem' + Date.now();
  const meta = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' });
  const multipart =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
  await driveFetch(`${UPLOAD}/files?uploadType=multipart`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: multipart,
  });
}
