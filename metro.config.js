// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withUniwindConfig(config, {
  // The design tokens (colours, type, radius) — the one CSS entry for the app.
  cssEntryFile: './src/global.css',
  // Generated className typings (regenerated whenever Metro runs).
  dtsFile: './src/uniwind-types.d.ts',
});
