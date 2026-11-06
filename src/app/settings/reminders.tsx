import { router, type Href } from 'expo-router';
import { Alert, Linking, View } from 'react-native';

import { Card, Chips, Divider, FormSection, Row, Screen, SwitchRow, Text } from '@/components/ui';
import { useLiveQuery } from '@/db/events';
import { dateLabel, money } from '@/lib/format';
import { allowNotifications, useReminderPrefs } from '@/reminders/reminders';
import { collectDues } from '@/reminders/sources';

const LEAD = [
  { value: '0', label: 'On the day' },
  { value: '1', label: '1 day before' },
  { value: '2', label: '2 days before' },
  { value: '3', label: '3 days before' },
];
const HOURS = [
  { value: '8', label: '8 AM' },
  { value: '9', label: '9 AM' },
  { value: '13', label: '1 PM' },
  { value: '19', label: '7 PM' },
];

export default function ReminderSettings() {
  const prefs = useReminderPrefs();
  const { data: dues } = useLiveQuery((d) => collectDues(d), ['accounts', 'transactions', 'investments', 'investment_entries']);
  const upcoming = (dues ?? []).filter((d) => prefs.bills || d.verb === 'due').sort((a, b) => a.date - b.date).slice(0, 12);

  const toggle = async (on: boolean) => {
    if (on && !(await allowNotifications())) {
      return Alert.alert('Notifications are off for Pettagam', 'Allow notifications in your phone settings to get bill reminders.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open settings', onPress: () => Linking.openSettings() },
      ]);
    }
    prefs.set({ enabled: on });
  };

  return (
    <Screen>
      <FormSection card>
        <SwitchRow
          title="Remind me before bills are due"
          description="Card bills, loan EMIs and chit installments, as a notification on this phone. Works offline."
          value={prefs.enabled}
          onValueChange={toggle}
        />
      </FormSection>

      {prefs.enabled ? (
        <>
          <FormSection card title="When">
            <Chips options={LEAD} value={String(prefs.daysBefore)} onChange={(v) => prefs.set({ daysBefore: Number(v) })} />
            <Chips options={HOURS} value={String(prefs.hour)} onChange={(v) => prefs.set({ hour: Number(v) })} />
            <Text variant="small">Bills that must be paid also get a reminder on the day itself.</Text>
          </FormSection>
          <FormSection card>
            <SwitchRow
              title="Subscriptions and regular bills too"
              description="Netflix, rent, phone recharges: payments Pettagam spotted repeating. A heads-up only."
              value={prefs.bills}
              onValueChange={(bills) => prefs.set({ bills })}
            />
          </FormSection>
        </>
      ) : null}

      <View className="gap-1.5 pt-3">
        <Text variant="label">Coming up</Text>
        {upcoming.length ? (
          <Card className="gap-0 py-1">
            {upcoming.map((d, i) => (
              <View key={d.key}>
                {i > 0 ? <Divider /> : null}
                <Row
                  icon={d.verb === 'due' ? 'calendar' : 'repeat'}
                  title={d.label}
                  subtitle={`${d.verb === 'due' ? 'Due' : 'Expected'} ${dateLabel(d.date)}`}
                  right={d.amount ? money(d.amount) : undefined}
                  onPress={() => router.push(d.url as Href)}
                />
              </View>
            ))}
          </Card>
        ) : (
          <Card>
            <Text variant="small">
              Nothing with a due date yet. Add the payment due day to a credit card, or the EMI day to a loan, in Accounts.
            </Text>
          </Card>
        )}
      </View>
    </Screen>
  );
}
