import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { onDataChange } from '@/db/events';
import { refreshInvestments } from '@/db/investments';
import { refreshPrices } from '@/invest/prices';
import { syncReminders, useReminderPrefs } from '@/reminders/reminders';

// Reminders shown while the app is open still appear as a banner.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

const AFTER_EDIT_MS = 2_000;

/**
 * Work that follows the data without a screen: reschedules bill reminders on open, on return to
 * the app and shortly after any edit; brings investment values and prices up to date on open and
 * return; opens the right screen when a reminder is tapped.
 */
export function BackgroundTasks() {
  const db = useSQLiteContext();

  useEffect(() => {
    const run = () => syncReminders(db).catch(() => {});
    // On open and return only (not after edits, which revalue their own investment): interest
    // estimates move on by the day, fund NAVs and coin prices by the hour.
    const revalue = () =>
      refreshInvestments(db)
        .then(() => refreshPrices(db))
        .catch(() => {});
    let debounce: ReturnType<typeof setTimeout> | undefined;
    run();
    revalue();
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        run();
        revalue();
      }
    });
    const unsubscribe = onDataChange(() => {
      clearTimeout(debounce);
      debounce = setTimeout(run, AFTER_EDIT_MS);
    });
    const unsubPrefs = useReminderPrefs.subscribe(() => syncReminders(db).catch(() => {}));
    return () => {
      appState.remove();
      unsubscribe();
      unsubPrefs();
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
