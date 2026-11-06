import Storage from 'expo-sqlite/kv-store';
import { Uniwind } from 'uniwind';
import { create } from 'zustand';

import { paletteById, type PaletteId, toCSSVariables } from './palettes';
import { Platform } from 'react-native';

import { loadFont } from '@/constants/fonts';

import { fontById, scaleById, typographyVariables, type FontId, type TextScaleId } from './typography';

/** Settings → Appearance. "system" follows the phone. */
export type ThemePreference = 'system' | 'light' | 'dark';

const KEY = 'appearance.theme';
const PALETTE_KEY = 'appearance.palette';
const FONT_KEY = 'appearance.font';
const SCALE_KEY = 'appearance.textScale';

interface ThemePreferenceState {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  palette: PaletteId;
  setPalette: (palette: PaletteId) => void;
  font: FontId;
  setFont: (font: FontId) => Promise<void>;
  textScale: TextScaleId;
  setTextScale: (scale: TextScaleId) => void;
}

/** Repaint both built-in themes, so light/dark and "same as phone" keep working with any palette. */
function applyPalette(id: string) {
  const p = paletteById(id);
  Uniwind.updateCSSVariables('light', toCSSVariables(p.light));
  Uniwind.updateCSSVariables('dark', toCSSVariables(p.dark));
  return p.id;
}

/** Font and text size: both modes carry the same type, so a light/dark switch keeps it. */
function applyTypography(fontId: string, scaleId: string) {
  const vars = typographyVariables(fontId, scaleId, Platform.OS);
  Uniwind.updateCSSVariables('light', vars);
  Uniwind.updateCSSVariables('dark', vars);
}

/** Uniwind does the switching; this store remembers the choice on the device. */
export const useThemePreference = create<ThemePreferenceState>((set, get) => ({
  preference: 'system',
  setPreference: (preference) => {
    Uniwind.setTheme(preference);
    set({ preference });
    Storage.setItem(KEY, preference).catch(() => {});
  },
  palette: 'vault',
  setPalette: (palette) => {
    applyPalette(palette);
    set({ palette });
    Storage.setItem(PALETTE_KEY, palette).catch(() => {});
  },
  font: 'golos',
  setFont: async (font) => {
    // Load first: switching to a font whose files aren't in yet would draw the text in the system font.
    await loadFont(font);
    applyTypography(font, get().textScale);
    set({ font });
    Storage.setItem(FONT_KEY, font).catch(() => {});
  },
  textScale: 'default',
  setTextScale: (textScale) => {
    applyTypography(get().font, textScale);
    set({ textScale });
    Storage.setItem(SCALE_KEY, textScale).catch(() => {});
  },
}));

/** Apply the saved appearance synchronously at start-up, before the first frame. */
export function restoreThemePreference() {
  let preference: ThemePreference = 'system';
  try {
    const saved = Storage.getItemSync(KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') preference = saved;
  } catch {
    // first run or storage unavailable: follow the phone
  }
  Uniwind.setTheme(preference);
  let palette: PaletteId = 'vault';
  try {
    palette = applyPalette(Storage.getItemSync(PALETTE_KEY) ?? 'vault');
  } catch {
    // keep the default palette
  }
  let font: FontId = 'golos';
  let textScale: TextScaleId = 'default';
  try {
    font = fontById(Storage.getItemSync(FONT_KEY) ?? 'golos').id;
    textScale = scaleById(Storage.getItemSync(SCALE_KEY) ?? 'default').id;
  } catch {
    // keep the default font and size
  }
  applyTypography(font, textScale);
  useThemePreference.setState({ preference, palette, font, textScale });
}
