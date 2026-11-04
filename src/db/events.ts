import { useEffect, useState } from 'react';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';

import type { TableName } from './types';

type Listener = (table: TableName | '*') => void;
const listeners = new Set<Listener>();

/** Subscribe to data changes (used by auto-sync to upload soon after a local edit). */
export function onDataChange(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Notify screens that data changed so live queries re-run. Use '*' after a sync. */
export function emitChange(table: TableName | '*') {
  listeners.forEach((l) => l(table));
}

/**
 * Re-runs `query` whenever any of `tables` change. Tiny alternative to a state library:
 * SQLite is the single source of truth.
 */
export function useLiveQuery<T>(
  query: (db: SQLiteDatabase) => Promise<T>,
  tables: TableName[],
  deps: unknown[] = []
): { data: T | undefined; reload: () => void } {
  const db = useSQLiteContext();
  const [data, setData] = useState<T>();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const l: Listener = (t) => {
      if (t === '*' || tables.includes(t)) setTick((x) => x + 1);
    };
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join(',')]);

  useEffect(() => {
    let alive = true;
    query(db)
      .then((r) => alive && setData(r))
      .catch((e) => console.warn('query failed', e));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, tick, ...deps]);

  return { data, reload: () => setTick((x) => x + 1) };
}
