import { isSmsReadingAvailable, readInbox, requestSmsPermission, type InboxSms } from '@modules/sms-reader';
import { useSQLiteContext } from 'expo-sqlite';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { toast } from 'sonner-native';

import { aiReady, useAi } from '@/ai/client';
import { aiSuggestCategoryAndTags } from '@/ai/features';
import { useLiveQuery } from '@/db/events';
import { listAccounts, listCategories, tagTotals } from '@/db/repo';
import { money } from '@/lib/format';
import { STARTER_TAGS } from '@/lib/tags';
import { networkById } from '@/catalog/networks';
import { explainSms, type SmsExplain } from '@/sms/import';
import { looksLikeTxn, viaLabel } from '@/sms/parser';

import { TagField } from './tag-field';
import { Button, Field, PressableScale, Sheet, Text, type SheetRef } from './ui';

const DAY = 86_400_000;

/** A small heading between groups of lines. */
const Section = ({ title }: { title: string }) => (
  <Text variant="eyebrow" className="pt-1">
    {title}
  </Text>
);

/** One "label: value" line of the result. */
const Line = ({ label, value, tone }: { label: string; value: string; tone?: 'brass' | 'subtle' }) => (
  <View className="flex-row gap-2">
    <Text variant="small" className="w-24">
      {label}
    </Text>
    <Text variant="small" tone={tone ?? 'default'} weight="medium" className="min-w-0 flex-1">
      {value}
    </Text>
  </View>
);

/**
 * Developer tools: paste an SMS or pick an old one from the inbox and see what the app makes of it:
 * parsed fields, category from your history vs the keyword rules, tag suggestions, and (on tap) the AI.
 * Nothing is saved, and already-imported messages can be tested too.
 */
export function SmsLab() {
  const db = useSQLiteContext();
  const ai = useAi(aiReady);
  const { data: categories } = useLiveQuery(listCategories, ['categories']);
  const { data: accounts } = useLiveQuery(listAccounts, ['accounts']);
  const { data: used } = useLiveQuery(tagTotals, ['transactions']);
  const picker = useRef<SheetRef>(null);
  const [inbox, setInbox] = useState<InboxSms[]>([]);
  const [body, setBody] = useState('');
  const [sms, setSms] = useState<{ address: string; body: string; date: number } | null>(null);
  const [result, setResult] = useState<SmsExplain | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [aiResult, setAiResult] = useState<{ category: string | null; tags: string[] } | null>(null);
  const [busy, setBusy] = useState<'inbox' | 'ai' | null>(null);

  const catName = (id: string | null) => (id ? (categories?.find((c) => c.id === id)?.name ?? id) : '—');

  const run = async (next: { address: string; body: string; date: number }) => {
    setSms(next);
    setTags([]);
    setAiResult(null);
    setResult(await explainSms(db, next));
  };

  const openInbox = async () => {
    setBusy('inbox');
    try {
      if (!(await requestSmsPermission())) return void toast.error('SMS permission is needed to read the inbox');
      const msgs = await readInbox(Date.now() - 90 * DAY, 300);
      setInbox(msgs.filter((m) => looksLikeTxn(m.body)).slice(0, 60));
      picker.current?.present();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const askAi = async () => {
    if (!sms || !result?.parsed) return;
    setBusy('ai');
    try {
      const kind = result.parsed.type;
      const mine = (categories ?? []).filter((c) => c.kind === kind);
      const tagNames = [...new Set([...(used ?? []).map((t) => t.tag), ...STARTER_TAGS])];
      setAiResult(await aiSuggestCategoryAndTags([result.parsed.merchant, sms.body].filter(Boolean).join(' '), kind, mine.map((c) => c.name), tagNames));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const p = result?.parsed;
  const source = result?.learnedId ? 'your history' : result?.ruleId ? 'keyword rule' : null;
  const account = accounts?.find((a) => a.id === result?.accountId);

  return (
    <View className="gap-3">
      <Field label="SMS text" value={body} onChangeText={setBody} multiline placeholder="Paste a bank SMS here" />
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button size="sm" title="Test this text" disabled={!body.trim()} onPress={() => run({ address: 'PASTED', body, date: Date.now() })} />
        </View>
        {isSmsReadingAvailable ? (
          <View className="flex-1">
            <Button size="sm" variant="secondary" title="Pick from inbox" loading={busy === 'inbox'} onPress={openInbox} />
          </View>
        ) : null}
      </View>

      {result && !p ? (
        <View className="gap-2 rounded-input bg-fill p-3">
          <Text variant="small" tone="warning">The rules can’t read this as a transaction.</Text>
          <Line label="AI next?" value={result.looksLikeTxn ? 'Yes, if “Read bank SMS with AI” is on' : 'No (no amount, or an OTP / promo / reminder)'} />
          <Line label="Sender bank" value={result.senderBank ?? '—'} tone="subtle" />
          <Line label="Imported?" value={result.alreadyImported ? 'Yes, already' : 'No'} tone="subtle" />
        </View>
      ) : null}

      {p && sms ? (
        <View className="gap-2 rounded-input bg-fill p-3">
          <Section title="Read as" />
          <Line label="Type" value={p.atm ? 'ATM withdrawal' : p.cardPayment ? 'Card bill payment' : p.type === 'income' ? 'Income' : 'Expense'} />
          <Line label="Amount" value={money(p.amount, true)} />
          <Line label="Merchant" value={p.merchant ?? '—'} />
          <Line label="Balance" value={p.balance != null ? money(p.balance, true) : '—'} tone="subtle" />

          <Section title="Account" />
          <Line label="Digits" value={p.last4 ? `••${p.last4} (${p.instrument === 'card' ? 'card' : 'account'})` : `none (${p.instrument})`} />
          <Line
            label="Matched"
            value={account ? `${account.name} · by ${result.accountBy === 'sender' ? 'sender bank' : 'digits'}` : 'no match: pick it when importing'}
            tone={account ? 'brass' : 'subtle'}
          />
          <Line label="Sender bank" value={result.senderBank ?? '—'} tone="subtle" />

          <Section title="Category" />
          <Line label="Picked" value={`${catName(result.categoryId)}${source ? ` · from ${source}` : ''}`} tone={result.categoryId ? 'brass' : 'subtle'} />
          <Line label="History" value={catName(result.learnedId)} tone="subtle" />
          <Line label="Rule" value={catName(result.ruleId)} tone="subtle" />

          <Section title="Payment" />
          <Line label="Method" value={viaLabel(p.via) ?? '—'} tone={p.via ? 'brass' : 'subtle'} />
          <Line label="Network" value={networkById(result.network)?.name ?? '—'} tone="subtle" />
          <Line label="Saved as" value={result.saveAs ?? '—'} tone={result.saveAs?.startsWith('skipped') ? 'subtle' : 'brass'} />

          <Section title="Duplicates" />
          <Line label="Imported?" value={result.alreadyImported ? 'Yes, already' : 'No'} tone="subtle" />
          <Line label="Twin alert" value={result.paymentTwin ? 'Yes: same payment already recorded' : 'No'} tone="subtle" />

          <Section title="Tags" />
          {/* The real tag field, keyed per message so its AI and history hints start fresh. */}
          <TagField
            key={`${sms.date}-${sms.body.length}`}
            value={tags}
            onChange={setTags}
            context={{ categoryId: result.categoryId, merchant: p.merchant, date: sms.date, text: [sms.body, catName(result.categoryId)].join(' ') }}
          />
          {ai ? (
            <>
              <Button size="sm" variant="tinted" icon="bulb" title="Ask AI (category + tags)" loading={busy === 'ai'} onPress={askAi} />
              {aiResult ? (
                <View className="gap-1">
                  <Line label="AI category" value={aiResult.category ?? '—'} tone="brass" />
                  <Line label="AI tags" value={aiResult.tags.length ? aiResult.tags.join(', ') : 'none'} tone="brass" />
                </View>
              ) : null}
            </>
          ) : (
            <Text variant="caption">Turn on the AI assistant to compare with the AI’s pick.</Text>
          )}
        </View>
      ) : null}

      <Sheet ref={picker} title="Pick an SMS" subtitle="Bank-looking messages from the last 90 days" scrollable lazy>
        <View className="gap-1.5 pb-4">
          {inbox.map((m) => (
            // Three lines of the message, then who sent it and when: enough to tell alerts apart.
            <PressableScale
              key={m.id}
              scaleTo={0.98}
              accessibilityRole="button"
              accessibilityLabel={`${m.address}: ${m.body}`}
              onPress={() => {
                picker.current?.dismiss();
                setBody(m.body);
                run({ address: m.address, body: m.body, date: m.date });
              }}
              className="gap-1 rounded-[12px] border border-line bg-surface px-3 py-2.5">
              <Text variant="small" tone="default" numberOfLines={3}>
                {m.body.replace(/\s+/g, ' ').trim()}
              </Text>
              <Text variant="caption">
                {`${m.address} · ${new Date(m.date).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`}
              </Text>
            </PressableScale>
          ))}
          {inbox.length === 0 ? <Text variant="small">No bank-looking messages in the last 90 days.</Text> : null}
        </View>
      </Sheet>
    </View>
  );
}
