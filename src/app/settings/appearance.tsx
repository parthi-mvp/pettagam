import { FontPicker, ModePicker, TextSizePicker, ThemePicker } from '@/components/theme-picker';
import { FormSection, Screen, SwitchRow } from '@/components/ui';
import { useHapticsPreference } from '@/lib/haptics';

export default function AppearanceSettings() {
  const haptics = useHapticsPreference();
  return (
    <Screen>
      <FormSection title="Mode">
        <ModePicker />
      </FormSection>

      <FormSection title="Colour theme">
        <ThemePicker />
      </FormSection>

      <FormSection title="Font">
        <FontPicker />
      </FormSection>

      <FormSection title="Text size">
        <TextSizePicker />
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
