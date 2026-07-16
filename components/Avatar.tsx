import { Image, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';

type Props = {
  avatarUrl?: string | null;
  displayName?: string | null;
  size?: number;
};

/** A circular avatar image, falling back to the display name's first letter on a solid
 * background when there's no `avatarUrl` (new users, or a follower whose profile row hasn't
 * loaded yet). Uses plain RN `Image`, matching the convention in `TripDetailView.tsx`. */
export function Avatar({ avatarUrl, displayName, size = 36 }: Props) {
  const dimension = { width: size, height: size, borderRadius: size / 2 };
  const initial = displayName?.trim()?.[0]?.toUpperCase() ?? '?';

  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={[styles.image, dimension]} />;
  }

  return (
    <View style={[styles.fallback, dimension]}>
      <ThemedText style={[styles.initial, { fontSize: size * 0.45, lineHeight: size * 0.55 }]}>{initial}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: '#3a3a3c' },
  fallback: { backgroundColor: '#0a84ff', alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#fff', fontWeight: '600' },
});
