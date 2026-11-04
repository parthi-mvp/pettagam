import * as Haptics from 'expo-haptics';
import Storage from 'expo-sqlite/kv-store';
import { create } from 'zustand';

const KEY = 'haptics.enabled';

/** Settings → Haptic feedback. On by default; persisted on the device. */
export const useHapticsPreference = create<{ enabled: boolean; setEnabled: (enabled: boolean) => void }>((set) => ({
  enabled: (() => {
    try {
      return Storage.getItemSync(KEY) !== '0';
    } catch {
      return true;
    }
  })(),
  setEnabled: (enabled) => {
    set({ enabled });
    Storage.setItem(KEY, enabled ? '1' : '0').catch(() => {});
  },
}));

const fire = (run: () => Promise<void>) => {
  if (useHapticsPreference.getState().enabled) void run().catch(() => {});
};

/**
 * Haptics with intent — for moments that matter, not every tap:
 * `selection` a value changed · `light` a primary action · `success` something saved/synced ·
 * `warning` a destructive confirm is coming · `error` an action failed.
 */
export const haptic = {
  selection: () => fire(() => Haptics.selectionAsync()),
  light: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  success: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};

export type HapticKind = keyof typeof haptic;
