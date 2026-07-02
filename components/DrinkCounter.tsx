import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';

type Props = {
  count: number;
  onAdd: (name?: string) => void;
};

export function DrinkCounter({ count, onAdd }: Props) {
  const [name, setName] = useState('');

  function add() {
    onAdd(name.trim() || undefined);
    setName('');
  }

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <ThemedText type="defaultSemiBold">🍻 {count}</ThemedText>
        <Pressable style={styles.button} onPress={add}>
          <ThemedText style={styles.buttonText}>+ Drink</ThemedText>
        </Pressable>
      </View>
      <TextInput
        style={styles.input}
        placeholder="Drink type (optional, e.g. IPA)"
        placeholderTextColor="#888"
        value={name}
        onChangeText={setName}
        onSubmitEditing={add}
        returnKeyType="done"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  button: { backgroundColor: '#0a84ff', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  buttonText: { color: '#fff', fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#3a3a3c',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    color: '#fff',
    width: 220,
    fontSize: 13,
    textAlign: 'center',
  },
});
