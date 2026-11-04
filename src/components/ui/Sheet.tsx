import { TrueSheet, type SheetDetent } from '@lodev09/react-native-true-sheet';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ComponentRef, type ReactElement, type ReactNode, type RefObject } from 'react';
import { ScrollView, View } from 'react-native';

import { cn } from '@/lib/cn';
import { useThemeColor } from '@/theme/useThemeColor';

import { Text } from './Text';

export interface SheetRef {
  present: () => void;
  dismiss: () => void;
}

export interface SheetProps {
  children: ReactNode;
  /** A unique name lets you open it without a ref: `presentSheet("quick-add")`. */
  name?: string;
  title?: string;
  subtitle?: string;
  /** Heights as fractions of the screen (0.5, 1) or "auto" (fit content, the default). */
  detents?: SheetDetent[];
  /** Content scrolls inside the sheet (long lists, forms). Defaults detents to [0.6, 1]. */
  scrollable?: boolean;
  /** Pinned to the bottom edge, above the keyboard (a Save button). */
  footer?: ReactElement;
  /** Build the content on first open instead of with the screen (long lists in forms). */
  lazy?: boolean;
  /** The user may swipe it away / tap outside. Default true. */
  dismissible?: boolean;
  contentClassName?: string;
  onDismiss?: () => void;
  onPresent?: () => void;
}

/**
 * A native bottom sheet (UISheetPresentationController on iOS, Material sheet on Android): native
 * drag, detents, keyboard avoidance and back-button handling.
 *
 *   const ref = useRef<SheetRef>(null);
 *   <Sheet ref={ref} title="Add">…</Sheet>
 *   ref.current?.present();
 *
 * Mount it in the screen body, never inside a navigation header (on Android the closed sheet's
 * native view would swallow taps on the screen below).
 */
export const Sheet = forwardRef<SheetRef, SheetProps>(function Sheet(
  { children, name, title, subtitle, detents, scrollable = false, footer, dismissible = true, contentClassName, onDismiss, onPresent, lazy = false },
  ref
) {
  const sheetRef = useRef<TrueSheet>(null);
  // Lazy: build the content on first open (then keep it), so a closed sheet costs nothing.
  const [mounted, setMounted] = useState(!lazy);
  const pendingPresent = useRef(false);
  useEffect(() => {
    if (mounted && pendingPresent.current) {
      pendingPresent.current = false;
      void sheetRef.current?.present();
    }
  }, [mounted]);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const background = useThemeColor('sheet');
  const grabber = useThemeColor('line-strong');

  useImperativeHandle(ref, () => ({
    present: () => {
      if (mounted) return void sheetRef.current?.present();
      pendingPresent.current = true;
      setMounted(true);
    },
    dismiss: () => void sheetRef.current?.dismiss(),
  }));

  const heading =
    title || subtitle ? (
      <View className="gap-0.5 px-5 pt-6 pb-2">
        {title ? (
          <Text variant="heading" accessibilityRole="header" className="text-3xl" style={{ letterSpacing: -0.3 }}>
            {title}
          </Text>
        ) : null}
        {subtitle ? <Text variant="small">{subtitle}</Text> : null}
      </View>
    ) : null;

  const body = <View className={cn('gap-3 px-5 pb-8', !heading && 'pt-6', contentClassName)}>{mounted ? children : null}</View>;

  return (
    <TrueSheet
      ref={sheetRef}
      name={name}
      detents={detents ?? (scrollable ? [0.6, 1] : ['auto'])}
      backgroundColor={background}
      cornerRadius={28}
      grabberOptions={{ color: grabber }}
      dismissible={dismissible}
      header={heading ?? undefined}
      footer={footer}
      // RN 0.88 types ScrollView as a function component; TrueSheet wants the host ref.
      scrollableRef={scrollable ? (scrollRef as unknown as RefObject<{ getScrollableNode(): unknown }>) : undefined}
      onDidDismiss={() => onDismiss?.()}
      onDidPresent={() => onPresent?.()}>
      {scrollable ? (
        <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
          {body}
        </ScrollView>
      ) : (
        body
      )}
    </TrueSheet>
  );
});

/** Open / close a `<Sheet name="…">` without a ref. */
export const presentSheet = (name: string) => void TrueSheet.present(name);
export const dismissSheet = (name: string) => void TrueSheet.dismiss(name);
