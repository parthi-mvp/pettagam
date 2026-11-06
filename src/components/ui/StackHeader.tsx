import type { NativeStackHeaderProps } from 'expo-router/native-stack';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeColor } from '@/theme/useThemeColor';

import { BackButton } from './BackButton';
import { Text } from './Text';

/**
 * The stack header, drawn in JS: back button, centred title, optional headerRight.
 * Why not the native header: on Android, react-native-screens re-attaches custom header views
 * (our round back button, "Add" buttons) whenever header props change, and a theme switch changes
 * the colours → "The specified child already has a parent" crash. A JS header has nothing to re-attach.
 */
export function StackHeader({ options, route, back }: NativeStackHeaderProps) {
  const insets = useSafeAreaInsets();
  const tint = useThemeColor('fg');
  // An iOS modal sheet starts below the status bar already.
  const top = Platform.OS === 'ios' && options.presentation === 'modal' ? 0 : insets.top;
  const title = typeof options.title === 'string' ? options.title : route.name;
  const right = options.headerRight?.({ canGoBack: !!back, tintColor: tint });
  return (
    <View className="bg-canvas" style={{ paddingTop: top }}>
      <View className="h-14 flex-row items-center gap-2 px-3">
        <View className="min-w-10 flex-1 flex-row">{back ? <BackButton /> : null}</View>
        <Text weight="medium" numberOfLines={1} accessibilityRole="header" className="max-w-[60%] text-center text-[17px] text-fg">
          {title}
        </Text>
        <View className="min-w-10 flex-1 flex-row justify-end">{right}</View>
      </View>
    </View>
  );
}
