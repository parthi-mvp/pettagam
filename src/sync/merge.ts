// Pure merge logic for offline-first sync. No imports so it is unit-testable in Node.

export type Row = { id: string; updated_at: number; [k: string]: unknown };

export type Snapshot = {
  format: 1;
  exportedAt: number;
  deviceId: string;
  tables: Record<string, Row[]>;
};

/**
 * Last-write-wins per row. Deletes are soft (deleted = 1) so they propagate like edits.
 * Returns the merged table plus the rows that must be written locally (remote won).
 */
export function mergeTable(local: Row[], remote: Row[]): { merged: Row[]; toApplyLocally: Row[]; remoteChanged: boolean } {
  const byId = new Map<string, Row>();
  for (const r of local) byId.set(r.id, r);
  const toApplyLocally: Row[] = [];
  const remoteIds = new Set<string>();
  for (const r of remote) {
    remoteIds.add(r.id);
    const l = byId.get(r.id);
    if (!l || r.updated_at > l.updated_at) {
      byId.set(r.id, r);
      toApplyLocally.push(r);
    }
  }
  // Remote needs an upload if local has any row it lacks or a newer version of one.
  const remoteById = new Map(remote.map((r) => [r.id, r]));
  const remoteChanged = local.some((l) => {
    const r = remoteById.get(l.id);
    return !r || l.updated_at > r.updated_at;
  });
  return { merged: [...byId.values()], toApplyLocally, remoteChanged };
}
