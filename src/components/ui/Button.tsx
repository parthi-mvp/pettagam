import { ActivityIndicator } from 'react-native';
import { tv, type VariantProps } from 'tailwind-variants';

import { cn } from '@/lib/cn';
import { useThemeColor } from '@/theme/useThemeColor';
import type { ColorToken } from '@/theme/tokens';

import { Icon, type IconName } from '../icons';
import { PressableScale, type PressableScaleProps } from './PressableScale';
import { Text } from './Text';

/**
 * Buttons. Pick a `variant` for the role and a `size`; never hand-build a pressable with a fill.
 *   primary — one per screen · secondary — the rest · tinted — soft inline action ("Review")
 *   brass — the add action · link — inline text action · danger — confirm something destructive
 *   size sm 36 · md 44 (default) · lg 48 (the main form submit)
 */
const button = tv({
  slots: {
    root: 'flex-row items-center justify-center rounded-button',
    label: 'text-center font-medium',
  },
  variants: {
    variant: {
      primary: { root: 'bg-primary shadow-primary dark:shadow-none', label: 'text-on-primary' },
      brass: { root: 'bg-brass', label: 'text-on-brass' },
      secondary: { root: 'border-[1.5px] border-border-strong bg-surface', label: 'text-fg' },
      tinted: { root: 'bg-primary-soft', label: 'text-primary' },
      danger: { root: 'border-[1.5px] border-danger bg-surface', label: 'text-danger' },
      link: { root: 'bg-transparent', label: 'text-primary' },
    },
    size: {
      sm: { root: 'h-9 gap-1.5 rounded-[10px] px-3', label: 'text-base' },
      md: { root: 'h-11 gap-2 px-4', label: 'text-xl' },
      lg: { root: 'h-12 gap-2 px-5', label: 'text-xl' },
    },
    fullWidth: { true: { root: 'w-full' } },
    disabled: { true: { root: 'opacity-50' } },
  },
  compoundVariants: [
    { variant: 'link', size: 'md', class: { root: 'h-10' } },
    { variant: 'primary', size: 'sm', class: { root: 'shadow-none' } },
  ],
  defaultVariants: { variant: 'primary', size: 'md' },
});

export type ButtonVariants = VariantProps<typeof button>;
type Variant = NonNullable<ButtonVariants['variant']>;

const INK: Record<Variant, ColorToken> = {
  primary: 'on-primary',
  brass: 'on-brass',
  secondary: 'fg',
  tinted: 'primary',
  danger: 'danger',
  link: 'primary',
};

export interface ButtonProps extends Omit<PressableScaleProps, 'children' | 'disabled'>, ButtonVariants {
  title: string;
  /** Icon before the label. */
  icon?: IconName;
  /** Icon after the label (an arrow on a "continue" action). */
  trailingIcon?: IconName;
  loading?: boolean;
}

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  fullWidth,
  disabled,
  loading,
  icon,
  trailingIcon,
  className,
  ...props
}: ButtonProps) {
  const slots = button({ variant, size, fullWidth, disabled: !!(disabled || loading) });
  const ink = useThemeColor(INK[variant]);
  const iconSize = size === 'sm' ? 16 : 18;
  return (
    <PressableScale
      className={cn(slots.root(), className)}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      haptic={variant === 'primary' || variant === 'brass' ? 'light' : undefined}
      {...props}>
      {loading ? (
        <ActivityIndicator color={ink} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={iconSize} color={ink} /> : null}
          <Text className={slots.label()}>{title}</Text>
          {trailingIcon ? <Icon name={trailingIcon} size={iconSize} color={ink} strokeWidth={2} /> : null}
        </>
      )}
    </PressableScale>
  );
}

/** Square 44pt icon-only control (header actions). */
export function IconButton({ icon, label, onPress, className }: { icon: IconName; label: string; onPress: () => void; className?: string }) {
  const ink = useThemeColor('fg');
  return (
    <PressableScale
      accessibilityLabel={label}
      scaleTo={0.94}
      hitSlop={4}
      onPress={onPress}
      className={cn('h-10 w-10 items-center justify-center rounded-input border border-line bg-surface', className)}>
      <Icon name={icon} size={18} color={ink} />
    </PressableScale>
  );
}
