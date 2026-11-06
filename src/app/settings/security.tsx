import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { Chips, FormSection, Screen, SwitchRow, Text } from '@/components/ui';
import { authenticate, biometricSupport, LOCK_AFTER, useAppLock, type LockAfter } from '@/security/app-lock';

export default function SecuritySettings() {
  const lock = useAppLock();
  const [method, setMethod] = useState('fingerprint or face');
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    biometricSupport()
      .then((s) => {
        setMethod(s.name);
        setAvailable(s.available);
      })
      .catch(() => setAvailable(false));
  }, []);

  const toggle = async (on: boolean) => {
    if (!on) {
      // Turning the lock off needs the owner too, or anyone holding the phone could switch it off.
      const res = await authenticate('Turn off app lock');
      if (res.success) lock.setEnabled(false);
      return;
    }
    const s = await biometricSupport();
    if (!s.available) {
      return Alert.alert(
        s.hardware ? 'Set up a fingerprint or face first' : 'No fingerprint or face sensor',
        s.hardware
          ? 'Add a fingerprint or face (and a screen lock) in your phone settings, then turn this on.'
          : 'This phone can still use its PIN, pattern or password. Set a screen lock in phone settings.'
      );
    }
    const res = await authenticate('Turn on app lock');
    if (res.success) lock.setEnabled(true);
  };

  return (
    <Screen>
      <FormSection card>
        <SwitchRow
          title={`Lock with ${method}`}
          description="Pettagam asks for it when you open the app. Your phone PIN works as a backup."
          value={lock.enabled}
          onValueChange={toggle}
        />
      </FormSection>

      {lock.enabled ? (
        <FormSection card title="Lock after">
          <Chips<string>
            options={LOCK_AFTER.map((o) => ({ value: String(o.value), label: o.label }))}
            value={String(lock.lockAfter)}
            onChange={(v) => lock.setLockAfter(Number(v) as LockAfter)}
          />
          <Text variant="small">
            How long Pettagam can be in the background before it asks again. Opening the camera to scan a bill doesn’t count.
          </Text>
        </FormSection>
      ) : null}

      {!available ? (
        <Text variant="small" tone="danger">
          No fingerprint or face is set up on this phone. Add one in phone settings to use app lock.
        </Text>
      ) : null}

      <Text variant="caption" align="center">
        This setting is for this phone only. While Pettagam is in the background, its screen is hidden from the recent-apps view.
      </Text>
    </Screen>
  );
}
