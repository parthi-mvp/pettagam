// The relock decision, kept import-free so tests/lock-rule.test.ts can run it in Node.

/** Lock again on return if the lock is on and the app was away at least `lockAfterSec`. */
export function shouldLock(enabled: boolean, lockAfterSec: number, backgroundedAt: number | null, now: number): boolean {
  return enabled && backgroundedAt !== null && now - backgroundedAt >= lockAfterSec * 1000;
}
