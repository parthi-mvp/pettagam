import { FontPicker, ModePicker, TextSizePicker, ThemePicker } from '@/components/theme-picker';
import { FormSection, Screen, SwitchRow } from '@/components/ui';
import { useHapticsPreference } from '@/lib/haptics';

export default function AppearanceSettings() {
  const haptics = useHapticsPreference();
  return (
    <Screen>
      <FormSection card title="Mode">
        <ModePicker />
      </FormSection>

      <FormSection card title="Colour theme">
        <ThemePicker />
      </FormSection>

      <FormSection card title="Font">
        <FontPicker />
      </FormSection>

      <FormSection card title="Text size">
        <TextSizePicker />
      </FormSection>

      <FormSection card title="Feel">
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
