import { router } from 'expo-router';

import { Card, Divider, Row, Screen, Text } from '@/components/ui';

/** Developer tools (dev builds only, More → Developer): one menu, so new testing tools get a row here. */
export default function DeveloperTools() {
  return (
    <Screen>
      <Card className="gap-0 py-1">
        <Row icon="sms" title="New-SMS card" subtitle="Fire the pop-up card or notification with a sample SMS" onPress={() => router.push('/settings/sms-card-test')} />
        <Divider />
        <Row icon="sms" title="SMS tester" subtitle="Paste or pick an SMS, see everything the import decides" onPress={() => router.push('/settings/sms-lab')} />
      </Card>
      <Text variant="caption">Only in development builds. Nothing here is shown in the released app.</Text>
    </Screen>
  );
}
