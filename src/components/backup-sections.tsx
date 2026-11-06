import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { toast } from 'sonner-native';

import { getSetting } from '@/db/repo';
import { haptic } from '@/lib/haptics';
import { disableDriveEncryption, enableDriveEncryption, resetDriveBackup, unlockDriveEncryption, type SyncStatus } from '@/sync/drive-sync';
import { describeSyncError } from '@/sync/errors';
import { NotABackupError, pickBackupFile, restoreBackup, saveBackupFile, unlockBackupFile } from '@/sync/file-backup';
import { snapshotCounts, type Snapshot } from '@/sync/snapshot';
import { WrongPasswordError, type Sealed } from '@/sync/vault';

import { Button, Field, FormSection, SwitchRow, Text } from './ui';

const MIN_PASSWORD = 8;
const FORGET_WARNING = 'There’s no way to recover it: without this password, the backup can’t be opened by anyone, including you.';

/** A new password, typed twice. Returns the password once both match and it's long enough, else null. */
function useNewPassword() {
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const error = pw && pw.length < MIN_PASSWORD ? `At least ${MIN_PASSWORD} characters` : again && again !== pw ? 'The two passwords don’t match' : null;
  const fields = (
    <>
      <Field label="Password" value={pw} onChangeText={setPw} secureTextEntry autoCapitalize="none" autoComplete="new-password" error={pw && pw.length < MIN_PASSWORD ? error : null} />
      <Field label="Type it again" value={again} onChangeText={setAgain} secureTextEntry autoCapitalize="none" error={again && again !== pw ? error : null} />
    </>
  );
  return { fields, value: !error && pw.length >= MIN_PASSWORD && again === pw ? pw : null, reset: () => (setPw(''), setAgain('')) };
}

const plain = (e: unknown) =>
  e instanceof WrongPasswordError ? 'Wrong password' : e instanceof NotABackupError ? e.message : (describeSyncError(e instanceof Error ? e.message : String(e)).message ?? undefined);

/**
 * Backup to a file (no Google needed): encrypted with a password, handed to the share sheet.
 * Restore: pick the file, unlock it, see what's in it, then merge it in (never overwrites newer edits).
 */
export function BackupFileSection() {
  const db = useSQLiteContext();
  const [mode, setMode] = useState<'idle' | 'save' | 'unlock' | 'preview'>('idle');
  const [busy, setBusy] = useState(false);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [picked, setPicked] = useState<Sealed | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [password, setPassword] = useState('');
  const newPw = useNewPassword();

  useEffect(() => {
    getSetting(db, 'file_backup_at').then((v) => setLastSaved(v ? Number(v) : null));
  }, [db, mode]);

  const done = () => {
    setMode('idle');
    setPicked(null);
    setSnapshot(null);
    setPassword('');
    newPw.reset();
  };
  const work = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      haptic.error();
      toast.error('Something went wrong', { description: plain(e) });
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    work(async () => {
      await saveBackupFile(db, newPw.value!);
      haptic.success();
      done();
    });
  const pick = () =>
    work(async () => {
      const file = await pickBackupFile();
      if (!file) return;
      setPicked(file);
      setMode('unlock');
    });
  const unlock = () =>
    work(async () => {
      setSnapshot(await unlockBackupFile(picked!, password));
      setMode('preview');
    });
  const restore = () =>
    work(async () => {
      const n = await restoreBackup(db, snapshot!);
      haptic.success();
      toast.success(n ? 'Backup restored' : 'Already up to date', { description: n ? `${n.toLocaleString('en-IN')} record(s) added or updated` : 'Everything in the file is already here' });
      done();
    });

  const counts = snapshot ? snapshotCounts(snapshot) : null;

  return (
    <FormSection card title="Backup file">
      {mode === 'idle' ? (
        <>
          <Text variant="small">
            A password-protected copy you keep yourself: save it to Files, send it to yourself, or move it to a new phone. No Google account needed.
          </Text>
          {lastSaved ? <Text variant="caption">{`Last saved ${new Date(lastSaved).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}</Text> : null}
          <Button title="Save a backup file" onPress={() => setMode('save')} />
          <Button variant="secondary" title={busy ? 'Opening…' : 'Restore from a file'} disabled={busy} onPress={pick} />
        </>
      ) : mode === 'save' ? (
        <>
          <Text variant="small">{`Choose a password for this file. ${FORGET_WARNING}`}</Text>
          {newPw.fields}
          <Button title={busy ? 'Encrypting…' : 'Encrypt and share'} disabled={busy || !newPw.value} onPress={save} />
          <Button variant="secondary" title="Cancel" disabled={busy} onPress={done} />
        </>
      ) : mode === 'unlock' ? (
        <>
          <Text variant="small">Enter the password this backup was saved with.</Text>
          <Field label="Backup password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoFocus />
          <Button title={busy ? 'Unlocking…' : 'Unlock'} disabled={busy || !password} onPress={unlock} />
          <Button variant="secondary" title="Cancel" disabled={busy} onPress={done} />
        </>
      ) : (
        <>
          <Text tone="default" weight="medium">
            {`Saved ${new Date(snapshot!.exportedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
          </Text>
          <Text variant="small" tabular>
            {`${counts!.transactions.toLocaleString('en-IN')} entries · ${counts!.accounts} accounts · ${counts!.investments} investments · ${counts!.budgets} budgets`}
          </Text>
          <Text variant="caption">It’s merged with what’s on this phone: anything newer here stays, and restoring twice changes nothing.</Text>
          <Button title={busy ? 'Restoring…' : 'Restore'} disabled={busy} onPress={restore} />
          <Button variant="secondary" title="Cancel" disabled={busy} onPress={done} />
        </>
      )}
    </FormSection>
  );
}

/** "Encrypt my Drive backup": turn on (new sync password), unlock on another phone, turn off, or reset. */
export function DriveEncryptionSection({ sync }: { sync: SyncStatus }) {
  const db = useSQLiteContext();
  const [setting, setSetting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const newPw = useNewPassword();

  const work = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      haptic.success();
      toast.success(ok);
      setSetting(false);
      setPassword('');
      newPw.reset();
    } catch (e) {
      haptic.error();
      const msg = e instanceof Error && e.message === 'VAULT_EXISTS' ? 'Another phone just turned it on. Enter that password instead.' : plain(e);
      toast.error('Couldn’t change encryption', { description: msg });
    } finally {
      setBusy(false);
    }
  };

  if (sync.state === 'locked') {
    return (
      <FormSection card title="Encrypted backup">
        <Text variant="small">This Drive backup is encrypted. Enter the sync password you chose on your other phone to keep syncing here.</Text>
        <Field label="Sync password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
        <Button title={busy ? 'Unlocking…' : 'Unlock'} disabled={busy || !password} onPress={() => work(() => unlockDriveEncryption(db, password), 'Unlocked · syncing')} />
        <Button
          variant="secondary"
          title="Forgot the password?"
          disabled={busy}
          onPress={() =>
            Alert.alert(
              'Start the Drive backup afresh?',
              'Every Pettagam file in your Drive is deleted, then this phone backs up again, unencrypted. Your data on this phone stays. Other phones back up again when they next sync.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Start afresh', style: 'destructive', onPress: () => work(() => resetDriveBackup(db), 'Drive backup started afresh') },
              ]
            )
          }
        />
      </FormSection>
    );
  }

  return (
    <FormSection card title="Encryption">
      <SwitchRow
        title="Encrypt my Drive backup"
        description="End-to-end: only your phones can read it, not even Google. Each phone asks for the sync password once."
        value={sync.encrypted || setting}
        disabled={busy}
        onValueChange={(on) => {
          if (on) setSetting(true);
          else if (setting) setSetting(false);
          else
            Alert.alert('Turn off encryption?', 'Your phones rewrite their Drive backup unencrypted.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Turn off', style: 'destructive', onPress: () => work(() => disableDriveEncryption(db), 'Encryption turned off') },
            ]);
        }}
      />
      {setting && !sync.encrypted ? (
        <View className="gap-3">
          <Text variant="small">{`Choose a sync password. ${FORGET_WARNING}`}</Text>
          {newPw.fields}
          <Button title={busy ? 'Encrypting…' : 'Turn on encryption'} disabled={busy || !newPw.value} onPress={() => work(() => enableDriveEncryption(db, newPw.value!), 'Drive backup encrypted')} />
        </View>
      ) : null}
    </FormSection>
  );
}
