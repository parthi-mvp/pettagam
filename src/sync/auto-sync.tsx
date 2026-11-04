import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';

import { useAuth } from '@/auth/session';
import { onDataChange } from '@/db/events';

import { refreshPending, syncNow } from './neon-sync';

const AFTER_EDIT_MS = 3_000;
const WHILE_OPEN_MS = 5 * 60_000;

/**
 * Keeps the cache and Neon in step while signed in:
 * on open, on return to foreground, on leaving the app, a few seconds after any edit,
 * every 5 minutes while open, and as soon as the internet comes back.
 * Offline failures are quiet; the outbox keeps the edits.
 */
export function AutoSync() {
  const db = useSQLiteContext();
  const { status } = useAuth();

  useEffect(() => {
    if (status !== 'signedIn') return;
    const run = () => syncNow(db).catch(() => {});
    let debounce: ReturnType<typeof setTimeout> | undefined;

    refreshPending(db);
    run();
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active' || s === 'background') run();
    });
    const unsubscribe = onDataChange((table) => {
      if (table === '*') return; // '*' is emitted by sync itself
      refreshPending(db);
      clearTimeout(debounce);
      debounce = setTimeout(run, AFTER_EDIT_MS);
    });
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') run();
    }, WHILE_OPEN_MS);
    // Back online → upload what was queued while offline.
    let wasOnline: boolean | null = null;
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      const online = !!state.isConnected && state.isInternetReachable !== false;
      if (online && wasOnline === false) run();
      wasOnline = online;
    });

    return () => {
      appState.remove();
      unsubscribe();
      clearTimeout(debounce);
      clearInterval(interval);
      unsubscribeNet();
    };
  }, [db, status]);

  return null;
}
