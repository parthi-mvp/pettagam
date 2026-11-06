import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { toast } from 'sonner-native';

import { useLiveQuery } from '@/db/events';
import { tagHints, tagTotals } from '@/db/repo';
import { haptic } from '@/lib/haptics';
import { cleanTag, hasTag, mergeHints, ruleTags, STARTER_TAGS, toggleTag } from '@/lib/tags';
import { useThemeColors } from '@/theme/useThemeColor';

import { Icon } from './icons';
import { PressableScale, Text, TextInput } from './ui';

const SUGGESTIONS = 8;

function TagChip({ label, picked, hint, onPress }: { label: string; picked: boolean; hint?: boolean; onPress: () => void }) {
  const [onPrimary, ink] = useThemeColors(['on-primary', 'primary-fg'] as const);
  return (
    <PressableScale
      scaleTo={0.96}
      accessibilityRole="button"
      accessibilityLabel={picked ? `Remove tag ${label}` : `Add tag ${label}`}
      onPress={onPress}
      className={picked ? 'h-7 flex-row items-center gap-1 rounded-chip bg-primary pl-3 pr-2' : 'h-7 flex-row items-center gap-1 rounded-chip bg-primary-soft pl-2 pr-3'}>
      {picked ? null : <Icon name={hint ? 'bulb' : 'plus'} size={12} color={ink} strokeWidth={2.4} />}
      <Text variant="small" weight="medium" className={picked ? 'text-on-primary' : 'text-primary-fg'}>
        {label}
      </Text>
      {picked ? <Icon name="close" size={12} color={onPrimary} strokeWidth={2.4} /> : null}
    </PressableScale>
  );
}

/** What the entry is, for suggesting tags: its category and merchant, its date, and the words around it. */
export type TagContext = { categoryId?: string | null; merchant?: string | null; date: number; text: string; excludeId?: string };

/**
 * Optional tags for a transaction: picked tags as removable chips, a box to type a new one, and
 * one-tap suggestions. "Suggested" ones fit this entry (your history for this merchant, category and
 * the last few days, then the message wording); the rest are your recent tags. Typing filters them.
 */
export function TagField({
  value,
  onChange,
  context,
  aiHints = [],
  aiSuggest,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  context?: TagContext;
  /** Tags the AI picked for this entry: shown first in the Suggested row. */
  aiHints?: string[];
  /** Adds an "Ask AI" chip: called with every tag name the AI may choose from, returns its picks. */
  aiSuggest?: (tagNames: string[]) => Promise<string[]>;
}) {
  const [subtle] = useThemeColors(['fg-subtle'] as const);
  const { data: used } = useLiveQuery(tagTotals, ['transactions']);
  const { data: history } = useLiveQuery(
    (d) => (context ? tagHints(d, context) : Promise.resolve([])),
    ['transactions'],
    [context?.categoryId, context?.merchant, context?.date, context?.excludeId]
  );
  const [asked, setAsked] = useState<string[] | null>(null);
  const [asking, setAsking] = useState(false);
  const hints = mergeHints([...aiHints, ...(asked ?? []), ...(history ?? [])], context ? ruleTags(context.text) : [], value);
  const [draft, setDraft] = useState('');
  const q = draft.trim().toLowerCase();

  const known = [...(used ?? []).map((u) => u.tag), ...STARTER_TAGS.filter((s) => !(used ?? []).some((u) => u.tag.toLowerCase() === s.toLowerCase()))];
  const suggestions = known.filter((t) => !hasTag(value, t) && (q ? t.toLowerCase().includes(q) : !hasTag(hints, t))).slice(0, SUGGESTIONS);

  const askAi = async () => {
    if (!aiSuggest || asking) return;
    setAsking(true);
    try {
      const picks = await aiSuggest(known);
      setAsked(picks);
    } catch (e) {
      haptic.error();
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setAsking(false);
    }
  };

  const toggle = (tag: string) => {
    haptic.selection();
    onChange(toggleTag(value, tag));
    setDraft('');
  };
  const addDraft = () => {
    const t = cleanTag(draft);
    if (t && !hasTag(value, t)) toggle(t);
    else setDraft('');
  };

  return (
    <View className="gap-2">
      <Text variant="small">Tags (optional)</Text>
      {value.length ? (
        <View className="flex-row flex-wrap gap-2">
          {value.map((t) => (
            <TagChip key={t} label={t} picked onPress={() => toggle(t)} />
          ))}
        </View>
      ) : null}
      <View className="h-10 flex-row items-center gap-2 rounded-[12px] bg-fill px-3">
        <Icon name="tag" size={16} color={subtle} />
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Add a tag, e.g. Goa trip"
          accessibilityLabel="Add a tag"
          autoCorrect={false}
          returnKeyType="done"
          submitBehavior="submit"
          onSubmitEditing={addDraft}
          // A tag typed but not confirmed is kept when the field loses focus (e.g. tapping Save).
          onEndEditing={addDraft}
          className="h-full min-w-0 flex-1"
        />
        {q ? (
          <Pressable onPress={addDraft} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Add tag ${draft.trim()}`}>
            <Text variant="small" weight="medium" tone="primary">
              Add
            </Text>
          </Pressable>
        ) : null}
      </View>
      {(hints.length || (aiSuggest && (asked === null || !asked.length))) && !q ? (
        <View className="flex-row flex-wrap items-center gap-2">
          <Text variant="caption">Suggested</Text>
          {hints.map((t) => (
            <TagChip key={t} label={t} picked={false} hint onPress={() => toggle(t)} />
          ))}
          {asked && !asked.length && !hints.length ? <Text variant="caption">AI: no tag fits</Text> : null}
          {aiSuggest && asked === null ? (
            <PressableScale
              scaleTo={0.96}
              accessibilityRole="button"
              accessibilityLabel="Ask AI for tags"
              disabled={asking}
              onPress={askAi}
              className="h-7 flex-row items-center gap-1 rounded-chip border border-dashed border-line-strong px-3">
              <Icon name="bulb" size={12} color={subtle} strokeWidth={2.4} />
              <Text variant="small" weight="medium">
                {asking ? 'Asking…' : 'Ask AI'}
              </Text>
            </PressableScale>
          ) : null}
        </View>
      ) : null}
      {suggestions.length ? (
        <View className="flex-row flex-wrap items-center gap-2">
          {q ? null : <Text variant="caption">More tags</Text>}
          {suggestions.map((t) => (
            <TagChip key={t} label={t} picked={false} onPress={() => toggle(t)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
