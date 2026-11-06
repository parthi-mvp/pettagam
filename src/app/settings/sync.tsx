import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { Button, FormSection, Screen, Text } from '@/components/ui';
import { importFromDrive } from '@/sync/drive-import';
import { getSyncStatus, onSyncStatus, refreshPending, syncNow, type SyncStatus } from '@/sync/neon-sync';

const STATE_LABEL: Record<SyncStatus['state'], string> = {
  idle: 'Up to date',
  syncing: 'Syncing…',
  offline: 'Offline. Changes will upload when you’re back online',
  error: 'Sync problem',
};

export default function SyncSettings() {
  const db = useSQLiteContext();
  const [sync, setSync] = useState<SyncStatus>(getSyncStatus());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    refreshPending(db);
    return onSyncStatus(setSync);
  }, [db]);

  const syncButton = () => syncNow(db).catch(() => {});

  const driveImport = async () => {
    setBusy(true);
    try {
      const n = await importFromDrive(db);
      Alert.alert('Drive import', n ? `${n} record(s) imported and queued for upload.` : 'Nothing new found in Drive.');
      syncButton();
    } catch (e) {
      Alert.alert('Drive import failed', String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <FormSection card title="Sync">
        <Text variant="label" tone={sync.state === 'error' ? 'danger' : 'default'}>
          {STATE_LABEL[sync.state]}
        </Text>
        <Text variant="small">
          {sync.pending > 0 ? `${sync.pending} change(s) waiting to upload · ` : ''}
          Last synced: {sync.lastSyncAt ? new Date(sync.lastSyncAt).toLocaleString('en-IN') : 'never'}
        </Text>
        {sync.error ? (
          <Text variant="small" tone="danger">
            {sync.error}
          </Text>
        ) : null}
        {/* The raw server error, for development builds only. */}
        {__DEV__ && sync.detail ? (
          <Text variant="caption" selectable>
            {sync.detail}
          </Text>
        ) : null}
        <Button title={sync.state === 'syncing' ? 'Syncing…' : 'Sync now'} disabled={sync.state === 'syncing'} onPress={syncButton} />
        <Text variant="caption">
          Your data is stored in your Pettagam account and cached on this phone, so the app works offline. Edits upload a few seconds after
          you make them.
        </Text>
      </FormSection>

      <FormSection card title="Moving from Google Drive">
        <Text variant="small">Used the earlier version with Drive sync? Import that backup once into your account.</Text>
        <Button variant="secondary" title={busy ? 'Importing…' : 'Import from Google Drive'} disabled={busy} onPress={driveImport} />
      </FormSection>
    </Screen>
  );
}
