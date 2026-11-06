import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { toast } from 'sonner-native';

import { useLiveQuery } from '@/db/events';
import { tagHints, tagTotals } from '@/db/repo';
import { haptic } from '@/lib/haptics';
import { aiReady, useAi } from '@/ai/client';
import { aiCompleteTag } from '@/ai/features';
import { cleanTag, closeTag, hasTag, mergeHints, rankTagMatches, ruleTags, STARTER_TAGS, toggleTag } from '@/lib/tags';
import { useThemeColors } from '@/theme/useThemeColor';

import { AiThinking } from './ai-thinking';
import { Icon } from './icons';
import { FIELD_SURFACE, PressableScale, Text, TextInput } from './ui';

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
  onFocusChange,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  context?: TagContext;
  /** Tags the AI picked for this entry: shown first in the Suggested row. */
  aiHints?: string[];
  /** Adds an "Ask AI" chip: called with every tag name the AI may choose from, returns its picks. */
  aiSuggest?: (tagNames: string[]) => Promise<string[]>;
  /** The tag box gained or lost focus (the form hides its sticky Save bar so suggestions aren't covered). */
  onFocusChange?: (focused: boolean) => void;
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
  // Typing: your own tags first, typos forgiven ("goa trp" → Goa trip). Not typing: the rest of your tags.
  const suggestions = (q ? rankTagMatches(draft, known) : known.filter((t) => !hasTag(hints, t)))
    .filter((t) => !hasTag(value, t))
    .slice(0, SUGGESTIONS);

  // Then the AI, once typing pauses: up to 3 ideas for this entry around what's typed. Debounced, at
  // least 3 letters, and skipped when one of your tags already matches exactly.
  const aiOn = useAi(aiReady);
  const [typedAi, setTypedAi] = useState<{ q: string; tags: string[] } | null>(null);
  const latest = useRef('');
  const exactLocal = known.some((t) => t.toLowerCase() === q);
  useEffect(() => {
    latest.current = q;
    if (!aiOn || q.length < 3 || exactLocal) return;
    const timer = setTimeout(() => {
      aiCompleteTag(q, context?.text ?? '', known)
        .then((tags) => latest.current === q && setTypedAi({ q, tags }))
        .catch(() => {}); // quiet: your own tags are still there
    }, 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, aiOn, exactLocal]);
  const aiTyped = typedAi && typedAi.q === q ? typedAi.tags.filter((t) => !hasTag(value, t) && !hasTag(suggestions, t)) : [];
  const aiWaiting = aiOn && q.length >= 3 && !exactLocal && typedAi?.q !== q;

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
  // A typed tag that's really one you have ("goa trip", "Goa trp") uses yours, so typos don't make near-copies.
  const addDraft = () => {
    const t = cleanTag(draft);
    if (!t) return setDraft('');
    const mine = closeTag(t, known);
    if (mine && mine !== t && !hasTag(value, mine)) toast.info(`Used your tag “${mine}”`);
    const tag = mine ?? t;
    if (!hasTag(value, tag)) toggle(tag);
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
      <View className={`h-10 flex-row items-center gap-2 rounded-[12px] border px-3 ${FIELD_SURFACE}`}>
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
          onFocus={() => onFocusChange?.(true)}
          onBlur={() => onFocusChange?.(false)}
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
          {aiSuggest && asked === null && asking ? <AiThinking label="Asking AI" chips={2} /> : null}
          {aiSuggest && asked === null && !asking ? (
            <PressableScale
              scaleTo={0.96}
              accessibilityRole="button"
              accessibilityLabel="Ask AI for tags"
              disabled={asking}
              onPress={askAi}
              className="h-7 flex-row items-center gap-1 rounded-chip border border-dashed border-line-strong px-3">
              <Icon name="bulb" size={12} color={subtle} strokeWidth={2.4} />
              <Text variant="small" weight="medium">
                Ask AI
              </Text>
            </PressableScale>
          ) : null}
        </View>
      ) : null}
      {suggestions.length ? (
        <View className="flex-row flex-wrap items-center gap-2">
          <Text variant="caption">{q ? 'Your tags' : 'More tags'}</Text>
          {suggestions.map((t) => (
            <TagChip key={t} label={t} picked={false} onPress={() => toggle(t)} />
          ))}
        </View>
      ) : null}
      {q && aiWaiting ? <AiThinking chips={2} /> : null}
      {q && !aiWaiting && aiTyped.length ? (
        <View className="flex-row flex-wrap items-center gap-2">
          <Text variant="caption">AI</Text>
          {aiTyped.map((t) => (
            <TagChip key={t} label={t} picked={false} hint onPress={() => toggle(t)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
