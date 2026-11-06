import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Platform, View } from 'react-native';

import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/cn';
import { dateLabel, parseDate, toInputDate } from '@/lib/format';
import { useThemeColor } from '@/theme/useThemeColor';

import { Icon } from '../icons';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { FIELD_SURFACE } from './TextField';

/**
 * Date picker that looks like a Field. Value is the same "DD/MM/YYYY" string the forms already keep
 * (empty = not set), so callers swap it in for a Field without changing their state.
 * Android opens the system dialog; iOS shows the native compact picker inline.
 */
/** Unset dates fall back to today only when the dialog opens (kept out of render for the purity lint). */
function openAndroidPicker(ms: number | null, onChange: (e: DateTimePickerEvent, d?: Date) => void) {
  DateTimePickerAndroid.open({ value: new Date(ms ?? Date.now()), mode: 'date', onChange });
}

export function DateField({ label, value, onChange, hint }: { label: string; value: string; onChange: (s: string) => void; hint?: string }) {
  const [ink, muted] = [useThemeColor('fg'), useThemeColor('fg-muted')];
  const ms = parseDate(value);
  const pick = (_e: DateTimePickerEvent, d?: Date) => d && onChange(toInputDate(d.getTime()));
  return (
    <View className="gap-1.5">
      <Text variant="small">{label}</Text>
      {Platform.OS === 'ios' ? (
        <View className={`h-10 flex-row items-center justify-between rounded-[12px] border pl-3 pr-1.5 ${FIELD_SURFACE}`}>
          <Text tone={ms ? 'default' : 'subtle'}>{ms ? dateLabel(ms) : 'Not set'}</Text>
          <DateTimePicker value={ms ? new Date(ms) : new Date(2000, 0, 1)} mode="date" display="compact" onChange={pick} accentColor={ink} />
        </View>
      ) : (
        <PressableScale
          scaleTo={0.99}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${ms ? dateLabel(ms) : 'not set'}`}
          onPress={() => openAndroidPicker(ms, pick)}
          className={`h-10 flex-row items-center justify-between rounded-[12px] border px-3 ${FIELD_SURFACE}`}>
          <Text tone={ms ? 'default' : 'subtle'}>{ms ? dateLabel(ms) : 'Pick a date'}</Text>
          <Icon name="calendar" size={18} color={muted} />
        </PressableScale>
      )}
      {hint ? <Text variant="caption" tone="subtle">{hint}</Text> : null}
    </View>
  );
}

/** Single-choice chips: 8px radius, primary when selected, Vault 100 otherwise. */
export function Chips<V extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: V; label: string; color?: string }[];
  value: V | null;
  onChange: (v: V) => void;
  label?: string;
}) {
  return (
    <View className="gap-1.5">
      {label ? <Text variant="label">{label}</Text> : null}
      <View className="flex-row flex-wrap gap-2">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <PressableScale
              key={o.value}
              scaleTo={0.96}
              accessibilityState={{ selected: active }}
              onPress={() => {
                if (!active) haptic.selection();
                onChange(o.value);
              }}
              className={cn('h-7 flex-row items-center gap-1.5 rounded-chip px-3', active ? 'bg-primary' : 'bg-primary-soft')}>
              {o.color && !active ? <View className="h-2 w-2 rounded-full" style={{ backgroundColor: o.color }} /> : null}
              <Text variant="small" weight="medium" className={active ? 'text-on-primary' : 'text-primary-fg'}>{o.label}</Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

/** Two or three mutually exclusive views (Expense / Income / Transfer): a sunken track with a raised active segment. */
export function SegmentedControl<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View className="h-10 flex-row rounded-input bg-fill p-1" accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <PressableScale
            key={o.value}
            scaleTo={0.98}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (!active) haptic.selection();
              onChange(o.value);
            }}
            className={cn('flex-1 items-center justify-center rounded-[10px]', active && 'bg-surface shadow-card dark:bg-raised dark:shadow-none')}>
            <Text variant="label" tone={active ? 'default' : 'muted'}>
              {o.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}
