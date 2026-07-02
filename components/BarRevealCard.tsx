import { Image, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import type { PlaceBar } from '@/lib/places';
import { placePhotoUrl } from '@/lib/places';

export function BarRevealCard({ bar, compact = false }: { bar: PlaceBar; compact?: boolean }) {
  const photoUrl = bar.photoRef ? placePhotoUrl(bar.photoRef) : null;

  return (
    <View style={styles.card}>
      {photoUrl && (
        <Image source={{ uri: photoUrl }} style={compact ? styles.photoCompact : styles.photo} />
      )}
      <ThemedText type="subtitle">{bar.name}</ThemedText>
      {bar.address && <ThemedText style={styles.address}>{bar.address}</ThemedText>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: 4, paddingHorizontal: 16 },
  photo: { width: 260, height: 140, borderRadius: 12, marginBottom: 6 },
  photoCompact: { width: 200, height: 90, borderRadius: 10, marginBottom: 4 },
  address: { opacity: 0.7, textAlign: 'center' },
});
