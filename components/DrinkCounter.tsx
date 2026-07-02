import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';

type Props = {
  count: number;
  onAdd: () => void;
};

export function DrinkCounter({ count, onAdd }: Props) {
  return (
    <View style={styles.row}>
      <ThemedText type="defaultSemiBold">🍻 {count}</ThemedText>
      <Pressable style={styles.button} onPress={onAdd}>
        <ThemedText style={styles.buttonText}>+ Drink</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  button: { backgroundColor: '#0a84ff', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  buttonText: { color: '#fff', fontWeight: '600' },
});
