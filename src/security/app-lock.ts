import * as LocalAuthentication from 'expo-local-authentication';
import Storage from 'expo-sqlite/kv-store';
import { create } from 'zustand';

import { shouldLock } from './lock-rule';

/** "Lock after": seconds the app may sit in the background before it asks again. */
export const LOCK_AFTER = [
  { value: 0, label: 'Immediately' },
  { value: 60, label: '1 min' },
  { value: 300, label: '5 min' },
  { value: 900, label: '15 min' },
  { value: 3600, label: '1 hour' },
] as const;
export type LockAfter = (typeof LOCK_AFTER)[number]['value'];

const KEY = 'security.app_lock';

interface AppLockState {
  enabled: boolean;
  lockAfter: LockAfter;
  /** Showing the lock screen now. */
  locked: boolean;
  setEnabled: (enabled: boolean) => void;
  setLockAfter: (s: LockAfter) => void;
  unlock: () => void;
}

/** Per-phone setting (not synced): each device decides its own lock. */
export const useAppLock = create<AppLockState>((set, get) => {
  const persist = () => Storage.setItem(KEY, JSON.stringify({ enabled: get().enabled, lockAfter: get().lockAfter })).catch(() => {});
  return {
    enabled: false,
    lockAfter: 0,
    locked: false,
    setEnabled: (enabled) => {
      set({ enabled });
      persist();
    },
    setLockAfter: (lockAfter) => {
      set({ lockAfter });
      persist();
    },
    unlock: () => set({ locked: false }),
  };
});

/** At start-up, before the first frame: a phone with the lock on opens locked. */
export function restoreAppLock() {
  try {
    const saved = JSON.parse(Storage.getItemSync(KEY) ?? 'null') as { enabled?: boolean; lockAfter?: number } | null;
    if (!saved) return;
    const lockAfter = (LOCK_AFTER.find((o) => o.value === saved.lockAfter)?.value ?? 0) as LockAfter;
    useAppLock.setState({ enabled: !!saved.enabled, lockAfter, locked: !!saved.enabled });
  } catch {
    // unreadable setting: leave the lock off rather than locking the user out
  }
}

// Background bookkeeping, kept outside React (AppState events fire while the UI is hidden).
let backgroundedAt: number | null = null;
let paused = false;

/**
 * Wrap the camera / photo picker (and its permission dialog) in pause…resume: the app goes to
 * the background for those, and coming back shouldn't ask for a fingerprint. A window, not a
 * one-shot flag, so a denied permission can't leave it armed for a later, real trip away.
 */
export function pauseAppLock() {
  paused = true;
}
export function resumeAppLock() {
  paused = false;
  backgroundedAt = null;
}

export function noteBackground() {
  if (paused) return;
  backgroundedAt = Date.now();
}

export function noteForeground() {
  const { enabled, lockAfter } = useAppLock.getState();
  const since = backgroundedAt;
  backgroundedAt = null;
  if (!paused && shouldLock(enabled, lockAfter, since, Date.now())) useAppLock.setState({ locked: true });
}

/** What the phone can do: whether a lock can be turned on, and what to call it. */
export async function biometricSupport() {
  const [hardware, enrolled, types] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);
  const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  const finger = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
  const name = face && !finger ? 'face unlock' : finger && !face ? 'fingerprint' : 'fingerprint or face';
  return { available: hardware && enrolled, hardware, enrolled, name };
}

/** Ask for the fingerprint / face (falls back to the phone's PIN or pattern). */
export async function authenticate(promptMessage: string) {
  const res = await LocalAuthentication.authenticateAsync({
    promptMessage,
    promptSubtitle: 'Pettagam',
    cancelLabel: 'Cancel',
    disableDeviceFallback: false,
  });
  return res;
}
