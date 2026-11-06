import type { SQLiteDatabase } from 'expo-sqlite';
import Storage from 'expo-sqlite/kv-store';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { planReminders, type ReminderPrefs } from './plan';
import { collectDues } from './sources';

const KEY = 'reminders.prefs';
const CHANNEL = 'reminders';
const DEFAULTS: ReminderPrefs = { enabled: false, daysBefore: 2, hour: 9, bills: true };

/** Per-phone setting (not synced): each phone decides whether it nags. */
export const useReminderPrefs = create<ReminderPrefs & { set: (p: Partial<ReminderPrefs>) => void }>((set, get) => ({
  ...DEFAULTS,
  ...(() => {
    try {
      return JSON.parse(Storage.getItemSync(KEY) ?? '{}') as Partial<ReminderPrefs>;
    } catch {
      return {};
    }
  })(),
  set: (p) => {
    set(p);
    const { enabled, daysBefore, hour, bills } = get();
    Storage.setItemSync(KEY, JSON.stringify({ enabled, daysBefore, hour, bills }));
  },
}));

/** Asks for notification permission (Android 13+, iOS). True when reminders can be shown. */
export async function allowNotifications(): Promise<boolean> {
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  if (!cur.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

let running: Promise<number> | null = null;

/**
 * Rebuilds every scheduled reminder from the current data: cancel all, schedule the plan. Cheap
 * (a few dozen at most) and always right, so it simply runs after any change. Returns how many.
 */
export function syncReminders(db: SQLiteDatabase): Promise<number> {
  const go = async () => {
    const prefs = useReminderPrefs.getState();
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!prefs.enabled || !(await Notifications.getPermissionsAsync()).granted) return 0;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Bill reminders', importance: AndroidImportance.DEFAULT });
    }
    const plan = planReminders(await collectDues(db), prefs);
    for (const p of plan) {
      await Notifications.scheduleNotificationAsync({
        identifier: p.id,
        content: { title: p.title, body: p.body, data: { url: p.url } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.at, channelId: CHANNEL },
      });
    }
    return plan.length;
  };
  // One at a time; a change during a run queues one more run after it.
  running = (running ?? Promise.resolve(0)).catch(() => 0).then(go);
  return running;
}
