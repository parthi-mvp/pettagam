import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { bindCacheToUser, syncNow, wipeLocalData } from '@/sync/neon-sync';

import * as NeonAuth from './neon-auth';

type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'signedOut'; user: null }
  | { status: 'signedIn'; user: NeonAuth.AuthUser };

type AuthContextValue = AuthState & {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  useEffect(() => {
    let alive = true;
    (async () => {
      // Offline-friendly: trust the stored session to open the app, then verify in the background.
      const cached = await NeonAuth.cachedUser();
      if (!alive) return;
      setState(cached ? { status: 'signedIn', user: cached } : { status: 'signedOut', user: null });
      if (!cached) return;
      try {
        const fresh = await NeonAuth.refreshSession();
        if (alive && !fresh) setState({ status: 'signedOut', user: null }); // server says the session ended
      } catch {
        // No network: stay signed in with the cached user; sync retries later.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const afterSignIn = useCallback(
    async (user: NeonAuth.AuthUser) => {
      await bindCacheToUser(db, user.id);
      setState({ status: 'signedIn', user });
      syncNow(db).catch(() => {});
    },
    [db]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      signIn: async (email, password) => afterSignIn(await NeonAuth.signInWithEmail(email, password)),
      signUp: async (email, password, name) => afterSignIn(await NeonAuth.signUpWithEmail(email, password, name)),
      signOut: async () => {
        // Finish any running sync (and upload what's queued) before wiping: a download landing after
        // the wipe would leave this user's rows for the next account to upload. Once the session is
        // gone, a new sync fails before it writes anything.
        await syncNow(db).catch(() => {});
        await NeonAuth.signOut();
        await wipeLocalData(db);
        setState({ status: 'signedOut', user: null });
      },
    }),
    [state, afterSignIn, db]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
