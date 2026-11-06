import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';

import { aiReady, useAi } from '@/ai/client';
import { aiDraftFromImage, aiDraftTransaction, aiSuggestCategoryAndTags } from '@/ai/features';
import type { AiDraft } from '@/ai/parse';
import { Icon } from '@/components/icons';
import { AccountPicker, CategoryGrid, CategoryTile, useUsage } from '@/components/pickers';
import { AmountInput, BackButton, OptionRow, Button, Card, DateField, Field, GroupLabel, HeroBackdrop, IconTile, PressableScale, Sheet, StickyFooter, Text, type SheetRef } from '@/components/ui';
import { useLiveQuery } from '@/db/events';
import { getById, listAccounts, listCategories, save, softDelete, tagTotals } from '@/db/repo';
import type { CategoryKind, Transaction, TxnType } from '@/db/types';
import { cn } from '@/lib/cn';
import { money, parseDate, toInputDate, monthRange } from '@/lib/format';
import { budgetAlert } from '@/budget/alert';
import { budgetOverview } from '@/budget/queries';
import { haptic } from '@/lib/haptics';
import { parseTags, STARTER_TAGS, tagsColumn } from '@/lib/tags';
import { TagField } from '@/components/tag-field';
import { pauseAppLock, resumeAppLock } from '@/security/app-lock';
import { useThemeColors } from '@/theme/useThemeColor';

const TYPES: { value: TxnType; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
];
/** Tiles shown before "More": the user's most-used categories. */
const GRID = 8;

export default function TransactionForm() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string; type?: TxnType; accountId?: string; describe?: string }>();
  const { data: accounts } = useLiveQuery(listAccounts, ['accounts']);
  const { data: categories } = useLiveQuery(listCategories, ['categories']);
  const counts = useUsage('category_id');
  // Budget progress per category for this month: a thin line on each category tile.
  const { data: budgets } = useLiveQuery((d) => budgetOverview(d, monthRange(0).start, monthRange(0).end), ['budgets', 'transactions', 'categories']);
  const budgetOf = (id: string) => budgets?.categories.find((c) => c.budget.category_id === id)?.status;
  const [primary, chevron] = useThemeColors(['primary', 'fg-subtle'] as const);

  const [type, setType] = useState<TxnType>(params.type ?? 'expense');
  const [amount, setAmount] = useState('');
  const [chosenAccountId, setAccountId] = useState<string | null>(params.accountId ?? null);
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [date, setDate] = useState(() => toInputDate(Date.now()));
  const [merchant, setMerchant] = useState('');
  const [note, setNote] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [aiTags, setAiTags] = useState<string[]>([]);
  const { data: usedTags } = useLiveQuery(tagTotals, ['transactions']);
  const [existing, setExisting] = useState<Transaction | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [describe, setDescribe] = useState('');
  const [filling, setFilling] = useState(false);
  const catSheet = useRef<SheetRef>(null);
  const scanSheet = useRef<SheetRef>(null);
  const ai = useAi(aiReady);

  useEffect(() => {
    if (!params.id) return;
    getById(db, 'transactions', params.id).then((t) => {
      if (!t) return;
      setExisting(t);
      setType(t.type);
      setAmount(String(t.amount));
      setAccountId(t.account_id);
      setToAccountId(t.to_account_id);
      setCategoryId(t.category_id);
      setDate(toInputDate(t.date));
      setMerchant(t.merchant ?? '');
      setNote(t.note ?? '');
      setTags(parseTags(t.tags));
    });
  }, [db, params.id]);

  // Default to the first account until the user picks one.
  const accountId = chosenAccountId ?? accounts?.[0]?.id ?? null;
  const account = accounts?.find((a) => a.id === accountId);
  const amt = Number(amount.replace(/,/g, '')) || 0;
  const noun = type === 'income' ? 'income' : type === 'transfer' ? 'transfer' : 'expense';

  const onSave = async () => {
    const when = parseDate(date);
    if (!amt || amt <= 0) return Alert.alert('Enter an amount');
    if (!accountId) return Alert.alert('Add an account first', 'Go to More → Accounts → Add.');
    if (type === 'transfer' && (!toAccountId || toAccountId === accountId)) return Alert.alert('Pick a different destination account');
    if (!when) return Alert.alert('Date must be DD/MM/YYYY');
    // Keep the time of day for existing entries; new ones use now if the date is today.
    const sameDay = existing && toInputDate(existing.date) === date;
    const ts = sameDay ? existing.date : toInputDate(Date.now()) === date ? Date.now() : when + 12 * 3600_000;
    await save(db, 'transactions', {
      id: existing?.id,
      type,
      amount: amt,
      account_id: accountId,
      to_account_id: type === 'transfer' ? toAccountId : null,
      category_id: type === 'transfer' ? null : categoryId,
      date: ts,
      merchant: merchant.trim() || null,
      note: note.trim() || null,
      tags: tagsColumn(tags),
      source: existing?.source ?? 'manual',
      sms_hash: existing?.sms_hash ?? null,
    });
    haptic.success();
    const saved = existing ? 'Changes saved' : `${noun[0].toUpperCase()}${noun.slice(1)} of ${money(amt)} saved`;
    const alert = type === 'expense' ? await budgetAlert(db, ts, categoryId, existing, amt).catch(() => null) : null;
    if (alert?.kind === 'over') toast.warning(saved, { description: alert.text });
    else if (alert) toast.info(saved, { description: alert.text });
    else toast.success(saved);
    router.back();
  };

  const onDelete = () => {
    haptic.warning();
    Alert.alert('Delete transaction?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await softDelete(db, 'transactions', existing!.id);
          toast.info('Transaction deleted');
          router.back();
        },
      },
    ]);
  };

  const fill = async (getDraft: (accounts: string[], cats: { name: string; kind: CategoryKind }[]) => Promise<AiDraft>) => {
    setFilling(true);
    try {
      const d = await getDraft(
        (accounts ?? []).map((a) => a.name),
        (categories ?? []).map((c) => ({ name: c.name, kind: c.kind }))
      );
      const accId = (name: string | null) => accounts?.find((a) => a.name === name)?.id;
      const kind = d.type === 'income' ? 'income' : 'expense';
      setType(d.type);
      if (d.amount) setAmount(String(d.amount));
      if (accId(d.account)) setAccountId(accId(d.account)!);
      if (accId(d.toAccount)) setToAccountId(accId(d.toAccount)!);
      setCategoryId(categories?.find((c) => c.kind === kind && c.name === d.category)?.id ?? null);
      if (d.merchant) setMerchant(d.merchant);
      if (d.note) setNote(d.note);
      if (d.date) setDate(d.date);
      haptic.success();
      toast.info(d.amount ? 'Filled in. Check it and save.' : 'Couldn’t find an amount. Fill it in below.');
    } catch (e) {
      haptic.error();
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setFilling(false);
    }
  };

  const fillFromText = () => describe.trim() && fill((accs, cats) => aiDraftTransaction(describe.trim(), accs, cats));

  const scanBill = async (camera: boolean) => {
    // The permission dialog and the camera / gallery send the app to the background; don't ask for a
    // fingerprint on return. Always resumed, even if permission is denied.
    pauseAppLock();
    let base64: string | null | undefined = null;
    try {
      if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
        return Alert.alert('Camera access needed', 'Allow camera access in system settings to scan bills.');
      }
      // shortcut: quality 0.5 keeps the upload to roughly 0.5-2 MB; resize with expo-image-manipulator if providers reject big photos.
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: 'images', base64: true, quality: 0.5 };
      const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      base64 = res.canceled ? null : res.assets[0]?.base64;
    } finally {
      resumeAppLock();
    }
    if (base64) fill((accs, cats) => aiDraftFromImage(base64, accs, cats));
  };
  // The picker opens after the sheet has finished closing, so the two animations don't collide.
  const pendingScan = useRef<boolean | null>(null);
  const startScan = (camera: boolean) => {
    pendingScan.current = camera;
    scanSheet.current?.dismiss();
  };
  const onScanSheetDismiss = () => {
    const camera = pendingScan.current;
    pendingScan.current = null;
    if (camera !== null) scanBill(camera);
  };

  const suggestCategory = async () => {
    const kind = type === 'income' ? 'income' : 'expense';
    const mine = (categories ?? []).filter((c) => c.kind === kind);
    setSuggesting(true);
    try {
      const tagNames = [...new Set([...(usedTags ?? []).map((t) => t.tag), ...STARTER_TAGS])];
      const r = await aiSuggestCategoryAndTags(`${merchant} ${note}`.trim(), kind, mine.map((c) => c.name), tagNames);
      const id = mine.find((c) => c.name === r.category)?.id;
      if (id) setCategoryId(id);
      // Tags are offered in the Suggested row (one tap), never added on their own.
      setAiTags(r.tags);
      if (id || r.tags.length) {
        haptic.selection();
        toast.info([id ? `Category: ${r.category}` : null, r.tags.length ? `Suggested tags: ${r.tags.join(', ')}` : null].filter(Boolean).join(' · '));
      } else toast.info('No clear match. Pick one yourself.');
    } catch (e) {
      haptic.error();
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSuggesting(false);
    }
  };

  // Most-used first; the selected one always shows even when it's past the first row.
  const kindCats = (categories ?? [])
    .filter((c) => c.kind === (type === 'income' ? 'income' : 'expense'))
    .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.name.localeCompare(b.name))
    .map((c) => ({ value: c.id, label: c.name, color: c.color, icon: c.icon }));
  // Room for a "More" tile when there are more categories than fit.
  const shown = kindCats.length > GRID ? GRID - 1 : GRID;
  let gridCats = kindCats.slice(0, shown);
  const picked = kindCats.find((c) => c.value === categoryId);
  if (picked && !gridCats.includes(picked)) gridCats = [...gridCats.slice(0, shown - 1), picked];
  const pickCategory = (id: string, fromSheet = false) => {
    haptic.selection();
    setCategoryId(!fromSheet && id === categoryId ? null : id);
    if (fromSheet) catSheet.current?.dismiss();
  };

  const pickType = (t: TxnType) => {
    if (t === type) return;
    haptic.selection();
    setType(t);
    setCategoryId(null);
  };

  return (
    <View className="flex-1 bg-canvas">
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <KeyboardAwareScrollView bottomOffset={96} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingBottom: 24 }}>
        {/* Hero: what kind, and how much. */}
        <View className="overflow-hidden bg-hero px-5 pb-12" style={{ paddingTop: Platform.OS === 'ios' ? 14 : insets.top + 10 }}>
          <HeroBackdrop />
          <View className="h-10 flex-row items-center justify-between">
            <BackButton tone="hero" />
            <Text variant="heading" tone="onHero" accessibilityRole="header">
              {existing ? `Edit ${noun}` : `Add ${noun}`}
            </Text>
            <View className="w-10" />
          </View>

          <View className="mt-4 h-9 flex-row rounded-full bg-white/10 p-1" accessibilityRole="tablist">
            {TYPES.map((o) => {
              const active = o.value === type;
              return (
                <Pressable
                  key={o.value}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  onPress={() => pickType(o.value)}
                  className={cn('flex-1 items-center justify-center rounded-full', active && 'bg-white')}>
                  <Text variant="label" className={active ? 'text-hero' : 'text-on-hero-soft'}>
                    {o.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text variant="small" align="center" className="mt-6 text-on-hero-soft">
            {type === 'income' ? 'Amount received' : type === 'transfer' ? 'Amount moved' : 'Enter amount'}
          </Text>
          <AmountInput tone="hero" value={amount} onChangeText={setAmount} autoFocus={!params.id && !params.describe} />
          {account ? (
            <Text variant="small" align="center" className="text-on-hero-soft" numberOfLines={1}>
              {type === 'income' ? `into ${account.name}` : `from ${account.name}`}
              {account.last4 ? ` ••${account.last4}` : ''}
            </Text>
          ) : null}
        </View>

        {/* Sheet: rounded panel that overlaps the hero. */}
        <View className="-mt-6 gap-5 rounded-t-[28px] bg-canvas px-gutter pt-5">
          {ai && params.describe && !params.id ? (
            <Card className="gap-2">
              <Field
                label="Describe it (AI fills the form)"
                value={describe}
                onChangeText={setDescribe}
                placeholder="Paid 450 to Swiggy yesterday from HDFC"
                autoFocus
                returnKeyType="go"
                onSubmitEditing={fillFromText}
              />
              <Button size="sm" variant="tinted" icon="bulb" title="Fill with AI" loading={filling} disabled={!describe.trim()} onPress={fillFromText} />
            </Card>
          ) : null}

          {type !== 'transfer' ? (
            <View className="gap-2">
              <View className="flex-row items-center justify-between">
                <GroupLabel>Category</GroupLabel>
                {ai && (merchant.trim() || note.trim()) ? (
                  <Pressable onPress={suggestCategory} disabled={suggesting} hitSlop={10} className="flex-row items-center gap-1 active:opacity-60">
                    <Icon name="bulb" size={14} color={primary} />
                    <Text variant="small" weight="medium" tone="primary">
                      {suggesting ? 'Thinking…' : 'Suggest category & tags'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              <View className="flex-row flex-wrap gap-2">
                {gridCats.map((c) => (
                  <CategoryTile key={c.value} option={c} active={c.value === categoryId} budget={budgetOf(c.value)} onPress={() => pickCategory(c.value)} />
                ))}
                {kindCats.length > GRID ? (
                  <PressableScale
                    scaleTo={0.95}
                    accessibilityRole="button"
                    accessibilityLabel={`Search all categories, ${kindCats.length - gridCats.length} more`}
                    onPress={() => catSheet.current?.present()}
                    className="w-[23%] items-center gap-1 rounded-[12px] border-[1.5px] border-transparent bg-surface px-1 py-2">
                    <IconTile icon="search" size={30} />
                    <Text variant="caption" tone="default" numberOfLines={1}>
                      More
                    </Text>
                  </PressableScale>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* When and where from. */}
          <View className="gap-3">
            {(accounts ?? []).length === 0 ? (
              <Text variant="muted">No accounts yet. Add one from More → Accounts.</Text>
            ) : type === 'transfer' ? (
              <>
                <AccountPicker label="From" accounts={accounts ?? []} value={accountId} onChange={setAccountId} />
                <AccountPicker label="To (e.g. the card being paid)" accounts={accounts ?? []} value={toAccountId} onChange={setToAccountId} />
              </>
            ) : null}
            <View className="flex-row gap-3">
              <View className="flex-1">
                <DateField label="Date" value={date} onChange={setDate} />
              </View>
              {type !== 'transfer' && (accounts ?? []).length > 0 ? (
                <View className="flex-1">
                  <AccountPicker label={type === 'income' ? 'Into' : 'Paid from'} accounts={accounts ?? []} value={accountId} onChange={setAccountId} />
                </View>
              ) : null}
            </View>
            {type !== 'transfer' ? (
              <Field
                label={type === 'income' ? 'From / payer' : 'Merchant / payee'}
                value={merchant}
                onChangeText={setMerchant}
                placeholder={type === 'income' ? 'Salary, refund…' : 'Swiggy, Indian Oil…'}
              />
            ) : null}
            <Field label="Note" value={note} onChangeText={setNote} multiline placeholder="Lunch with team" />
            <TagField
              value={tags}
              onChange={setTags}
              aiHints={aiTags}
              aiSuggest={
                ai
                  ? async (tagNames) => {
                      const kind = type === 'income' ? 'income' : 'expense';
                      const mine = (categories ?? []).filter((c) => c.kind === kind);
                      const r = await aiSuggestCategoryAndTags(`${merchant} ${note}`.trim(), kind, mine.map((c) => c.name), tagNames);
                      // Fill the category only when none is picked; a chosen one stays.
                      const id = mine.find((c) => c.name === r.category)?.id;
                      if (id && !categoryId && type !== 'transfer') setCategoryId(id);
                      return r.tags;
                    }
                  : undefined
              }
              context={{
                categoryId: type === 'transfer' ? null : categoryId,
                merchant,
                date: parseDate(date) ?? existing?.date ?? 0,
                text: [merchant, note, picked?.label].filter(Boolean).join(' '),
                excludeId: existing?.id,
              }}
            />
          </View>

          {ai && !params.id ? (
            <PressableScale
              scaleTo={0.98}
              accessibilityRole="button"
              accessibilityLabel="Scan a bill with AI"
              disabled={filling}
              onPress={() => scanSheet.current?.present()}
              className="flex-row items-center gap-3 rounded-[14px] border-[1.5px] border-dashed border-line-strong px-3.5 py-3">
              <IconTile icon="camera" size={32} />
              <View className="min-w-0 flex-1">
                <Text weight="medium">{filling ? 'Reading the bill…' : 'Scan a bill'}</Text>
                <Text variant="small" numberOfLines={1}>
                  Snap a photo or pick one; AI fills the form
                </Text>
              </View>
            </PressableScale>
          ) : null}

          <View className="gap-2">
            {existing ? (
              <Pressable onPress={onDelete} accessibilityRole="button" hitSlop={6} className="items-center py-2.5 active:opacity-60">
                <Text variant="label" tone="danger">
                  Delete transaction
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </KeyboardAwareScrollView>
      <StickyFooter>
        <Button size="lg" title={`${existing ? 'Save changes' : `Save ${noun}`}${amt ? ` · ${money(amt)}` : ''}`} onPress={onSave} />
      </StickyFooter>
      {/* Android draws this screen edge to edge: keep scrolled content out from under the status bar. */}
      {Platform.OS === 'ios' ? null : <View pointerEvents="none" className="absolute inset-x-0 top-0 bg-hero" style={{ height: insets.top }} />}

      <Sheet ref={catSheet} title={type === 'income' ? 'Income category' : 'Expense category'} scrollable lazy>
        <CategoryGrid options={kindCats} value={categoryId} onPick={(id) => pickCategory(id, true)} budgetOf={budgetOf} />
        <Pressable
          onPress={() => {
            catSheet.current?.dismiss();
            router.push('/categories');
          }}
          hitSlop={8}
          className="self-center px-3 py-2 active:opacity-60">
          <Text variant="small" weight="medium" tone="primary">
            Manage categories
          </Text>
        </Pressable>
      </Sheet>

      <Sheet ref={scanSheet} title="Scan a bill" subtitle="AI reads the amount, merchant and date, and fills the form." onDismiss={onScanSheetDismiss}>
        <View className="gap-2">
          <OptionRow leading={<IconTile icon="camera" size={40} />} title="Take a photo" subtitle="Use the camera on a bill or receipt" trailing={<Icon name="chevronRight" size={18} color={chevron} />} onPress={() => startScan(true)} />
          <OptionRow leading={<IconTile icon="image" size={40} />} title="Choose from gallery" subtitle="A photo or screenshot you already have" trailing={<Icon name="chevronRight" size={18} color={chevron} />} onPress={() => startScan(false)} />
        </View>
      </Sheet>
    </View>
  );
}
