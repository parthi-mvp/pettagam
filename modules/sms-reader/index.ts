import { requireOptionalNativeModule } from 'expo-modules-core';
import { PermissionsAndroid, Platform } from 'react-native';

export type InboxSms = { id: string; address: string; body: string; date: number };

type NativeSmsReader = {
  hasPermission(): boolean;
  setPopupEnabled(on: boolean): void;
  isPopupEnabled(): boolean;
  canDrawOverlays(): boolean;
  openOverlaySettings(): void;
  closeQuickAdd(): void;
  testPopup(address: string, body: string, delayMs: number, notificationOnly: boolean): void;
  readInbox(sinceMs: number, limit: number, untilMs?: number | null): Promise<InboxSms[]>;
};

// Null on iOS, web and Expo Go — SMS reading needs an Android development build.
const Native = requireOptionalNativeModule<NativeSmsReader>('SmsReader');

export const isSmsReadingAvailable = Platform.OS === 'android' && Native != null;

export async function requestSmsPermission(): Promise<boolean> {
  if (!isSmsReadingAvailable) return false;
  const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS, {
    title: 'Read bank SMS',
    message:
      'Allow reading SMS to auto-create entries from bank and card alerts. Messages are parsed on this device only.',
    buttonPositive: 'Allow',
  });
  return res === PermissionsAndroid.RESULTS.GRANTED;
}

/** Inbox messages received after `sinceMs` and up to `untilMs` (default: now), newest first. */
export async function readInbox(sinceMs: number, limit = 500, untilMs: number | null = null): Promise<InboxSms[]> {
  if (!Native) throw new Error('SMS reading is only available in the Android build.');
  return Native.readInbox(sinceMs, limit, untilMs);
}

// ---- "Pop up new bank SMS": a quick-add card over other apps when a bank alert arrives ----

/** Turns the background SMS listener on or off (it runs even when the app is closed). */
export const setSmsPopupEnabled = (on: boolean) => Native?.setPopupEnabled(on);
export const isSmsPopupEnabled = () => Native?.isPopupEnabled() ?? false;
/** "Display over other apps": without it, alerts arrive as a notification you tap to open the card. */
export const canDrawOverlays = () => Native?.canDrawOverlays() ?? false;
export const openOverlaySettings = () => Native?.openOverlaySettings();
/** Close the quick-add card and return to whatever app was open. */
export const closeQuickAdd = () => Native?.closeQuickAdd();

/** Live alerts need RECEIVE_SMS (and READ_SMS, to match the inbox copy); notifications need POST_NOTIFICATIONS on Android 13+. */
export async function requestSmsPopupPermissions(): Promise<boolean> {
  if (!isSmsReadingAvailable) return false;
  const P = PermissionsAndroid.PERMISSIONS;
  const wanted = [P.RECEIVE_SMS, P.READ_SMS, ...(Number(Platform.Version) >= 33 ? [P.POST_NOTIFICATIONS] : [])];
  const res = await PermissionsAndroid.requestMultiple(wanted);
  return res[P.RECEIVE_SMS] === PermissionsAndroid.RESULTS.GRANTED;
}

/** Developer: show the card (or only the notification) for a made-up SMS after `delayMs`. */
export const testSmsPopup = (address: string, body: string, delayMs: number, notificationOnly: boolean) =>
  Native?.testPopup(address, body, delayMs, notificationOnly);
