import { useEffect, useState } from 'react';

import { getSyncStatus, onSyncStatus, type SyncStatus } from './drive-sync';

export function useSyncStatus(): SyncStatus {
  const [s, setS] = useState(getSyncStatus);
  useEffect(() => onSyncStatus(setS), []);
  return s;
}
