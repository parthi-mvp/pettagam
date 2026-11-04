import { router, Stack } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { aiReady, useAi } from '@/ai/client';
import { aiAsk, moneySnapshot, type Turn } from '@/ai/features';
import { Icon, type IconName } from '@/components/icons';
import { Button, GroupLabel, IconTile, PressableScale, Text, TextInput } from '@/components/ui';
import { Motion } from '@/constants/theme';
import { useKeyboardVisible } from '@/hooks/use-keyboard-visible';
import { cn } from '@/lib/cn';
import { haptic } from '@/lib/haptics';
import { useThemeColors } from '@/theme/useThemeColor';

const STARTERS: { q: string; icon: IconName }[] = [
  { q: 'How much did I spend on food last month?', icon: 'bag' },
  { q: 'Where can I cut back?', icon: 'pie' },
  { q: 'Can I save ₹5 lakh by December 2027?', icon: 'trend' },
  { q: 'How has my spending changed this year?', icon: 'list' },
  { q: 'Which month did I spend the most?', icon: 'calendar' },
  { q: 'What’s my net worth?', icon: 'bank' },
];

export default function Ask() {
  const db = useSQLiteContext();
  const ai = useAi(aiReady);
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyboard = useKeyboardVisible();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  // Built once per visit so follow-up questions are fast; reopen the screen for fresh numbers.
  const snapshot = useRef<object | null>(null);

  /** Answer the last user turn of `history`. On failure the question stays, with a retry. */
  const answer = async (history: Turn[]) => {
    setBusy(true);
    setError(null);
    try {
      snapshot.current ??= await moneySnapshot(db);
      const reply = await aiAsk(snapshot.current, history);
      setTurns([...history, { role: 'assistant', content: reply.trim() }]);
      haptic.light();
    } catch (e) {
      haptic.error();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const send = (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    const history: Turn[] = [...turns, { role: 'user', content: question }];
    setTurns(history);
    setQ('');
    answer(history);
  };

  const reset = () => {
    haptic.selection();
    setTurns([]);
    setError(null);
    snapshot.current = null;
  };

  if (!ai) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-canvas px-8">
        <IconTile icon="bulb" tone="brass" size={64} />
        <Text variant="title" align="center" className="text-[22px]">Ask about your money</Text>
        <Text variant="muted" align="center">
          Turn on the AI assistant and add your API key to chat about your spending, savings and goals.
        </Text>
        <Button title="Open AI settings" variant="secondary" onPress={() => router.push('/more')} className="mt-2" />
      </View>
    );
  }

  const canSend = !!q.trim() && !busy;

  return (
    <KeyboardAvoidingView className="flex-1 bg-canvas" behavior="padding" keyboardVerticalOffset={headerHeight}>
      <Stack.Screen
        options={{
          title: 'Ask your money',
          headerRight: turns.length
            ? () => (
                <Pressable onPress={reset} hitSlop={12} accessibilityRole="button" className="active:opacity-60">
                  <Text variant="label" tone="primary">New chat</Text>
                </Pressable>
              )
            : undefined,
        }}
      />

      <ScrollView
        ref={scroll}
        className="flex-1"
        contentContainerClassName="grow gap-3 px-gutter py-4"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onContentSizeChange={() => turns.length && scroll.current?.scrollToEnd({ animated: true })}>
        {turns.length === 0 ? (
          <Welcome onPick={send} />
        ) : (
          <>
            {turns.map((t, i) => (t.role === 'user' ? <UserBubble key={i} text={t.content} /> : <BotBubble key={i} text={t.content} />))}
            {busy ? <Typing /> : null}
            {error && !busy ? (
              <Animated.View entering={FadeIn.duration(Motion.fast)} className="ml-9 gap-2 self-start rounded-[16px] border border-danger/30 bg-surface px-3.5 py-2.5">
                <Text variant="small" tone="danger">{error}</Text>
                <Pressable onPress={() => answer(turns)} hitSlop={8} accessibilityRole="button" className="self-start active:opacity-60">
                  <Text variant="label" tone="primary">Try again</Text>
                </Pressable>
              </Animated.View>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* Composer, stuck to the bottom and lifted with the keyboard */}
      <View className="border-t border-line bg-canvas px-gutter pt-2" style={{ paddingBottom: keyboard ? 8 : insets.bottom + 8 }}>
        <View className="flex-row items-end gap-2 rounded-[24px] border border-line bg-surface py-1.5 pl-4 pr-1.5">
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Ask about your spending, savings…"
            multiline
            accessibilityLabel="Your question"
            className="max-h-[120px] min-h-9 flex-1 py-2"
            submitBehavior="submit"
            returnKeyType="send"
            onSubmitEditing={() => send(q)}
          />
          <SendButton enabled={canSend} onPress={() => send(q)} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Welcome({ onPick }: { onPick: (q: string) => void }) {
  const [muted, subtle] = useThemeColors(['fg-muted', 'fg-subtle'] as const);
  return (
    <View className="flex-1 gap-5">
      <Animated.View entering={FadeInDown.duration(Motion.base)} className="items-center gap-2 px-4 pt-6">
        <IconTile icon="bulb" tone="brass" size={60} />
        <Text variant="title" align="center" className="text-[22px]">Ask about your money</Text>
        <Text variant="muted" align="center">
          Spending, savings, goals: ask in plain words, in English or Tamil.
        </Text>
      </Animated.View>

      <View className="gap-2">
        <GroupLabel>Try asking</GroupLabel>
        {STARTERS.map((s, i) => (
          <Animated.View key={s.q} entering={FadeInDown.duration(Motion.base).delay((i + 1) * Motion.stagger)}>
            <PressableScale
              scaleTo={0.98}
              onPress={() => onPick(s.q)}
              accessibilityRole="button"
              className="flex-row items-center gap-3 rounded-card border border-line bg-surface px-3 py-2.5">
              <IconTile icon={s.icon} size={32} />
              <Text className="flex-1">{s.q}</Text>
              <Icon name="arrowRight" size={16} color={subtle} />
            </PressableScale>
          </Animated.View>
        ))}
      </View>

      <View className="mt-auto flex-row items-start gap-2 px-1">
        <Icon name="lock" size={14} color={muted} />
        <Text variant="caption" className="flex-1">
          Answers use monthly totals, balances and net worth from this phone. Individual transactions and SMS aren’t sent.
        </Text>
      </View>
    </View>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <Animated.View entering={FadeInDown.duration(Motion.fast)} className="max-w-[85%] self-end rounded-[20px] rounded-br-[6px] bg-primary px-3.5 py-2.5">
      <Text selectable className="text-on-primary">{text}</Text>
    </Animated.View>
  );
}

function BotBubble({ text }: { text: string }) {
  return (
    <Animated.View entering={FadeInDown.duration(Motion.base)} className="max-w-[88%] flex-row items-end gap-2 self-start">
      <Avatar />
      <View className="shrink gap-1.5 rounded-[20px] rounded-bl-[6px] border border-line bg-surface px-3.5 py-2.5">
        <RichText text={text} />
      </View>
    </Animated.View>
  );
}

function Avatar() {
  return <IconTile icon="bulb" tone="brass" size={28} />;
}

/** Just enough markdown for chat answers: paragraphs, "- " bullets and **bold**. */
function RichText({ text }: { text: string }) {
  const inline = (line: string) =>
    line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <Text key={i} weight="semibold">{part.slice(2, -2)}</Text>
      ) : (
        part
      )
    );
  return (
    <>
      {text
        .split('\n')
        .filter((l) => l.trim())
        .map((line, i) => {
          const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/);
          return bullet ? (
            <View key={i} className="flex-row gap-2 pl-0.5">
              <Text>•</Text>
              <Text selectable className="flex-1">{inline(bullet[1])}</Text>
            </View>
          ) : (
            <Text key={i} selectable>{inline(line.replace(/^#+\s*/, ''))}</Text>
          );
        })}
    </>
  );
}

function Typing() {
  return (
    <Animated.View entering={FadeIn.duration(Motion.fast)} className="flex-row items-end gap-2 self-start" accessibilityLabel="Thinking">
      <Avatar />
      <View className="h-10 flex-row items-center gap-1 rounded-[20px] rounded-bl-[6px] border border-line bg-surface px-4">
        {[0, 1, 2].map((i) => (
          <Dot key={i} delay={i * 160} />
        ))}
      </View>
    </Animated.View>
  );
}

function Dot({ delay }: { delay: number }) {
  const v = useSharedValue(0.3);
  useEffect(() => {
    v.set(withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 360 }), withTiming(0.3, { duration: 360 })), -1)));
  }, [v, delay]);
  const style = useAnimatedStyle(() => ({ opacity: v.get(), transform: [{ translateY: (1 - v.get()) * 2 }] }));
  return <Animated.View className="h-2 w-2 rounded-full bg-fg-muted" style={style} />;
}

function SendButton({ enabled, onPress }: { enabled: boolean; onPress: () => void }) {
  const [onPrimary, subtle] = useThemeColors(['on-primary', 'fg-subtle'] as const);
  return (
    <PressableScale
      scaleTo={0.9}
      disabled={!enabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Send"
      className={cn('h-9 w-9 items-center justify-center rounded-full', enabled ? 'bg-primary' : 'bg-fill')}>
      <Icon name="arrowRight" size={18} color={enabled ? onPrimary : subtle} strokeWidth={2.4} />
    </PressableScale>
  );
}
