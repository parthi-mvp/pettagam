import { Pressable, View } from 'react-native';

import { useThemeColors } from '@/theme/useThemeColor';

import { Icon } from '../icons';
import { TextInput } from './TextInput';
import { FIELD_SURFACE } from './TextField';

/** The app's search field (magnifier, text, clear ×). Used by the choosers and the Categories / Tags lists. */
export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [subtle] = useThemeColors(['fg-subtle'] as const);
  return (
    <View className={`h-10 flex-row items-center gap-2 rounded-[12px] border px-3 ${FIELD_SURFACE}`}>
      <Icon name="search" size={16} color={subtle} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        accessibilityLabel={placeholder}
        autoCorrect={false}
        returnKeyType="search"
        className="h-full min-w-0 flex-1"
      />
      {value ? (
        <Pressable onPress={() => onChange('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
          <Icon name="close" size={16} color={subtle} />
        </Pressable>
      ) : null}
    </View>
  );
}
