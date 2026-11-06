import { isSmsPopupEnabled, isSmsReadingAvailable } from '@modules/sms-reader';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { aiReady, useAi } from '@/ai/client';
import { Card, Divider, GroupLabel, Row, Screen, Text } from '@/components/ui';
import { getSyncStatus, onSyncStatus, refreshPending, type SyncStatus } from '@/sync/drive-sync';
import { paletteById } from '@/theme/palettes';
import { LOCK_AFTER, useAppLock } from '@/security/app-lock';
import { useThemePreference } from '@/theme/themePreference';

const MODE_LABEL = { system: 'System', light: 'Light', dark: 'Dark' } as const;
const SYNC_LABEL: Record<SyncStatus['state'], string> = { off: 'Off · only on this phone', idle: 'Google Drive', syncing: 'Backing up…', offline: 'Offline', error: 'Backup problem' };

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
  const theme = useThemePreference();
  const lock = useAppLock();
  const aiOn = useAi(aiReady);
  const [sync, setSync] = useState<SyncStatus>(getSyncStatus());

  useEffect(() => {
    refreshPending(db);
    return onSyncStatus(setSync);
  }, [db]);


  return (
    // A full page (back button, no tab bar), opened from the More button in the tab bar.
    <Screen>

      <Group title="Money">
        <Row icon="card" title="Accounts" subtitle="Banks, cards, loans and chits" onPress={() => router.push('/accounts')} />
        <Divider />
        <Row icon="pie" title="Reports" subtitle="Spending by category and month" onPress={() => router.push('/reports')} />
        <Divider />
        <Row icon="trend" title="Budgets" subtitle="Monthly limits and what’s left" onPress={() => router.push('/budgets')} />
        <Divider />
        <Row icon="bag" title="Categories" subtitle="Icons and colours for your spending" onPress={() => router.push('/categories')} />
        <Divider />
        <Row icon="tag" title="Tags" subtitle="Trips, events and claims across categories" onPress={() => router.push('/tags')} />
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
          title="Backup"
          subtitle={sync.state !== 'off' && sync.pending > 0 ? `${sync.pending} change(s) to back up` : SYNC_LABEL[sync.state]}
          onPress={() => router.push('/settings/sync')}
        />
      </Group>

      {__DEV__ ? (
        <Group title="Developer">
          <Row icon="settings" title="Developer tools" subtitle="Testing tools for this build" onPress={() => router.push('/settings/developer')} />
        </Group>
      ) : null}

      <View className="gap-2 pt-2">
        <Text variant="caption" align="center">
          Pettagam {Constants.expoConfig?.version ?? ''}
        </Text>
      </View>
    </Screen>
  );
}
