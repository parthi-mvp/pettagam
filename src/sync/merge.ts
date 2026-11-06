// Pure merge logic for offline-first sync. No imports so it is unit-testable in Node.

export type Row = { id: string; updated_at: number; [k: string]: unknown };

export type Snapshot = {
  format: 1;
  exportedAt: number;
  deviceId: string;
  tables: Record<string, Row[]>;
};

/** Last-write-wins per row: the remote rows that are new here or newer than the local copy. */
export function mergeTable(local: Row[], remote: Row[]): { toApplyLocally: Row[] } {
  const byId = new Map(local.map((r) => [r.id, r]));
  const toApplyLocally = remote.filter((r) => {
    const l = byId.get(r.id);
    return !l || r.updated_at > l.updated_at;
  });
  return { toApplyLocally };
}
