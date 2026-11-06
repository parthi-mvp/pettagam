import { useEffect, useRef } from 'react';
import { BackHandler, Modal, Pressable, View } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { create } from 'zustand';

import { cn } from '@/lib/cn';
import { haptic } from '@/lib/haptics';
import { EASE_OUT } from '@/theme/motion';

import { PressableScale } from './PressableScale';
import { Text } from './Text';

/**
 * The app's own alert and confirm dialog, in its theme, replacing the system one. Same call shape as
 * React Native's Alert.alert, so any call site reads the same:
 *
 *   dialog('Delete goal?', 'Your entries stay.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress }])
 *
 * No buttons = a single OK. Rendered once by <DialogHost /> at the root; a second dialog asked for while
 * one is open waits its turn.
 */
export type DialogButton = { text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void };
type Request = { title: string; message?: string; buttons: DialogButton[] };

const useDialogs = create<{ queue: Request[] }>(() => ({ queue: [] }));

export function dialog(title: string, message?: string, buttons?: DialogButton[]) {
  const list = buttons?.length ? buttons : [{ text: 'OK' }];
  useDialogs.setState((s) => ({ queue: [...s.queue, { title, message, buttons: list }] }));
}

const ENTER_MS = 200;
const EXIT_MS = 140;

export function DialogHost() {
  // The open dialog is the head of the queue; it leaves the queue once its exit has played.
  const shown = useDialogs((s) => s.queue[0] ?? null);
  const p = useSharedValue(0);
  const closing = useRef(false);

  useEffect(() => {
    if (!shown) return;
    closing.current = false;
    if (shown.buttons.some((b) => b.style === 'destructive')) haptic.warning();
    p.set(0);
    p.set(withTiming(1, { duration: ENTER_MS, easing: EASE_OUT, reduceMotion: ReduceMotion.System }));
  }, [shown, p]);

  // Close fast, then run the button's action and show the next one in line. One press only.
  const close = (button?: DialogButton) => {
    if (closing.current) return;
    closing.current = true;
    const finish = () => {
      useDialogs.setState((s) => ({ queue: s.queue.slice(1) }));
      button?.onPress?.();
    };
    p.set(withTiming(0, { duration: EXIT_MS, easing: EASE_OUT, reduceMotion: ReduceMotion.System }, (done) => {
      if (done) scheduleOnRN(finish);
    }));
  };

  const cancel = shown?.buttons.find((b) => b.style === 'cancel');
  // Back button / backdrop: the cancel choice, or the only button when there's just one.
  const dismiss = () => {
    if (!shown) return;
    if (cancel) close(cancel);
    else if (shown.buttons.length === 1) close(shown.buttons[0]);
  };
  useEffect(() => {
    if (!shown) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => (dismiss(), true));
    return () => sub.remove();
  });

  const backdrop = useAnimatedStyle(() => ({ opacity: p.get() }));
  const card = useAnimatedStyle(() => ({ opacity: p.get(), transform: [{ scale: 0.96 + 0.04 * p.get() }] }));

  if (!shown) return null;
  // Cancel first (left / top), the action last, as people expect.
  const ordered = [...shown.buttons].sort((a, b) => (a.style === 'cancel' ? -1 : b.style === 'cancel' ? 1 : 0));
  const row = ordered.length === 2 && ordered.every((b) => b.text.length <= 14);

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={dismiss}>
      <Animated.View className="absolute inset-0 bg-black/50" style={backdrop}>
        <Pressable className="flex-1" onPress={dismiss} accessibilityLabel="Close" />
      </Animated.View>
      <View className="flex-1 items-center justify-center px-8" pointerEvents="box-none">
        <Animated.View
          className="w-full max-w-[360px] gap-5 rounded-[24px] border border-line bg-surface p-6 shadow-card dark:bg-raised"
          style={card}
          accessibilityViewIsModal
          accessibilityRole="alert">
          <View className="gap-2">
            <Text variant="heading" className="text-[19px]">
              {shown.title}
            </Text>
            {shown.message ? <Text variant="muted">{shown.message}</Text> : null}
          </View>
          <View className={cn('gap-2.5', row && 'flex-row')}>
            {ordered.map((b) => {
              const kind = b.style === 'cancel' ? 'cancel' : b.style === 'destructive' ? 'danger' : 'primary';
              return (
                <PressableScale
                  key={b.text}
                  scaleTo={0.97}
                  accessibilityRole="button"
                  onPress={() => close(b)}
                  className={cn(
                    'h-12 items-center justify-center rounded-[14px] px-4',
                    row && 'flex-1',
                    kind === 'cancel' && 'bg-fill',
                    kind === 'danger' && 'bg-danger',
                    kind === 'primary' && 'bg-primary'
                  )}>
                  <Text weight="semibold" className={cn('text-lg', kind === 'cancel' ? 'text-fg' : kind === 'primary' ? 'text-on-primary' : 'text-white')} numberOfLines={1}>
                    {b.text}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
