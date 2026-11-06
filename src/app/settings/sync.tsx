import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { BackupFileSection, DriveEncryptionSection } from '@/components/backup-sections';
import { Icon } from '@/components/icons';
import { Button, Divider, FormSection, Screen, Text } from '@/components/ui';
import { toast } from 'sonner-native';
import { haptic } from '@/lib/haptics';
import { connectDrive, disconnectDrive, getSyncStatus, listDevices, onSyncStatus, refreshPending, removeDevice, syncNow, type SyncStatus } from '@/sync/drive-sync';
import type { DeviceInfo } from '@/sync/drive-plan';
import { describeSyncError } from '@/sync/errors';
import { useThemeColors } from '@/theme/useThemeColor';

const ago = (t: number | null) => {
  if (!t) return 'never';
  const m = Math.round((Date.now() - t) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`;
  return new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

/**
 * Backup: data lives on this phone; Google Drive (the user's own, hidden app folder) is the optional
 * backup and the way to move to a new phone or use two. No Pettagam account or server.
 */
export default function BackupSettings() {
  const db = useSQLiteContext();
  const [sync, setSync] = useState<SyncStatus>(getSyncStatus());
  const [busy, setBusy] = useState(false);
  const [success, warning, muted] = useThemeColors(['success-fg', 'warning-fg', 'fg-muted'] as const);

  useEffect(() => {
    refreshPending(db);
    return onSyncStatus(setSync);
  }, [db]);

  const report = (e: unknown) => {
    const { offline, message } = describeSyncError(e instanceof Error ? e.message : String(e));
    haptic.error();
    toast.error(offline ? 'You’re offline' : 'Couldn’t back up', { description: offline ? 'Connect to the internet and try again.' : (message ?? undefined) });
  };

  const connect = async () => {
    setBusy(true);
    try {
      const email = await connectDrive(db);
      if (email) {
        haptic.success();
        toast.success('Backing up to Google Drive', { description: email });
      }
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  };

  const backUp = () => syncNow(db).then(() => haptic.success(), report);

  const disconnect = () =>
    Alert.alert('Stop backing up?', 'Your data stays on this phone, and the last backup stays in your Google Drive.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Stop', style: 'destructive', onPress: () => disconnectDrive(db) },
    ]);

  const on = sync.state !== 'off';
  const working = sync.state === 'syncing' || busy;

  return (
    <Screen>
      {/* Where the data is, in one line, before anything else. */}
      <View className="flex-row items-center gap-3 rounded-2xl bg-fill px-3.5 py-3">
        <Icon name="ms:smartphone" size={22} color={muted} />
        <Text variant="small" className="min-w-0 flex-1">
          Your data is stored on this phone. There’s no Pettagam account and no server.
        </Text>
      </View>

      {on ? (
        <FormSection card title="Google Drive backup">
          <View className="flex-row items-center gap-2.5">
            <Icon
              name={sync.state === 'error' || sync.state === 'offline' || sync.state === 'locked' ? 'ms:cloud_off' : 'ms:cloud_done'}
              size={20}
              color={sync.state === 'error' || sync.state === 'offline' || sync.state === 'locked' ? warning : success}
            />
            <View className="min-w-0 flex-1">
              <Text tone="default" weight="medium">
                {sync.state === 'syncing' ? 'Backing up…' : sync.state === 'offline' ? 'Offline' : sync.state === 'error' ? 'Backup problem' : sync.state === 'locked' ? 'Locked · enter your sync password below' : `Backed up ${ago(sync.lastSyncAt)}`}
              </Text>
              <Text variant="caption" numberOfLines={1}>
                {sync.account}
              </Text>
            </View>
          </View>
          {sync.error ? (
            <Text variant="small" tone="danger">
              {sync.error}
            </Text>
          ) : null}
          {__DEV__ && sync.detail ? (
            <Text variant="caption" selectable>
              {sync.detail}
            </Text>
          ) : null}
          {sync.pending > 0 ? <Text variant="small">{`${sync.pending} change(s) not backed up yet`}</Text> : null}
          <Button title={working ? 'Backing up…' : 'Back up now'} disabled={working} onPress={backUp} />
          <Text variant="caption">
            Backs up a short while after each change, and when you open or leave the app. On another phone, connect the same Google account to bring
            everything over; both phones then stay in step.
          </Text>
        </FormSection>
      ) : (
        <FormSection card title="Back up to Google Drive">
          <Text variant="small">
            Keep a copy in your own Google Drive, to restore on a new phone or use Pettagam on two. Already backed up from another phone? Connect the same
            account and it’s restored here.
          </Text>
          <Button title={busy ? 'Connecting…' : 'Connect Google Drive'} disabled={busy} onPress={connect} />
        </FormSection>
      )}

      {on ? <DriveEncryptionSection sync={sync} /> : null}

      {on ? <Devices lastSyncAt={sync.lastSyncAt} /> : null}

      <BackupFileSection />

      <FormSection card title="What Pettagam can see in your Drive">
        <Text variant="small">
          Only its own hidden backup folder. It can’t see, open or change any of your other files, and the backup isn’t visible in your Drive’s file
          list. You can remove it from Google Account → Data & privacy → Third-party apps.
        </Text>
      </FormSection>

      {on ? <Button variant="secondary" title="Stop backing up" onPress={disconnect} /> : null}
    </Screen>
  );
}

/**
 * Phones backing up to this Google account. Removing one deletes its files from Drive (after this
 * phone has taken in everything it wrote); a phone still in use just backs up again.
 */
function Devices({ lastSyncAt }: { lastSyncAt: number | null }) {
  const db = useSQLiteContext();
  const [list, setList] = useState<{ me: string; devices: DeviceInfo[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [muted] = useThemeColors(['fg-muted'] as const);

  const load = useCallback(() => {
    listDevices(db).then(
      (l) => {
        setList(l);
        setFailed(false);
      },
      () => setFailed(true)
    );
  }, [db]);
  // Again after each backup, so this phone's own "last backup" stays current.
  useEffect(load, [load, lastSyncAt]);

  const remove = (d: DeviceInfo) =>
    Alert.alert(
      `Remove ${d.name ?? 'this device'}?`,
      'Its backup files are deleted from your Drive. Everything it added stays here. If that phone is still in use, it will back up again the next time it opens Pettagam.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemoving(d.device);
            try {
              await removeDevice(db, d.device);
              haptic.success();
            } catch (e) {
              const { message } = describeSyncError(e instanceof Error ? e.message : String(e));
              toast.error('Couldn’t remove it', { description: message ?? undefined });
            } finally {
              setRemoving(null);
              load();
            }
          },
        },
      ]
    );

  return (
    <FormSection card title="Devices">
      {failed ? (
        <Text variant="small">Couldn’t load the list. Check your connection and try again.</Text>
      ) : !list ? (
        <Text variant="small">Loading…</Text>
      ) : (
        list.devices.map((d, i) => {
          const me = d.device === list.me;
          return (
            <View key={d.device}>
              {i > 0 ? <Divider /> : null}
              <View className="flex-row items-center gap-3 py-2.5">
                <Icon name="ms:smartphone" size={20} color={muted} />
                <View className="min-w-0 flex-1">
                  <Text tone="default" weight="medium" numberOfLines={1}>
                    {`${d.name ?? 'Phone'}${me ? ' · this phone' : ''}`}
                  </Text>
                  <Text variant="caption">{`Last backup ${ago(new Date(d.lastSeen).getTime())}`}</Text>
                </View>
                {me ? null : (
                  <Button
                    size="sm"
                    variant="secondary"
                    title={removing === d.device ? 'Removing…' : 'Remove'}
                    disabled={removing != null}
                    onPress={() => remove(d)}
                  />
                )}
              </View>
            </View>
          );
        })
      )}
    </FormSection>
  );
}
