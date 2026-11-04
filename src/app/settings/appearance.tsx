import { ThemePicker } from '@/components/theme-picker';
import { Chips, FormSection, Screen, SwitchRow } from '@/components/ui';
import { useHapticsPreference } from '@/lib/haptics';
import { useThemePreference, type ThemePreference } from '@/theme/themePreference';

export default function AppearanceSettings() {
  const theme = useThemePreference();
  const haptics = useHapticsPreference();
  return (
    <Screen>
      <FormSection title="Colour theme">
        <ThemePicker />
      </FormSection>

      <FormSection title="Mode">
        <Chips<ThemePreference>
          options={[
            { value: 'system', label: 'Same as phone' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          value={theme.preference}
          onChange={theme.setPreference}
        />
      </FormSection>

      <FormSection title="Feel">
        <SwitchRow
          title="Haptic feedback"
          description="A light tap when you save, sync or pick something"
          value={haptics.enabled}
          onValueChange={haptics.setEnabled}
        />
      </FormSection>
    </Screen>
  );
}
