import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { nudgeMockHeading, resetMockCoords, setMockCoords, useMockLocation } from '@/lib/mock-location';

type Props = {
  /** The bar the compass is currently pointing at, if any — lets you fake "walking there". */
  targetLocation?: { latitude: number; longitude: number } | null;
};

/** Dev-only widget for driving the mock GPS/heading without a phone. Only ever rendered when
 * EXPO_PUBLIC_MOCK_LOCATION=true — see docs/local-dev-without-a-phone.md. */
export function MockLocationControls({ targetLocation }: Props) {
  const mock = useMockLocation();

  return (
    <View style={styles.card}>
      <ThemedText style={styles.label}>MOCK LOCATION (dev only)</ThemedText>
      <ThemedText style={styles.readout}>
        {mock.latitude.toFixed(5)}, {mock.longitude.toFixed(5)} · {Math.round(mock.heading)}°
      </ThemedText>
      <View style={styles.row}>
        <Pressable style={styles.button} onPress={() => nudgeMockHeading(-15)}>
          <ThemedText style={styles.buttonText}>⟲ 15°</ThemedText>
        </Pressable>
        <Pressable style={styles.button} onPress={() => nudgeMockHeading(15)}>
          <ThemedText style={styles.buttonText}>15° ⟳</ThemedText>
        </Pressable>
      </View>
      <View style={styles.row}>
        <Pressable
          style={[styles.button, !targetLocation && styles.disabled]}
          disabled={!targetLocation}
          onPress={() => targetLocation && setMockCoords(targetLocation.latitude, targetLocation.longitude)}>
          <ThemedText style={styles.buttonText}>Jump to target</ThemedText>
        </Pressable>
        <Pressable style={styles.button} onPress={resetMockCoords}>
          <ThemedText style={styles.buttonText}>Reset position</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#ff9f0a',
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  label: { fontSize: 11, opacity: 0.7, letterSpacing: 1 },
  readout: { fontSize: 12, opacity: 0.85 },
  row: { flexDirection: 'row', gap: 8 },
  button: {
    flex: 1,
    backgroundColor: '#3a3a3c',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  disabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
