import { View } from 'react-native';
import { useUniwind } from 'uniwind';

import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/cn';
import { PALETTES } from '@/theme/palettes';
import { useThemePreference } from '@/theme/themePreference';

import { Icon } from './icons';
import { PressableScale, Text } from './ui';

/** Colour theme tiles: each previews its own hero panel, accent stripe and primary button in the current mode. */
export function ThemePicker() {
  const { palette, setPalette } = useThemePreference();
  const mode = useUniwind().theme === 'dark' ? 'dark' : 'light';
  return (
    <View className="flex-row gap-2">
      {PALETTES.map((p) => {
        const c = p[mode];
        const active = p.id === palette;
        return (
          <PressableScale
            key={p.id}
            scaleTo={0.96}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={`${p.name}: ${p.description}`}
            onPress={() => {
              if (active) return;
              haptic.selection();
              setPalette(p.id);
            }}
            className={cn('flex-1 gap-2 rounded-[14px] border-[1.5px] p-1.5', active ? 'border-primary' : 'border-line')}>
            <View className="h-16 justify-between overflow-hidden rounded-[10px] p-2" style={{ backgroundColor: c.hero }}>
              <View className="h-1 w-6 rounded-full" style={{ backgroundColor: c.brass }} />
              <View className="flex-row items-center justify-between">
                <View className="h-3 w-10 rounded-full" style={{ backgroundColor: c['on-hero-soft'], opacity: 0.5 }} />
                <View className="h-5 w-5 items-center justify-center rounded-full" style={{ backgroundColor: c.primary }}>
                  {active ? <Icon name="check" size={12} color={c['on-primary']} strokeWidth={2.6} /> : null}
                </View>
              </View>
            </View>
            <View className="px-1 pb-0.5">
              <Text variant="label" tone="default">{p.name}</Text>
              <Text variant="caption" numberOfLines={2}>{p.description}</Text>
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}
