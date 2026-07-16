import { TextInput, type TextInputProps } from 'react-native';

import { useThemeColor } from '@/hooks/useThemeColor';

export type ThemedTextInputProps = TextInputProps & {
  lightColor?: string;
  darkColor?: string;
};

export function ThemedTextInput({
  style,
  lightColor,
  darkColor,
  placeholderTextColor,
  ...rest
}: ThemedTextInputProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');
  const placeholder = useThemeColor({}, 'icon');

  return (
    <TextInput
      style={[{ color }, style]}
      placeholderTextColor={placeholderTextColor ?? placeholder}
      {...rest}
    />
  );
}
