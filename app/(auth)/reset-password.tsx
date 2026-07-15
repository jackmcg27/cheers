import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/lib/auth-context';
import { errorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

export default function ResetPassword() {
  const { session, clearPasswordRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (!session) return <Redirect href="/(auth)/sign-in" />;
  if (done) return <Redirect href="/(tabs)" />;

  async function submit() {
    if (password.length < 6) {
      setStatus('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setStatus("Passwords don't match.");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setStatus(error.message);
        return;
      }
      clearPasswordRecovery();
      setDone(true);
    } catch (e) {
      setStatus(errorMessage(e, 'Something went wrong'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Set a new password</ThemedText>
      <ThemedText style={styles.subtitle}>Choose a new password for your account.</ThemedText>

      <TextInput
        style={styles.input}
        placeholder="New password"
        placeholderTextColor="#888"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <TextInput
        style={styles.input}
        placeholder="Confirm new password"
        placeholderTextColor="#888"
        secureTextEntry
        value={confirm}
        onChangeText={setConfirm}
      />

      {status && <ThemedText style={styles.status}>{status}</ThemedText>}

      <Pressable style={[styles.button, busy && styles.disabled]} disabled={busy} onPress={submit}>
        <ThemedText style={styles.buttonText}>{busy ? 'Saving...' : 'Save password'}</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  subtitle: { opacity: 0.7, marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#3a3a3c',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
  },
  button: { backgroundColor: '#0a84ff', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 8 },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '600' },
  status: { color: '#ff9f0a', textAlign: 'center' },
});
