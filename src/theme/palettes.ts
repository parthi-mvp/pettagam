/**
 * Colour themes (Settings → More → Appearance). Each palette repaints the brand, accent, hero and
 * neutral tokens for both light and dark; money colours (success / danger / warning) never change,
 * so green is always money in and red always money out.
 *
 * Vault mirrors src/global.css. It's applied explicitly too, so switching back restores it.
 * shortcut: Vault values are duplicated from global.css; keep the two in sync when tuning it.
 */
export type PaletteId = 'vault' | 'kanchi' | 'neelam';

type Tokens = Record<string, string>;

export interface Palette {
  id: PaletteId;
  name: string;
  description: string;
  light: Tokens;
  dark: Tokens;
}

export const PALETTES: Palette[] = [
  {
    id: 'vault',
    name: 'Vault',
    description: 'Deep teal and brass',
    light: {
      canvas: '#f3f4ef', fill: '#eef1ec', line: '#dfe2da', 'line-strong': '#c6ccc6', 'border-strong': '#868f8b', focus: '#2a8277',
      fg: '#14201e', 'fg-muted': '#5b6763', 'fg-subtle': '#66726e',
      primary: '#0f5650', 'primary-pressed': '#082f2c', 'primary-mid': '#16716a', 'primary-soft': '#dcebe8', 'primary-fg': '#0b3f3b', 'on-primary': '#ffffff',
      brass: '#d4a23f', 'brass-soft': '#f6ebd3', 'brass-fg': '#8a6420', 'brass-deep': '#3d2c0a', 'on-brass': '#14201e',
      hero: '#082f2c', 'hero-top': '#0b3f3b', 'hero-tile': '#0f5650', 'on-hero-muted': '#c9dcd8', 'on-hero-soft': '#b5d6d0',
    },
    dark: {
      canvas: '#0b1413', surface: '#131e1c', raised: '#17231f', sheet: '#0f1917', fill: '#1e2a27', line: '#26332f', 'line-strong': '#3a4945', 'border-strong': '#6b7a76', focus: '#5fb8ad',
      fg: '#eceeea', 'fg-muted': '#a3b0ac', 'fg-subtle': '#7b8884',
      primary: '#5fb8ad', 'primary-pressed': '#4aa397', 'primary-mid': '#3e9a90', 'primary-soft': '#173a36', 'primary-fg': '#bfe3dd', 'on-primary': '#06201e',
      brass: '#d4a23f', 'brass-soft': '#2e2615', 'brass-fg': '#e2b65a', 'brass-deep': '#f1e2c0', 'on-brass': '#14201e',
      hero: '#0b2422', 'hero-top': '#0f3633', 'hero-tile': '#0f5650', 'on-hero-muted': '#c9dcd8', 'on-hero-soft': '#b5d6d0',
    },
  },
  {
    id: 'kanchi',
    name: 'Kanchi',
    description: 'Silk plum and temple gold',
    light: {
      canvas: '#f6f2f1', fill: '#f2eaec', line: '#e6dcde', 'line-strong': '#d0c3c6', 'border-strong': '#8f8487', focus: '#8e3b5e',
      fg: '#221418', 'fg-muted': '#675a5e', 'fg-subtle': '#73666a',
      primary: '#7a2449', 'primary-pressed': '#4f1530', 'primary-mid': '#93305a', 'primary-soft': '#f3e1e8', 'primary-fg': '#5a1a36', 'on-primary': '#ffffff',
      brass: '#c9962f', 'brass-soft': '#f7ecd4', 'brass-fg': '#7f5a17', 'brass-deep': '#3d2c0a', 'on-brass': '#221418',
      hero: '#3a0f22', 'hero-top': '#4f1530', 'hero-tile': '#7a2449', 'on-hero-muted': '#e6cfd9', 'on-hero-soft': '#dcbccb',
    },
    dark: {
      canvas: '#140b0e', surface: '#1e1317', raised: '#241619', sheet: '#1a1013', fill: '#2a1c21', line: '#33242a', 'line-strong': '#4a363d', 'border-strong': '#7d6a70', focus: '#e48fb1',
      fg: '#f1eaec', 'fg-muted': '#b8a6ac', 'fg-subtle': '#8a787e',
      primary: '#e48fb1', 'primary-pressed': '#d6779d', 'primary-mid': '#c96a91', 'primary-soft': '#3f1a2a', 'primary-fg': '#f6cfde', 'on-primary': '#2a0a17',
      brass: '#d9a944', 'brass-soft': '#2f2514', 'brass-fg': '#e6bb62', 'brass-deep': '#f3e3c2', 'on-brass': '#221418',
      hero: '#2a0c19', 'hero-top': '#3d1324', 'hero-tile': '#7a2449', 'on-hero-muted': '#e6cfd9', 'on-hero-soft': '#dcbccb',
    },
  },
  {
    id: 'neelam',
    name: 'Neelam',
    description: 'Sapphire blue and saffron',
    light: {
      canvas: '#f1f3f7', fill: '#e9edf4', line: '#dbe1ea', 'line-strong': '#c3cbd8', 'border-strong': '#808a9a', focus: '#2f5fb3',
      fg: '#121a2b', 'fg-muted': '#556073', 'fg-subtle': '#626d7f',
      primary: '#1f4fa0', 'primary-pressed': '#13336b', 'primary-mid': '#2a62bf', 'primary-soft': '#e0e9f8', 'primary-fg': '#163a78', 'on-primary': '#ffffff',
      brass: '#e8892e', 'brass-soft': '#fcecd9', 'brass-fg': '#8f4d0e', 'brass-deep': '#43230a', 'on-brass': '#121a2b',
      hero: '#0e2350', 'hero-top': '#13336b', 'hero-tile': '#1f4fa0', 'on-hero-muted': '#cdd8ee', 'on-hero-soft': '#b8c8e8',
    },
    dark: {
      canvas: '#0a0f1a', surface: '#121a28', raised: '#16202f', sheet: '#0f1622', fill: '#1c2638', line: '#253047', 'line-strong': '#38445e', 'border-strong': '#6b7891', focus: '#7fa8f0',
      fg: '#e9edf5', 'fg-muted': '#a3afc4', 'fg-subtle': '#7a869b',
      primary: '#7fa8f0', 'primary-pressed': '#6a94e0', 'primary-mid': '#5c86d4', 'primary-soft': '#18294a', 'primary-fg': '#cddcf8', 'on-primary': '#0a1530',
      brass: '#f0a050', 'brass-soft': '#33230f', 'brass-fg': '#f4b878', 'brass-deep': '#fbe3c6', 'on-brass': '#121a2b',
      hero: '#0b1a3a', 'hero-top': '#102552', 'hero-tile': '#1f4fa0', 'on-hero-muted': '#cdd8ee', 'on-hero-soft': '#b8c8e8',
    },
  },
];

export const paletteById = (id: string) => PALETTES.find((p) => p.id === id) ?? PALETTES[0];

/** Token map → Uniwind variable map ("primary" → "--color-primary"). */
export const toCSSVariables = (tokens: Tokens) => Object.fromEntries(Object.entries(tokens).map(([k, v]) => [`--color-${k}`, v]));
