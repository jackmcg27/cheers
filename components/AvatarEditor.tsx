import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { removeAvatar, uploadAvatar } from '@/lib/avatar';
import { errorMessage } from '@/lib/errors';

type Props = {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  onAvatarChange: (avatarUrl: string | null) => void;
};

/** "Add/change/remove profile picture" controls, shown on the current user's own profile
 * header. Mirrors `TripPhotoEditor`'s shape. */
export function AvatarEditor({ userId, displayName, avatarUrl, onAvatarChange }: Props) {
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
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets?.[0]) return;

    setBusy(true);
    try {
      const asset = result.assets[0];
      const url = await uploadAvatar(userId, asset.uri);
      onAvatarChange(url);
    } catch (e) {
      setError(errorMessage(e, 'Failed to upload picture'));
    } finally {
      setBusy(false);
    }
  };

  const clearPhoto = async () => {
    if (!avatarUrl) return;
    setError(null);
    setBusy(true);
    try {
      await removeAvatar(userId, avatarUrl);
      onAvatarChange(null);
    } catch (e) {
      setError(errorMessage(e, 'Failed to remove picture'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.root}>
      <ThemedView style={styles.row}>
        <Avatar avatarUrl={avatarUrl} displayName={displayName} size={56} />
        <ThemedView style={styles.actions}>
          {busy ? (
            <ActivityIndicator />
          ) : (
            <>
              <Pressable onPress={pickPhoto}>
                <ThemedText type="link">{avatarUrl ? 'Change photo' : 'Add a photo'}</ThemedText>
              </Pressable>
              {avatarUrl && (
                <Pressable onPress={clearPhoto}>
                  <ThemedText style={styles.remove}>Remove</ThemedText>
                </Pressable>
              )}
            </>
          )}
        </ThemedView>
      </ThemedView>
      {error && <ThemedText style={styles.error}>{error}</ThemedText>}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actions: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  remove: { color: '#ff453a' },
  error: { color: '#ff453a' },
});
