/**
 * Colour themes (Settings → More → Appearance). Each palette repaints the brand, accent, hero and
 * neutral tokens for both light and dark; money colours (success / danger / warning) never change,
 * so green is always money in and red always money out.
 *
 * Vault mirrors src/global.css. It's applied explicitly too, so switching back restores it.
 * shortcut: Vault values are duplicated from global.css; keep the two in sync when tuning it.
 */
export type PaletteId = 'vault' | 'kanchi' | 'neelam' | 'chandan' | 'mayil' | 'kajal' | 'samudra' | 'thamarai' | 'sevvanthi';

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
  {
    id: 'chandan',
    name: 'Chandan',
    description: 'Sandalwood terracotta and saffron',
    light: {
      canvas: '#f6f2ec', fill: '#f1ebe3', line: '#e4dbcf', 'line-strong': '#cdc1b2', 'border-strong': '#8f8477', focus: '#b0573a',
      fg: '#231a14', 'fg-muted': '#6a5d52', 'fg-subtle': '#76695e',
      primary: '#9a4524', 'primary-pressed': '#64290f', 'primary-mid': '#b2552f', 'primary-soft': '#f5e3d9', 'primary-fg': '#6e2e14', 'on-primary': '#ffffff',
      brass: '#d99a2b', 'brass-soft': '#f8ecd2', 'brass-fg': '#86580f', 'brass-deep': '#3f2a06', 'on-brass': '#231a14',
      hero: '#3d1a0c', 'hero-top': '#56250f', 'hero-tile': '#9a4524', 'on-hero-muted': '#ecd5c8', 'on-hero-soft': '#e2c1af',
    },
    dark: {
      canvas: '#130e0b', surface: '#1d1612', raised: '#231a15', sheet: '#19120e', fill: '#2a201a', line: '#352920', 'line-strong': '#4d3c30', 'border-strong': '#80705f', focus: '#ec9a76',
      fg: '#f3ece6', 'fg-muted': '#bba99b', 'fg-subtle': '#8d7c6f',
      primary: '#ec9a76', 'primary-pressed': '#de8460', 'primary-mid': '#cf7754', 'primary-soft': '#40221a', 'primary-fg': '#f8d3c2', 'on-primary': '#2c1007',
      brass: '#e0a640', 'brass-soft': '#302412', 'brass-fg': '#ecbb62', 'brass-deep': '#f5e3bf', 'on-brass': '#231a14',
      hero: '#2d140a', 'hero-top': '#43200f', 'hero-tile': '#9a4524', 'on-hero-muted': '#ecd5c8', 'on-hero-soft': '#e2c1af',
    },
  },
  {
    id: 'mayil',
    name: 'Mayil',
    description: 'Peacock indigo and teal',
    light: {
      canvas: '#f3f2f8', fill: '#ecebf5', line: '#dedcec', 'line-strong': '#c6c3dc', 'border-strong': '#85829a', focus: '#5747c2',
      fg: '#17152b', 'fg-muted': '#5c5975', 'fg-subtle': '#696682',
      primary: '#4a3aa8', 'primary-pressed': '#2e2373', 'primary-mid': '#5b4bc4', 'primary-soft': '#e6e2f7', 'primary-fg': '#35298a', 'on-primary': '#ffffff',
      brass: '#14a39a', 'brass-soft': '#d6f2ef', 'brass-fg': '#0b6e68', 'brass-deep': '#06332f', 'on-brass': '#06201e',
      hero: '#1d1650', 'hero-top': '#2a2070', 'hero-tile': '#4a3aa8', 'on-hero-muted': '#d6d1f2', 'on-hero-soft': '#c3bcec',
    },
    dark: {
      canvas: '#0d0c17', surface: '#161523', raised: '#1b1a2b', sheet: '#12111e', fill: '#222034', line: '#2b2940', 'line-strong': '#403d5a', 'border-strong': '#77738f', focus: '#a99bf5',
      fg: '#ecebf6', 'fg-muted': '#aaa6c4', 'fg-subtle': '#807c9a',
      primary: '#a99bf5', 'primary-pressed': '#9585ec', 'primary-mid': '#8a7ae0', 'primary-soft': '#262153', 'primary-fg': '#dcd5fb', 'on-primary': '#150f3a',
      brass: '#3cc7bd', 'brass-soft': '#0f2e2c', 'brass-fg': '#6fdad1', 'brass-deep': '#cdf3ef', 'on-brass': '#06201e',
      hero: '#17123f', 'hero-top': '#221a5c', 'hero-tile': '#4a3aa8', 'on-hero-muted': '#d6d1f2', 'on-hero-soft': '#c3bcec',
    },
  },
  {
    id: 'kajal',
    name: 'Kajal',
    description: 'Graphite and amber, minimal',
    light: {
      canvas: '#f4f4f5', fill: '#ededef', line: '#e0e0e4', 'line-strong': '#c8c8ce', 'border-strong': '#85858d', focus: '#3f3f46',
      fg: '#18181b', 'fg-muted': '#5f5f68', 'fg-subtle': '#6b6b74',
      primary: '#27272a', 'primary-pressed': '#09090b', 'primary-mid': '#3f3f46', 'primary-soft': '#e7e7ea', 'primary-fg': '#27272a', 'on-primary': '#ffffff',
      brass: '#e0a526', 'brass-soft': '#f9eed3', 'brass-fg': '#86600c', 'brass-deep': '#3d2b05', 'on-brass': '#18181b',
      hero: '#131316', 'hero-top': '#1f1f23', 'hero-tile': '#3f3f46', 'on-hero-muted': '#d4d4d8', 'on-hero-soft': '#c2c2c8',
    },
    dark: {
      canvas: '#0b0b0d', surface: '#151518', raised: '#1a1a1e', sheet: '#111114', fill: '#202024', line: '#29292e', 'line-strong': '#3d3d44', 'border-strong': '#75757e', focus: '#e4e4e7',
      fg: '#ededf0', 'fg-muted': '#a9a9b2', 'fg-subtle': '#7f7f88',
      primary: '#e4e4e7', 'primary-pressed': '#d0d0d5', 'primary-mid': '#bdbdc4', 'primary-soft': '#26262b', 'primary-fg': '#f4f4f5', 'on-primary': '#111113',
      brass: '#eab43a', 'brass-soft': '#2f2610', 'brass-fg': '#f0c564', 'brass-deep': '#f7e6bd', 'on-brass': '#18181b',
      hero: '#141417', 'hero-top': '#1d1d21', 'hero-tile': '#3f3f46', 'on-hero-muted': '#d4d4d8', 'on-hero-soft': '#c2c2c8',
    },
  },
  {
    id: 'samudra',
    name: 'Samudra',
    description: 'Ocean cyan and coral',
    light: {
      canvas: '#f0f5f7', fill: '#e8f0f3', line: '#d8e4e9', 'line-strong': '#bfd0d7', 'border-strong': '#7d8f97', focus: '#137796',
      fg: '#0f1d23', 'fg-muted': '#536870', 'fg-subtle': '#5f747c',
      primary: '#0b6383', 'primary-pressed': '#063f55', 'primary-mid': '#0f7a9e', 'primary-soft': '#daedf4', 'primary-fg': '#084b63', 'on-primary': '#ffffff',
      brass: '#f07a5a', 'brass-soft': '#fde6df', 'brass-fg': '#a3401f', 'brass-deep': '#46180a', 'on-brass': '#1f0b05',
      hero: '#06324a', 'hero-top': '#08425e', 'hero-tile': '#0b6383', 'on-hero-muted': '#c8e1ea', 'on-hero-soft': '#b2d4e0',
    },
    dark: {
      canvas: '#081216', surface: '#0f1c21', raised: '#132228', sheet: '#0c171b', fill: '#18272d', line: '#203238', 'line-strong': '#33474e', 'border-strong': '#6a7f87', focus: '#5cc3e3',
      fg: '#e8f1f4', 'fg-muted': '#9fb4bc', 'fg-subtle': '#778c94',
      primary: '#5cc3e3', 'primary-pressed': '#45b2d4', 'primary-mid': '#38a4c7', 'primary-soft': '#0f3341', 'primary-fg': '#c4ebf6', 'on-primary': '#03202b',
      brass: '#f48c6e', 'brass-soft': '#3a1d14', 'brass-fg': '#f6a48b', 'brass-deep': '#fde0d6', 'on-brass': '#1f0b05',
      hero: '#062a3c', 'hero-top': '#093b53', 'hero-tile': '#0b6383', 'on-hero-muted': '#c8e1ea', 'on-hero-soft': '#b2d4e0',
    },
  },
  {
    id: 'thamarai',
    name: 'Thamarai',
    description: 'Lotus rose and lavender',
    light: {
      canvas: '#f8f2f4', fill: '#f4eaee', line: '#e9dbe1', 'line-strong': '#d5c2ca', 'border-strong': '#928189', focus: '#b23a64',
      fg: '#26141b', 'fg-muted': '#6d5962', 'fg-subtle': '#79656e',
      primary: '#a8325b', 'primary-pressed': '#6e1e3b', 'primary-mid': '#c0426e', 'primary-soft': '#f8e1e9', 'primary-fg': '#7c2343', 'on-primary': '#ffffff',
      brass: '#8b7ad8', 'brass-soft': '#ece8fa', 'brass-fg': '#5442a8', 'brass-deep': '#251a55', 'on-brass': '#140e33',
      hero: '#45122a', 'hero-top': '#5e1a3a', 'hero-tile': '#a8325b', 'on-hero-muted': '#f0d3df', 'on-hero-soft': '#e7bfd0',
    },
    dark: {
      canvas: '#150b0f', surface: '#201318', raised: '#26161d', sheet: '#1b1014', fill: '#2c1c23', line: '#38252d', 'line-strong': '#503a44', 'border-strong': '#846c76', focus: '#f290b2',
      fg: '#f5eaee', 'fg-muted': '#c0a7b1', 'fg-subtle': '#927a84',
      primary: '#f290b2', 'primary-pressed': '#e9789f', 'primary-mid': '#dc6a92', 'primary-soft': '#46182b', 'primary-fg': '#fad2e0', 'on-primary': '#2e0816',
      brass: '#a99bf0', 'brass-soft': '#231d40', 'brass-fg': '#c0b5f5', 'brass-deep': '#e8e3fc', 'on-brass': '#140e33',
      hero: '#330d1f', 'hero-top': '#4a142d', 'hero-tile': '#a8325b', 'on-hero-muted': '#f0d3df', 'on-hero-soft': '#e7bfd0',
    },
  },
  {
    id: 'sevvanthi',
    name: 'Sevvanthi',
    description: 'Royal violet and marigold',
    light: {
      canvas: '#f5f2f8', fill: '#efeaf5', line: '#e2dbec', 'line-strong': '#cbc1da', 'border-strong': '#88809a', focus: '#7444c0',
      fg: '#1c1428', 'fg-muted': '#625873', 'fg-subtle': '#6e6480',
      primary: '#6a3bb3', 'primary-pressed': '#432375', 'primary-mid': '#7d4ccc', 'primary-soft': '#ece3f8', 'primary-fg': '#4f2a88', 'on-primary': '#ffffff',
      brass: '#f2a31b', 'brass-soft': '#fdf0d5', 'brass-fg': '#8a5a05', 'brass-deep': '#402904', 'on-brass': '#1c1428',
      hero: '#2a1350', 'hero-top': '#391b6b', 'hero-tile': '#6a3bb3', 'on-hero-muted': '#ddd0f2', 'on-hero-soft': '#cdbdec',
    },
    dark: {
      canvas: '#100b17', surface: '#1a1324', raised: '#1f172b', sheet: '#150f1e', fill: '#251c33', line: '#30253f', 'line-strong': '#463959', 'border-strong': '#7b708e', focus: '#bf9cf5',
      fg: '#efeaf6', 'fg-muted': '#b3a8c6', 'fg-subtle': '#887d9c',
      primary: '#bf9cf5', 'primary-pressed': '#ad85ee', 'primary-mid': '#a077e4', 'primary-soft': '#2f1d4f', 'primary-fg': '#e3d4fb', 'on-primary': '#1b0b38',
      brass: '#f5b23d', 'brass-soft': '#33260f', 'brass-fg': '#f8c463', 'brass-deep': '#fce9c4', 'on-brass': '#1c1428',
      hero: '#221042', 'hero-top': '#30175c', 'hero-tile': '#6a3bb3', 'on-hero-muted': '#ddd0f2', 'on-hero-soft': '#cdbdec',
    },
  },
];

export const paletteById = (id: string) => PALETTES.find((p) => p.id === id) ?? PALETTES[0];

/** Token map → Uniwind variable map ("primary" → "--color-primary"). */
export const toCSSVariables = (tokens: Tokens) => Object.fromEntries(Object.entries(tokens).map(([k, v]) => [`--color-${k}`, v]));
