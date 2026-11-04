import { isSmsPopupEnabled, isSmsReadingAvailable } from '@modules/sms-reader';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, View } from 'react-native';

import { aiReady, useAi } from '@/ai/client';
import { useAuth } from '@/auth/session';
import { Button, Card, Divider, GroupLabel, Header, Row, Screen, Text } from '@/components/ui';
import { getSyncStatus, onSyncStatus, refreshPending, type SyncStatus } from '@/sync/neon-sync';
import { paletteById } from '@/theme/palettes';
import { LOCK_AFTER, useAppLock } from '@/security/app-lock';
import { useThemePreference } from '@/theme/themePreference';

const MODE_LABEL = { system: 'Same as phone', light: 'Light', dark: 'Dark' } as const;
const SYNC_LABEL: Record<SyncStatus['state'], string> = { idle: 'Up to date', syncing: 'Syncing…', offline: 'Offline', error: 'Sync problem' };

/** A captioned group of rows, iOS-settings style: small label above one card. */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-1.5">
      <GroupLabel>{title}</GroupLabel>
      <Card className="gap-0 py-1">{children}</Card>
    </View>
  );
}

export default function More() {
  const db = useSQLiteContext();
  const auth = useAuth();
  const theme = useThemePreference();
  const lock = useAppLock();
  const aiOn = useAi(aiReady);
  const [sync, setSync] = useState<SyncStatus>(getSyncStatus());

  useEffect(() => {
    refreshPending(db);
    return onSyncStatus(setSync);
  }, [db]);

  const signOut = () => {
    const warn =
      sync.pending > 0
        ? `${sync.pending} change(s) haven’t uploaded yet and will be lost. Connect to the internet and sync first.`
        : 'Your data stays safe in your account. This phone’s copy is removed.';
    Alert.alert('Sign out?', warn, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => auth.signOut() },
    ]);
  };

  const name = auth.user?.name?.trim() || auth.user?.email?.split('@')[0] || 'You';

  return (
    <Screen tab>
      <Header title="More" />

      {/* Who's signed in */}
      <Card className="flex-row items-center gap-3">
        <View className="h-12 w-12 items-center justify-center rounded-full bg-primary">
          <Text variant="heading" tone="onPrimary" className="text-3xl">
            {name[0]?.toUpperCase()}
          </Text>
        </View>
        <View className="min-w-0 flex-1">
          <Text variant="heading" numberOfLines={1}>
            {name}
          </Text>
          <Text variant="small" numberOfLines={1}>
            {auth.user?.email}
          </Text>
        </View>
      </Card>

      <Group title="Money">
        <Row icon="card" title="Accounts" subtitle="Banks, cards, loans and chits" onPress={() => router.push('/accounts')} />
        <Divider />
        <Row icon="pie" title="Reports" subtitle="Spending by category and month" onPress={() => router.push('/reports')} />
        <Divider />
        <Row icon="trend" title="Budgets" subtitle="Monthly limits and what’s left" onPress={() => router.push('/budgets')} />
        <Divider />
        <Row icon="bag" title="Categories" subtitle="Icons and colours for your spending" onPress={() => router.push('/categories')} />
        {aiOn ? (
          <>
            <Divider />
            <Row icon="bulb" iconTone="brass" title="Ask your money" subtitle="Questions in plain words" onPress={() => router.push('/ask')} />
            <Divider />
            <Row icon="list" iconTone="brass" title="Tidy up with AI" subtitle="Fix categories and merchant names" onPress={() => router.push('/ai-tidy')} />
          </>
        ) : null}
        {isSmsReadingAvailable ? (
          <>
            <Divider />
            <Row icon="sms" iconTone="brass" title="Import bank SMS" subtitle="Turn alerts into entries" onPress={() => router.push('/sms-import')} />
            <Divider />
            <Row
              icon="mail"
              iconTone="brass"
              title="New bank SMS pop-up"
              subtitle={isSmsPopupEnabled() ? 'On · add as alerts arrive' : 'Off'}
              onPress={() => router.push('/settings/sms')}
            />
          </>
        ) : null}
      </Group>

      <Group title="Settings">
        <Row
          icon="sun"
          title="Appearance"
          subtitle={`${paletteById(theme.palette).name} · ${MODE_LABEL[theme.preference]}`}
          onPress={() => router.push('/settings/appearance')}
        />
        <Divider />
        <Row icon="lock" title="App lock" subtitle={lock.enabled ? `On · ${LOCK_AFTER.find((o) => o.value === lock.lockAfter)?.label.toLowerCase()}` : 'Off'} onPress={() => router.push('/settings/security')} />
        <Divider />
        <Row icon="bulb" title="AI assistant" subtitle={aiOn ? 'On' : 'Off'} onPress={() => router.push('/settings/ai')} />
        <Divider />
        <Row
          icon="sync"
          title="Sync & backup"
          subtitle={sync.pending > 0 ? `${sync.pending} change(s) waiting` : SYNC_LABEL[sync.state]}
          onPress={() => router.push('/settings/sync')}
        />
      </Group>

      {__DEV__ ? (
        <Group title="Developer">
          <Row icon="settings" title="Developer tools" subtitle="Test the new-SMS card and notification" onPress={() => router.push('/settings/developer')} />
        </Group>
      ) : null}

      {/* Sign out sits apart at the end, so it's never tapped on the way to something else. */}
      <View className="gap-2 pt-2">
        <Button variant="danger" title="Sign out" onPress={signOut} />
        <Text variant="caption" align="center">
          Pettagam {Constants.expoConfig?.version ?? ''}
        </Text>
      </View>
    </Screen>
  );
}
