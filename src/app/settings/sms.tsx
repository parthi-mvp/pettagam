import {
  canDrawOverlays,
  isSmsPopupEnabled,
  isSmsReadingAvailable,
  openOverlaySettings,
  requestSmsPopupPermissions,
  setSmsPopupEnabled,
} from '@modules/sms-reader';
import { useEffect, useState } from 'react';
import { Alert, AppState, Linking, View } from 'react-native';

import { Icon } from '@/components/icons';
import { Button, Card, FormSection, Screen, SwitchRow, Text } from '@/components/ui';
import { useThemeColors } from '@/theme/useThemeColor';

export default function SmsAlertsSettings() {
  const [on, setOn] = useState(isSmsPopupEnabled);
  const [overlay, setOverlay] = useState(canDrawOverlays);
  const [success, warning, brass] = useThemeColors(['success', 'warning-fg', 'brass-fg'] as const);

  // Coming back from Android settings: pick up the permission the user just granted.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && setOverlay(canDrawOverlays()));
    return () => sub.remove();
  }, []);

  const toggle = async (next: boolean) => {
    if (next && !(await requestSmsPopupPermissions())) {
      Alert.alert('SMS permission needed', 'Allow “SMS” for Pettagam in system settings to get new bank alerts.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open settings', onPress: () => Linking.openSettings() },
      ]);
      return;
    }
    setSmsPopupEnabled(next);
    setOn(next);
  };

  if (!isSmsReadingAvailable) {
    return (
      <Screen>
        <Card>
          <Text variant="muted">Live bank SMS alerts work only on Android. iPhones don’t let apps read SMS.</Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <FormSection title="New bank SMS">
        <SwitchRow
          title="Pop up new bank SMS"
          description="When a bank, card or UPI alert arrives, a card opens over the app you’re in with the amount, account and category filled in. Save in one tap."
          value={on}
          onValueChange={toggle}
        />
      </FormSection>

      {on ? (
        <FormSection title="Show over other apps">
          <View className="flex-row items-center gap-2.5">
            <Icon name={overlay ? 'check' : 'bulb'} size={18} color={overlay ? success : warning} strokeWidth={2.4} />
            <Text weight="medium" className="flex-1">{overlay ? 'Allowed' : 'Not allowed yet'}</Text>
          </View>
          <Text variant="small">
            {overlay
              ? 'The card opens over whatever app you’re using. When the phone is locked you get a notification instead.'
              : 'Without “Display over other apps”, new alerts arrive as a notification; tap it to open the card.'}
          </Text>
          {overlay ? null : <Button title="Allow display over other apps" onPress={() => openOverlaySettings()} />}
        </FormSection>
      ) : null}

      {on ? (
        <Card variant="brass" className="gap-2">
          <View className="flex-row items-center gap-2">
            <Icon name="bulb" size={16} color={brass} />
            <Text weight="semibold">Oppo, OnePlus, Realme, Xiaomi, Vivo</Text>
          </View>
          <Text variant="small" tone="default">
            These phones stop closed apps from waking up. In Settings → Apps → Pettagam, turn on Auto-launch (or Allow background activity),
            or new alerts may not pop up.
          </Text>
          <Button size="sm" variant="secondary" title="Open app settings" onPress={() => Linking.openSettings()} className="self-start" />
        </Card>
      ) : null}

      <Text variant="caption" className="px-1">
        Messages are read on this phone and only bank alerts open the card; OTPs, offers and chats are ignored. Nothing is saved until you tap
        Save. Uses almost no battery: the app wakes only when an SMS arrives.
      </Text>
    </Screen>
  );
}
