import { View } from 'react-native';
import { Toaster } from 'sonner-native';
import { useUniwind } from 'uniwind';

import { FontFamily } from '@/constants/theme';
import { useThemeColors } from '@/theme/useThemeColor';

import { Icon, type IconName } from '../icons';

/**
 * Toasts (sonner-native): top of the screen, swipe up to dismiss. Use them to confirm something
 * happened ("Saved", "Synced 12 changes") or for failures the user can't fix inline — never for
 * form validation (show that next to the field).
 *
 *   import { toast } from 'sonner-native';
 *   toast.success('Transaction saved');   toast.error('Couldn’t sync');   toast.info('Transaction deleted');
 *
 * One calm card for all of them; the kind shows in a small round badge (check, ×, i, !) and a
 * faint border in the same colour, so the message itself stays easy to read.
 */
export function AppToaster() {
  const { theme } = useUniwind();
  const [surface, fg, muted, line, primary, success, danger, warning, white] = useThemeColors([
    'raised',
    'fg',
    'fg-muted',
    'line',
    'primary',
    'success',
    'danger',
    'warning',
    'white',
  ] as const);
  const dark = theme === 'dark';
  // Badge ink: white on the colour, except dark mode's light badges, which take the canvas ink.
  const ink = dark ? '#0b1413' : white;
  const badge = (color: string, icon: IconName) => (
    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={14} color={ink} strokeWidth={2.8} />
    </View>
  );
  const edge = (color: string) => ({ borderColor: `${color}55` });

  return (
    <Toaster
      theme={dark ? 'dark' : 'light'}
      position="top-center"
      swipeToDismissDirection="up"
      duration={3200}
      visibleToasts={3}
      gap={8}
      icons={{
        success: badge(success, 'check'),
        error: badge(danger, 'close'),
        info: badge(primary, 'info'),
        warning: badge(warning, 'alert'),
      }}
      toastOptions={{
        style: {
          backgroundColor: surface,
          borderWidth: 1,
          borderColor: line,
          borderRadius: 18,
          borderCurve: 'continuous',
          paddingVertical: 12,
          paddingHorizontal: 14,
          gap: 10,
          boxShadow: dark ? '0 10px 30px rgba(0, 0, 0, 0.45)' : '0 10px 30px rgba(20, 32, 30, 0.14)',
        },
        success: edge(success),
        error: edge(danger),
        info: edge(primary),
        warning: edge(warning),
        // sonner defaults to fontWeight 600, which stacks on the named face on iOS — let the family set the weight.
        titleStyle: { color: fg, fontFamily: FontFamily[500], fontWeight: 'normal', fontSize: 14, lineHeight: 20 },
        descriptionStyle: { color: muted, fontFamily: FontFamily[400], fontWeight: 'normal', fontSize: 13, lineHeight: 18 },
        actionButtonStyle: { backgroundColor: `${primary}1f`, borderRadius: 10, paddingHorizontal: 12, height: 30 },
        actionButtonTextStyle: { color: primary, fontFamily: FontFamily[600], fontWeight: 'normal', fontSize: 13 },
      }}
    />
  );
}
