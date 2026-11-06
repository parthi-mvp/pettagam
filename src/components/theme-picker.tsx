import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { toast } from 'sonner-native';
import { useUniwind } from 'uniwind';

import { FONT_FILES, loadFont } from '@/constants/fonts';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/cn';
import { paletteById, PALETTES } from '@/theme/palettes';
import { useThemePreference, type ThemePreference } from '@/theme/themePreference';
import { familiesFor, FONTS, TEXT_SCALES } from '@/theme/typography';
import { useThemeColors } from '@/theme/useThemeColor';

import { Icon, type IconName } from './icons';
import { PressableScale, Text } from './ui';

type Tokens = Record<string, string>;

/** The ring + check every picked tile shares. */
function Check({ show }: { show: boolean }) {
  const [primary, onPrimary] = useThemeColors(['primary', 'on-primary'] as const);
  if (!show) return null;
  return (
    <View className="absolute right-1.5 top-1.5 h-5 w-5 items-center justify-center rounded-full" style={{ backgroundColor: primary }}>
      <Icon name="check" size={12} color={onPrimary} strokeWidth={3} />
    </View>
  );
}

/** Colour theme tiles, three to a row: each previews its own hero panel, accent stripe and button in the current mode. */
export function ThemePicker() {
  const { palette, setPalette } = useThemePreference();
  const mode = useUniwind().theme === 'dark' ? 'dark' : 'light';
  return (
    <View className="flex-row flex-wrap gap-2">
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
            className={cn('w-[31.5%] gap-1.5 rounded-[14px] border-[1.5px] p-1.5', active ? 'border-primary' : 'border-line')}>
            <View className="h-14 justify-between overflow-hidden rounded-[10px] p-2" style={{ backgroundColor: c.hero }}>
              <View className="h-1 w-6 rounded-full" style={{ backgroundColor: c.brass }} />
              <View className="flex-row items-center justify-between">
                <View className="h-2.5 w-8 rounded-full" style={{ backgroundColor: c['on-hero-soft'], opacity: 0.5 }} />
                <View className="h-4 w-4 rounded-full" style={{ backgroundColor: c.primary }} />
              </View>
            </View>
            <View className="px-0.5 pb-0.5">
              <Text variant="label" tone="default" numberOfLines={1}>
                {p.name}
              </Text>
              <Text variant="caption" numberOfLines={2}>
                {p.description}
              </Text>
            </View>
            <Check show={active} />
          </PressableScale>
        );
      })}
    </View>
  );
}

/** A tiny screen in one mode: canvas, a hero bar, a card with two lines and a button dot. */
function MiniScreen({ c, surface }: { c: Tokens; surface: string }) {
  return (
    <View className="flex-1 gap-1 p-1.5" style={{ backgroundColor: c.canvas }}>
      <View className="h-3.5 rounded-[4px]" style={{ backgroundColor: c.hero }} />
      <View className="flex-1 justify-between rounded-[5px] p-1.5" style={{ backgroundColor: surface }}>
        <View className="h-1 w-3/4 rounded-full" style={{ backgroundColor: c.fg, opacity: 0.7 }} />
        <View className="h-1 w-1/2 rounded-full" style={{ backgroundColor: c['fg-muted'], opacity: 0.5 }} />
        <View className="h-2 w-2 self-end rounded-full" style={{ backgroundColor: c.primary }} />
      </View>
    </View>
  );
}

const MODES: { value: ThemePreference; label: string; icon: IconName }[] = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'system', label: 'System', icon: 'phone' },
];

/** Light / Dark / System (follows the phone) as three preview tiles in the current palette; System is half of each. */
export function ModePicker() {
  const { preference, setPreference, palette } = useThemePreference();
  const p = paletteById(palette);
  const [fg, muted] = useThemeColors(['fg', 'fg-muted'] as const);
  // Light palettes leave surface to global.css (white); dark ones set it.
  const light = { c: p.light, surface: p.light.surface ?? '#ffffff' };
  const dark = { c: p.dark, surface: p.dark.surface };
  return (
    <View className="flex-row gap-2" accessibilityRole="radiogroup">
      {MODES.map((m) => {
        const active = m.value === preference;
        return (
          <PressableScale
            key={m.value}
            scaleTo={0.96}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={m.label}
            onPress={() => {
              if (active) return;
              haptic.selection();
              setPreference(m.value);
            }}
            className={cn('flex-1 gap-2 rounded-[14px] border-[1.5px] p-1.5', active ? 'border-primary bg-primary-soft' : 'border-line')}>
            <View className="h-20 flex-row overflow-hidden rounded-[10px] border border-line">
              {m.value !== 'dark' ? <MiniScreen {...light} /> : null}
              {m.value !== 'light' ? <MiniScreen {...dark} /> : null}
            </View>
            <View className="flex-row items-center justify-center gap-1.5 pb-1">
              <Icon name={m.icon} size={14} color={active ? fg : muted} strokeWidth={2.2} />
              <Text variant="small" weight={active ? 'semibold' : 'medium'} tone={active ? 'default' : 'muted'} numberOfLines={1}>
                {m.label}
              </Text>
            </View>
            <Check show={active} />
          </PressableScale>
        );
      })}
    </View>
  );
}

/**
 * Font tiles, two to a row: "Aa" drawn in the font itself, then its name and character. Only the chosen
 * font loads at start-up, so this screen loads the rest for the previews (system font until they arrive).
 */
export function FontPicker() {
  const { font, setFont } = useThemePreference();
  const [fg] = useThemeColors(['fg'] as const);
  const [previews, setPreviews] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all((Object.keys(FONT_FILES) as (keyof typeof FONT_FILES)[]).map(loadFont))
      .then(() => alive && setPreviews(true))
      .catch(() => {}); // previews stay in the system font; picking still loads the chosen one
    return () => {
      alive = false;
    };
  }, []);
  return (
    <View className="flex-row flex-wrap gap-2">
      {FONTS.map((f) => {
        const active = f.id === font;
        // Built-in families (Golos, System) always render; the rest once their files are in.
        const fam = previews || f.id === 'golos' || f.id === 'system' ? familiesFor(f.id, Platform.OS) : null;
        return (
          <PressableScale
            key={f.id}
            scaleTo={0.96}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={`${f.name}: ${f.description}`}
            disabled={!!switching}
            onPress={() => {
              if (active) return;
              haptic.selection();
              setSwitching(f.id);
              setFont(f.id)
                .catch(() => toast.error(`Couldn’t load ${f.name}`))
                .finally(() => setSwitching(null));
            }}
            className={cn('w-[48.5%] flex-row items-center gap-3 rounded-[14px] border-[1.5px] p-2.5', active ? 'border-primary bg-primary-soft' : 'border-line')}>
            {/* Raw sizes on purpose: each tile previews its own face, whatever font and size are picked. */}
            <Text style={{ fontFamily: fam?.[600], fontSize: 26, lineHeight: 32, color: fg }}>Aa</Text>
            <View className="min-w-0 flex-1">
              <Text style={{ fontFamily: fam?.[600], fontSize: 15, lineHeight: 20, color: fg }} numberOfLines={1}>
                {f.name}
              </Text>
              <Text variant="caption" numberOfLines={1}>
                {switching === f.id ? 'Loading…' : f.description}
              </Text>
            </View>
            <Check show={active} />
          </PressableScale>
        );
      })}
    </View>
  );
}

/** Text size: four "A"s that grow left to right, then a live sample line in the chosen size. */
export function TextSizePicker() {
  const { textScale, setTextScale } = useThemePreference();
  const [fg, muted] = useThemeColors(['fg', 'fg-muted'] as const);
  return (
    <View className="gap-3">
      <View className="flex-row gap-2" accessibilityRole="radiogroup">
        {TEXT_SCALES.map((s) => {
          const active = s.id === textScale;
          return (
            <PressableScale
              key={s.id}
              scaleTo={0.96}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={`Text size ${s.label}`}
              onPress={() => {
                if (active) return;
                haptic.selection();
                setTextScale(s.id);
              }}
              className={cn('h-20 flex-1 items-center justify-end gap-1 rounded-[14px] border-[1.5px] pb-2', active ? 'border-primary bg-primary-soft' : 'border-line')}>
              <Text weight="semibold" style={{ fontSize: Math.round(20 * s.scale), lineHeight: Math.round(26 * s.scale), color: active ? fg : muted }}>
                A
              </Text>
              <Text variant="caption" weight={active ? 'semibold' : 'regular'} tone={active ? 'default' : 'muted'} numberOfLines={1}>
                {s.label}
              </Text>
            </PressableScale>
          );
        })}
      </View>
      <View className="gap-0.5 rounded-input bg-fill p-3">
        <Text weight="medium">Swiggy · Food & Dining</Text>
        <Text variant="small">Today, 1:24 pm · HDFC ••4521 · ₹450 spent</Text>
      </View>
    </View>
  );
}
