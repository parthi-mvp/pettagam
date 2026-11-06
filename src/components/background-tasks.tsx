import { updateWidget } from '@modules/sms-reader';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { onDataChange } from '@/db/events';
import { money, monthRange } from '@/lib/format';
import { syncReminders, useReminderPrefs } from '@/reminders/reminders';
import { useAppLock } from '@/security/app-lock';

// Reminders shown while the app is open still appear as a banner.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

const AFTER_EDIT_MS = 2_000;

/** The home-screen widget's figures. With app lock on, the widget shows no amounts. */
async function refreshWidget(db: SQLiteDatabase) {
  const scheme = String(Constants.expoConfig?.scheme ?? 'pettagam');
  if (useAppLock.getState().enabled) return updateWidget('Pettagam', 'Locked', 'App lock is on', scheme);
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const { start, end } = monthRange(0, now);
  const r = await db.getFirstAsync<{ today: number; month: number }>(
    `SELECT COALESCE(SUM(CASE WHEN date >= ? THEN amount END), 0) AS today, COALESCE(SUM(amount), 0) AS month
     FROM transactions WHERE deleted = 0 AND type = 'expense' AND date >= ? AND date < ?`,
    [dayStart, start, end]
  );
  const monthName = now.toLocaleDateString('en-IN', { month: 'long' });
  updateWidget('Spent today', money(r?.today ?? 0), `${money(r?.month ?? 0)} in ${monthName}`, scheme);
}

/**
 * Work that follows the data without a screen: reschedules bill reminders and redraws the widget
 * on open, on return to the app and shortly after any edit; opens the right screen when a reminder is tapped.
 */
export function BackgroundTasks() {
  const db = useSQLiteContext();

  useEffect(() => {
    const run = () => {
      syncReminders(db).catch(() => {});
      refreshWidget(db).catch(() => {});
    };
    let debounce: ReturnType<typeof setTimeout> | undefined;
    run();
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') run();
    });
    const unsubscribe = onDataChange(() => {
      clearTimeout(debounce);
      debounce = setTimeout(run, AFTER_EDIT_MS);
    });
    const unsubPrefs = useReminderPrefs.subscribe(() => syncReminders(db).catch(() => {}));
    const unsubLock = useAppLock.subscribe((s, prev) => {
      if (s.enabled !== prev.enabled) refreshWidget(db).catch(() => {});
    });
    return () => {
      appState.remove();
      unsubscribe();
      unsubPrefs();
      unsubLock();
      clearTimeout(debounce);
    };
  }, [db]);

  useEffect(() => {
    const open = (r: Notifications.NotificationResponse | null) => {
      const url = r?.notification.request.content.data?.url;
      if (typeof url !== 'string') return;
      Notifications.clearLastNotificationResponse(); // handled: a later launch shouldn't open it again
      router.push(url as Href);
    };
    open(Notifications.getLastNotificationResponse());
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);

  return null;
}
