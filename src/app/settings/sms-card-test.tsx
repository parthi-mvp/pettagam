import { canDrawOverlays, openOverlaySettings, requestSmsPopupPermissions, testSmsPopup } from '@modules/sms-reader';
import { useEffect, useState } from 'react';
import { AppState, View } from 'react-native';

import { Button, Chips, Field, FormSection, Screen, Text } from '@/components/ui';
import { useLiveQuery } from '@/db/events';
import { listAccounts } from '@/db/repo';
import { haptic } from '@/lib/haptics';

type Sample = 'upi' | 'card' | 'salary' | 'atm';
type Delay = '0' | '5' | '10' | '30';

const SAMPLES: { value: Sample; label: string }[] = [
  { value: 'upi', label: 'UPI debit' },
  { value: 'card', label: 'Card spend' },
  { value: 'salary', label: 'Salary credit' },
  { value: 'atm', label: 'ATM cash' },
];
const DELAYS: { value: Delay; label: string }[] = [
  { value: '0', label: 'Now' },
  { value: '5', label: '5 s' },
  { value: '10', label: '10 s' },
  { value: '30', label: '30 s' },
];

/** Bank-style alerts the parser reads, using your own account digits so the account matches. */
function sampleSms(kind: Sample, acct: string, card: string) {
  const day = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
  switch (kind) {
    case 'upi':
      return `Rs.249.00 debited from A/c XX${acct} on ${day} to VPA swiggy@icici. UPI Ref 431298765412. Not you? Call 18002586161 - HDFC Bank`;
    case 'card':
      return `Rs.1,840.00 spent on your Credit Card XX${card} at AMAZON on ${day}. Avl limit Rs.84,160.00. Not you? Call 18002662 - ICICI Bank`;
    case 'salary':
      return `Your A/c XX${acct} is credited with INR 65,000.00 on ${day} by NEFT from ACME TECHNOLOGIES PVT LTD (SALARY). Avl Bal INR 1,12,450.00 - SBI`;
    case 'atm':
      return `Rs.2,000.00 withdrawn at ATM from A/c XX${acct} on ${day} at MG ROAD CHENNAI. Avl Bal Rs.45,210.00 - Axis Bank`;
  }
}

/** Developer tools → New-SMS card (dev builds only): fire the new-SMS card and notification without a real SMS. */
export default function SmsCardTest() {
  const { data: accounts } = useLiveQuery(listAccounts, ['accounts']);
  const acct = accounts?.find((a) => a.last4)?.last4 ?? '1234';
  const card = accounts?.find((a) => a.type === 'credit_card' && a.last4)?.last4 ?? acct;

  const [kind, setKind] = useState<Sample>('upi');
  const [body, setBody] = useState('');
  const [delay, setDelay] = useState<Delay>('10');
  const [left, setLeft] = useState(0);
  const [overlay, setOverlay] = useState(canDrawOverlays);

  const text = body || sampleSms(kind, acct, card);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && setOverlay(canDrawOverlays()));
    return () => sub.remove();
  }, []);

  // Countdown shown while a test is pending.
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  const fire = async (notificationOnly: boolean) => {
    await requestSmsPopupPermissions(); // notifications on Android 13+; READ_SMS for the inbox check
    haptic.light();
    testSmsPopup('AD-HDFCBK', text, Number(delay) * 1000, notificationOnly);
    setLeft(Number(delay));
  };

  return (
    <Screen>
      <FormSection title="Test the new-SMS card">
        <Chips
          label="Sample message"
          options={SAMPLES}
          value={body ? null : kind}
          onChange={(v) => {
            setKind(v);
            setBody('');
          }}
        />
        <Field label="Message (edit to try your own)" value={text} onChangeText={setBody} multiline />
        <Chips label="Show after" options={DELAYS} value={delay} onChange={setDelay} />

        {left > 0 ? (
          <View className="items-center rounded-input bg-brass-soft py-3">
            <Text weight="semibold" tone="brass" tabular className="text-2xl">{left}s</Text>
            <Text variant="small" tone="default">Switch to another app now</Text>
          </View>
        ) : null}

        <Button title="Show card" icon="sms" disabled={left > 0} onPress={() => fire(false)} />
        <Button variant="secondary" title="Show notification only" disabled={left > 0} onPress={() => fire(true)} />

        {overlay ? null : (
          <View className="gap-2">
            <Text variant="small" tone="warning">
              “Display over other apps” is off, so “Show card” falls back to a notification.
            </Text>
            <Button size="sm" variant="tinted" title="Allow display over other apps" onPress={() => openOverlaySettings()} className="self-start" />
          </View>
        )}

        <Text variant="caption">
          Uses your real account digits (••{acct}) so the account matches. Saving from the card adds a real transaction; delete it from Activity
          afterwards. Works even with the pop-up switch off. A locked phone always gets the notification.
        </Text>
      </FormSection>
    </Screen>
  );
}
