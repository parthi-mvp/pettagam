import { create } from 'zustand';

/**
 * Whether the user has gone past the welcome screens in this signed-out session. In memory only:
 * every launch while signed out, and every sign-out, starts at the welcome screens again
 * (Routes resets it on sign-in). Signed-in users never see them.
 */
export const useWelcomeSeen = create<{ seen: boolean; markSeen: () => void }>((set) => ({
  seen: false,
  markSeen: () => set({ seen: true }),
}));
