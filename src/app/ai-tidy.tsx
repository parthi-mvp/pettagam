import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { toast } from 'sonner-native';

import { aiCategoriseMerchants, aiCleanMerchants } from '@/ai/features';
import { Button, Card, Checkbox, Divider, SegmentedControl, Screen, Text } from '@/components/ui';
import { listCategories, patchTransactions } from '@/db/repo';
import { haptic } from '@/lib/haptics';

type Mode = 'categories' | 'merchants';
type Fix = { merchant: string; type: 'expense' | 'income' | null; to: string; count: number; selected: boolean };

// shortcut: one AI call over the 150 most frequent merchants; run again to get the next batch.
const LIMIT = 150;

export default function AiTidy() {
  const db = useSQLiteContext();
  const [mode, setMode] = useState<Mode>('categories');
  const [fixes, setFixes] = useState<Fix[] | null>(null);
  const [busy, setBusy] = useState(false);

  const switchMode = (m: Mode) => {
    setMode(m);
    setFixes(null);
  };

  const find = async () => {
    setBusy(true);
    try {
      if (mode === 'categories') {
        const rows = await db.getAllAsync<{ merchant: string; type: 'expense' | 'income'; n: number }>(
          `SELECT merchant, type, COUNT(*) AS n FROM transactions
           WHERE deleted = 0 AND category_id IS NULL AND type IN ('expense', 'income') AND merchant IS NOT NULL AND TRIM(merchant) != ''
           GROUP BY LOWER(merchant), type ORDER BY n DESC LIMIT ?`,
          [LIMIT]
        );
        const cats = (await listCategories(db)).map((c) => ({ name: c.name, kind: c.kind }));
        const picks = rows.length ? await aiCategoriseMerchants(rows.map((r) => ({ merchant: r.merchant, type: r.type })), cats) : new Map<number, string>();
        setFixes([...picks].map(([i, to]) => ({ merchant: rows[i].merchant, type: rows[i].type, to, count: rows[i].n, selected: true })));
      } else {
        const rows = await db.getAllAsync<{ merchant: string; n: number }>(
          `SELECT merchant, COUNT(*) AS n FROM transactions WHERE deleted = 0 AND merchant IS NOT NULL AND TRIM(merchant) != ''
           GROUP BY merchant ORDER BY n DESC LIMIT ?`,
          [LIMIT]
        );
        const picks = rows.length ? await aiCleanMerchants(rows.map((r) => r.merchant)) : new Map<number, string>();
        setFixes([...picks].map(([i, to]) => ({ merchant: rows[i].merchant, type: null, to, count: rows[i].n, selected: true })));
      }
      haptic.success();
    } catch (e) {
      haptic.error();
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!fixes) return;
    setBusy(true);
    try {
      const cats = await listCategories(db);
      let n = 0;
      for (const f of fixes.filter((x) => x.selected)) {
        if (f.type) {
          const id = cats.find((c) => c.name === f.to && c.kind === f.type)?.id;
          if (id) n += await patchTransactions(db, 'category_id IS NULL AND type = ? AND LOWER(merchant) = LOWER(?)', [f.type, f.merchant], { category_id: id });
        } else {
          n += await patchTransactions(db, 'merchant = ?', [f.merchant], { merchant: f.to });
        }
      }
      haptic.success();
      toast.success(`${n} transaction${n === 1 ? '' : 's'} updated`);
      setFixes(null);
    } catch (e) {
      haptic.error();
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (i: number) => {
    haptic.selection();
    setFixes((list) => list?.map((f, j) => (j === i ? { ...f, selected: !f.selected } : f)) ?? null);
  };
  const selected = fixes?.filter((f) => f.selected).length ?? 0;

  return (
    <Screen>
      <SegmentedControl
        options={[
          { value: 'categories', label: 'Fix categories' },
          { value: 'merchants', label: 'Clean merchant names' },
        ]}
        value={mode}
        onChange={switchMode}
      />
      <Card>
        <Text variant="small">
          {mode === 'categories'
            ? 'Finds transactions with no category and suggests one from the merchant name.'
            : 'Turns names like “UPI-SWIGGY8@ICICI” into “Swiggy” so reports group them together.'}{' '}
          Only merchant names are sent to the AI. Nothing changes until you tap Apply.
        </Text>
        <Button title={busy && !fixes ? 'Asking AI…' : 'Find suggestions'} icon="bulb" loading={busy && !fixes} disabled={busy} onPress={find} />
      </Card>

      {fixes ? (
        <Card className="gap-0">
          <Text variant="heading">{fixes.length ? `${fixes.length} suggestion${fixes.length === 1 ? '' : 's'}` : 'Nothing to fix'}</Text>
          {fixes.map((f, i) => (
            <View key={`${f.merchant}|${f.type}`}>
              {i > 0 ? <Divider /> : null}
              <Pressable onPress={() => toggle(i)} className="flex-row items-center gap-3 py-2.5" accessibilityRole="checkbox" accessibilityState={{ checked: f.selected }}>
                <Checkbox checked={f.selected} />
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1}>{f.merchant}</Text>
                  <Text variant="small" numberOfLines={1}>
                    → {f.to} · {f.count} transaction{f.count === 1 ? '' : 's'}
                  </Text>
                </View>
              </Pressable>
            </View>
          ))}
          {fixes.length ? <Button title={`Apply ${selected}`} loading={busy} disabled={!selected || busy} onPress={apply} /> : null}
        </Card>
      ) : null}
    </Screen>
  );
}
