import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DrinkCounter } from '@/components/DrinkCounter';
import { ThemedText } from '@/components/ThemedText';
import { ThemedTextInput } from '@/components/ThemedTextInput';
import type { TripCompanion } from '@/lib/trip-context';
import type { ProfileMatch } from '@/lib/feed';

type Props = {
  companions: TripCompanion[];
  drinkCounts: Record<string, number>;
  showDrinkCounters: boolean;
  /** Roster management (add/remove) is host-only at the RLS layer — hide those controls for an
   * attached companion instead of showing affordances that would just fail. */
  isHost: boolean;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  searchResults: ProfileMatch[];
  onAddUser: (userId: string) => void;
  onAddGuest: (name: string) => void;
  onRemove: (companionId: string) => void;
  onAddDrink: (companionId: string, name?: string) => void;
};

export function CompanionsPanel({
  companions,
  drinkCounts,
  showDrinkCounters,
  isHost,
  searchQuery,
  onSearchQueryChange,
  searchResults,
  onAddUser,
  onAddGuest,
  onRemove,
  onAddDrink,
}: Props) {
  const [guestName, setGuestName] = useState('');

  function addGuest() {
    if (!guestName.trim()) return;
    onAddGuest(guestName.trim());
    setGuestName('');
  }

  return (
    <View style={styles.container}>
      <ThemedText style={styles.heading}>Who's with you?</ThemedText>

      {isHost && (
        <>
          <View style={styles.addRow}>
            <ThemedTextInput
              style={[styles.input, styles.flex]}
              placeholder="Add a friend by name"
              value={guestName}
              onChangeText={setGuestName}
              onSubmitEditing={addGuest}
              returnKeyType="done"
            />
            <Pressable style={styles.addButton} onPress={addGuest}>
              <ThemedText style={styles.addButtonText}>Add</ThemedText>
            </Pressable>
          </View>

          <ThemedTextInput
            style={styles.input}
            placeholder="Or search for a friend on the app"
            value={searchQuery}
            onChangeText={onSearchQueryChange}
          />
          {searchResults.map((p) => (
            <View key={p.id} style={styles.resultRow}>
              <ThemedText style={styles.flex}>{p.displayName ?? 'Someone'}</ThemedText>
              <Pressable style={styles.addButton} onPress={() => onAddUser(p.id)}>
                <ThemedText style={styles.addButtonText}>Add</ThemedText>
              </Pressable>
            </View>
          ))}
        </>
      )}

      {companions.length > 0 && (
        <View style={styles.list}>
          {companions.map((c) => (
            <View key={c.id} style={styles.companionCard}>
              <View style={styles.companionHeader}>
                <ThemedText type="defaultSemiBold">{c.name}</ThemedText>
                {isHost && (
                  <Pressable onPress={() => onRemove(c.id)}>
                    <ThemedText style={styles.remove}>Remove</ThemedText>
                  </Pressable>
                )}
              </View>
              {c.status === 'pending' && (
                <ThemedText style={styles.statusPending}>Invite sent — waiting for them to accept</ThemedText>
              )}
              {c.status === 'declined' && <ThemedText style={styles.statusDeclined}>Invite declined</ThemedText>}
              {showDrinkCounters && c.status === 'accepted' && (
                <DrinkCounter
                  count={drinkCounts[c.id] ?? 0}
                  onAdd={(name) => onAddDrink(c.id, name)}
                />
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8, width: '100%' },
  heading: { opacity: 0.75, fontSize: 13 },
  addRow: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  input: {
    borderWidth: 1,
    borderColor: '#3a3a3c',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  addButton: { backgroundColor: '#0a84ff', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  addButtonText: { color: '#fff', fontWeight: '600' },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  list: { gap: 10, marginTop: 4 },
  companionCard: {
    borderWidth: 1,
    borderColor: '#3a3a3c',
    borderRadius: 12,
    padding: 12,
    gap: 8,
    alignItems: 'center',
  },
  companionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  remove: { color: '#ff453a', fontSize: 12, opacity: 0.85 },
  statusPending: { fontSize: 12, opacity: 0.7 },
  statusDeclined: { fontSize: 12, color: '#ff453a', opacity: 0.85 },
});
