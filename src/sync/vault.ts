// Password encryption for backups (unit-tested in Node, see tests/vault.test.ts).
//
// AES-256-GCM: authenticated, so a wrong password or a changed file is detected, never misread.
// The key comes from the password through scrypt, which is slow on purpose: every guess costs the
// same work. Randomness is passed in (expo-crypto in the app), so this file runs anywhere.
import { gcm } from '@noble/ciphers/aes.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';

export type RandomBytes = (n: number) => Uint8Array;

/** scrypt cost: 16 MB and about a second on a phone. Stored with each file, so it can rise later. */
export const KDF = { N: 2 ** 14, r: 8, p: 1 };

/** A password-protected backup file (the restore screen recognises it by `app`). */
export type Sealed = { app: 'pettagam-backup'; v: 1; kdf: { name: 'scrypt'; N: number; r: number; p: number; salt: string }; iv: string; data: string };
/** Data encrypted with an already-derived key (Drive files, once the sync password is entered). */
export type KeySealed = { enc: 'aes-256-gcm'; iv: string; data: string };

export class WrongPasswordError extends Error {
  constructor() {
    super('Wrong password, or the file is damaged');
  }
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** A 256-bit key from a password and salt. */
export const deriveKey = (password: string, salt: Uint8Array, kdf = KDF) => scryptAsync(enc.encode(password.normalize('NFKC')), salt, { ...kdf, dkLen: 32 });

/** Encrypt text with a key: fresh random IV each time. */
export function sealWithKey(text: string, key: Uint8Array, random: RandomBytes): KeySealed {
  const iv = random(12);
  return { enc: 'aes-256-gcm', iv: toBase64(iv), data: toBase64(gcm(key, iv).encrypt(enc.encode(text))) };
}

export function openWithKey(box: KeySealed, key: Uint8Array): string {
  try {
    return dec.decode(gcm(key, fromBase64(box.iv)).decrypt(fromBase64(box.data)));
  } catch {
    throw new WrongPasswordError();
  }
}

/** Encrypt text with a password: its own salt and key. */
export async function seal(text: string, password: string, random: RandomBytes): Promise<Sealed> {
  const salt = random(16);
  const box = sealWithKey(text, await deriveKey(password, salt), random);
  return { app: 'pettagam-backup', v: 1, kdf: { name: 'scrypt', ...KDF, salt: toBase64(salt) }, iv: box.iv, data: box.data };
}

export async function open(file: Sealed, password: string): Promise<string> {
  const { N, r, p, salt } = file.kdf;
  return openWithKey({ enc: 'aes-256-gcm', iv: file.iv, data: file.data }, await deriveKey(password, fromBase64(salt), { N, r, p }));
}

export const isSealed = (x: unknown): x is Sealed => !!x && typeof x === 'object' && (x as Sealed).app === 'pettagam-backup' && (x as Sealed).v === 1;
export const isKeySealed = (x: unknown): x is KeySealed => !!x && typeof x === 'object' && (x as KeySealed).enc === 'aes-256-gcm';
