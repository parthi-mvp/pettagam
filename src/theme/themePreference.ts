import Storage from 'expo-sqlite/kv-store';
import { Uniwind } from 'uniwind';
import { create } from 'zustand';

import { paletteById, type PaletteId, toCSSVariables } from './palettes';

/** Settings → Appearance. "system" follows the phone. */
export type ThemePreference = 'system' | 'light' | 'dark';

const KEY = 'appearance.theme';
const PALETTE_KEY = 'appearance.palette';

interface ThemePreferenceState {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  palette: PaletteId;
  setPalette: (palette: PaletteId) => void;
}

/** Repaint both built-in themes, so light/dark and "same as phone" keep working with any palette. */
function applyPalette(id: string) {
  const p = paletteById(id);
  Uniwind.updateCSSVariables('light', toCSSVariables(p.light));
  Uniwind.updateCSSVariables('dark', toCSSVariables(p.dark));
  return p.id;
}

/** Uniwind does the switching; this store remembers the choice on the device. */
export const useThemePreference = create<ThemePreferenceState>((set) => ({
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
  useThemePreference.setState({ preference, palette });
}
