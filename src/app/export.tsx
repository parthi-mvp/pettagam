import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { View } from 'react-native';
import { toast } from 'sonner-native';

import { financialYear } from '@/ai/features';
import { Button, Chips, FormSection, Screen, Text } from '@/components/ui';
import { useLiveQuery } from '@/db/events';
import { monthRange } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { exportRows } from '@/reports/analytics';
import { statementHtml, toCsv } from '@/reports/statement';

type Period = 'month' | 'last-month' | 'fy' | 'last-fy' | 'all';

function range(p: Period) {
  const now = new Date();
  const month = (o: number) => ({ ...monthRange(o, now), label: new Date(monthRange(o, now).start).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) });
  if (p === 'month') return month(0);
  if (p === 'last-month') return month(-1);
  if (p === 'fy') return financialYear(now);
  if (p === 'last-fy') return financialYear(new Date(now.getFullYear() - 1, now.getMonth(), 1));
  return { start: 0, end: Date.now() + 86_400_000, label: 'All entries' };
}
const PERIODS: { value: Period; label: string }[] = [
  { value: 'month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'fy', label: financialYear().label },
  { value: 'last-fy', label: financialYear(new Date(new Date().getFullYear() - 1, new Date().getMonth(), 1)).label },
  { value: 'all', label: 'Everything' },
];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/** Hand the file to the share sheet, then remove our copy (it holds financial data). */
async function share(file: File, mimeType: string, dialogTitle: string) {
  try {
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle, UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : 'public.comma-separated-values-text' });
  } finally {
    if (file.exists) file.delete();
  }
}

export default function Export() {
  const db = useSQLiteContext();
  const [period, setPeriod] = useState<Period>('month');
  const [busy, setBusy] = useState<'csv' | 'pdf' | null>(null);
  const r = range(period);
  const { data: count } = useLiveQuery(
    (d) => d.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM transactions WHERE deleted = 0 AND date >= ? AND date < ?', [r.start, r.end]).then((x) => x?.n ?? 0),
    ['transactions'],
    [r.start, r.end]
  );

  const run = async (kind: 'csv' | 'pdf') => {
    setBusy(kind);
    try {
      const rows = await exportRows(db, r.start, r.end);
      const name = `pettagam-${slug(r.label)}`;
      if (kind === 'csv') {
        const file = new File(Paths.cache, `${name}.csv`);
        if (file.exists) file.delete();
        file.create();
        file.writeSync('﻿' + toCsv(rows)); // BOM: Excel then reads ₹ and Tamil text correctly
        await share(file, 'text/csv', 'Share CSV');
      } else {
        const { uri } = await Print.printToFileAsync({ html: statementHtml(rows, r.label) });
        const file = new File(Paths.cache, `${name}.pdf`);
        if (file.exists) file.delete();
        new File(uri).moveSync(file);
        await share(file, 'application/pdf', 'Share statement');
      }
      haptic.success();
    } catch {
      haptic.error();
      toast.error('Couldn’t make the file', { description: 'Try again. If it keeps failing, try a shorter period.' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <FormSection card title="Period">
        <Chips options={PERIODS} value={period} onChange={setPeriod} />
        <Text variant="small" tabular>{count == null ? ' ' : `${count.toLocaleString('en-IN')} ${count === 1 ? 'entry' : 'entries'}`}</Text>
      </FormSection>
      <FormSection card title="Format">
        <View className="gap-2">
          <Button title={busy === 'pdf' ? 'Making PDF…' : 'PDF statement'} disabled={!!busy || !count} onPress={() => run('pdf')} />
          <Text variant="caption">Totals, spending by category and every entry. Ready to print or send to your CA.</Text>
        </View>
        <View className="gap-2 pt-1">
          <Button variant="secondary" title={busy === 'csv' ? 'Making CSV…' : 'CSV for Excel or Sheets'} disabled={!!busy || !count} onPress={() => run('csv')} />
          <Text variant="caption">One row per entry: date, type, amount, account, category, merchant, note, tags.</Text>
        </View>
      </FormSection>
      <Text variant="caption">The file goes only where you send it. Pettagam keeps no copy.</Text>
    </Screen>
  );
}
