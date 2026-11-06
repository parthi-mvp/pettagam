import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

import { deviceId } from '@/db/clock';
import { emitChange } from '@/db/events';
import { setSetting } from '@/db/repo';

import { requestSnapshot } from './drive-sync';
import { buildSnapshot, isSnapshot, mergeIn, type Snapshot } from './snapshot';
import { isSealed, open, seal, type Sealed } from './vault';

/**
 * Backup to a file, for people without Google Drive (or who want their own copy): the whole database,
 * encrypted with a password, handed to the share sheet (Files, a chat with yourself, email, USB…).
 * Restoring merges it in field by field, so it never overwrites newer edits and is safe to repeat.
 */

const random = (n: number) => Crypto.getRandomBytes(n);

export class NotABackupError extends Error {
  constructor() {
    super('This isn’t a Pettagam backup file');
  }
}

/** Encrypt everything with `password` and open the share sheet with the file. */
export async function saveBackupFile(db: SQLiteDatabase, password: string) {
  const snapshot = await buildSnapshot(db, await deviceId(db));
  const sealed = await seal(JSON.stringify(snapshot), password, random);
  const day = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.cache, `pettagam-backup-${day}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(sealed));
  try {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save your Pettagam backup' });
    await setSetting(db, 'file_backup_at', String(Date.now()));
  } finally {
    // The share target has its copy; an encrypted file still shouldn't linger in the cache.
    if (file.exists) file.delete();
  }
}

/** Let the user pick a backup file. Null if they cancel; NotABackupError for any other file. */
export async function pickBackupFile(): Promise<Sealed | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'application/octet-stream', 'text/plain', '*/*'], copyToCacheDirectory: true });
  if (res.canceled) return null;
  const file = new File(res.assets[0].uri);
  try {
    const parsed: unknown = JSON.parse(await file.text());
    if (!isSealed(parsed)) throw new NotABackupError();
    return parsed;
  } catch (e) {
    throw e instanceof NotABackupError ? e : new NotABackupError();
  } finally {
    if (file.exists) file.delete();
  }
}

/** Decrypt a picked file (WrongPasswordError if the password is wrong). */
export async function unlockBackupFile(file: Sealed, password: string): Promise<Snapshot> {
  const snapshot: unknown = JSON.parse(await open(file, password));
  if (!isSnapshot(snapshot)) throw new NotABackupError();
  return snapshot;
}

/** Merge a backup in. Returns how many rows changed here. */
export async function restoreBackup(db: SQLiteDatabase, snapshot: Snapshot) {
  const changed = await mergeIn(db, snapshot);
  if (changed) {
    emitChange('*');
    // With Drive on, other phones should get the restored rows too: their clocks aren't this phone's,
    // so only a snapshot carries them.
    await requestSnapshot(db);
  }
  return changed;
}
