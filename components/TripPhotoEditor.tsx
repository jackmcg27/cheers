import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { errorMessage } from '@/lib/errors';
import { removeTripPhoto, uploadTripPhoto } from '@/lib/trip-photos';

type Props = {
  tripId: string;
  userId: string;
  photoUrl: string | null;
  onPhotoChange: (photoUrl: string | null) => void;
};

/** "Add/change/remove photo" controls for a trip, shared by the owner's own history detail
 * screen and the feed detail screen (shown there only when the viewer owns the post). */
export function TripPhotoEditor({ tripId, userId, photoUrl, onPhotoChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickPhoto = async () => {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo library access is needed to add a picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (result.canceled || !result.assets?.[0]) return;

    setBusy(true);
    try {
      const asset = result.assets[0];
      const url = await uploadTripPhoto(tripId, userId, asset.uri);
      onPhotoChange(url);
    } catch (e) {
      setError(errorMessage(e, 'Failed to upload photo'));
    } finally {
      setBusy(false);
    }
  };

  const clearPhoto = async () => {
    if (!photoUrl) return;
    setError(null);
    setBusy(true);
    try {
      await removeTripPhoto(tripId, photoUrl);
      onPhotoChange(null);
    } catch (e) {
      setError(errorMessage(e, 'Failed to remove photo'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView>
      <ThemedView style={styles.actions}>
        {busy ? (
          <ActivityIndicator />
        ) : (
          <>
            <Pressable onPress={pickPhoto}>
              <ThemedText type="link">{photoUrl ? 'Change photo' : 'Add a photo'}</ThemedText>
            </Pressable>
            {photoUrl && (
              <Pressable onPress={clearPhoto}>
                <ThemedText style={styles.remove}>Remove photo</ThemedText>
              </Pressable>
            )}
          </>
        )}
      </ThemedView>
      {error && <ThemedText style={styles.error}>{error}</ThemedText>}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 20, alignItems: 'center' },
  remove: { color: '#ff453a' },
  error: { color: '#ff453a' },
});
