import Storage from 'expo-sqlite/kv-store';
import { create } from 'zustand';

const KEY = 'welcome_done';

/** Whether this phone has been through the welcome screens. Once per install; read before the first frame. */
export const useWelcomeSeen = create<{ seen: boolean; restore: boolean; markSeen: (restore?: boolean) => void }>((set) => ({
  seen: Storage.getItemSync(KEY) === '1',
  /** "Restore from Google Drive" was tapped: Home opens Backup once the app has mounted. */
  restore: false,
  markSeen: (restore = false) => {
    Storage.setItemSync(KEY, '1');
    set({ seen: true, restore });
  },
}));
