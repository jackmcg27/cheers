import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

export default function SignIn() {
  const { session } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session) return <Redirect href="/(tabs)" />;

  async function withBusy(fn: () => Promise<{ error: { message: string } | null }>) {
    setBusy(true);
    setStatus(null);
    const { error } = await fn();
    setStatus(error ? error.message : null);
    setBusy(false);
  }

  const signIn = () =>
    withBusy(() => supabase.auth.signInWithPassword({ email, password }));

  const signUp = () =>
    withBusy(() =>
      supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName.trim() } },
      })
    );

  const sendMagicLink = () =>
    withBusy(async () => {
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (!error) setStatus('Check your email for a sign-in link.');
      return { error };
    });

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Cheers</ThemedText>
      <ThemedText style={styles.subtitle}>Sign in to start a crawl</ThemedText>

      <TextInput
        style={styles.input}
        placeholder="Display name (for Sign Up — shown to friends)"
        placeholderTextColor="#888"
        value={displayName}
        onChangeText={setDisplayName}
      />
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#888"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#888"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {status && <ThemedText style={styles.status}>{status}</ThemedText>}

      <View style={styles.row}>
        <Pressable style={styles.button} disabled={busy} onPress={signIn}>
          <ThemedText style={styles.buttonText}>Sign In</ThemedText>
        </Pressable>
        <Pressable
          style={[styles.button, styles.secondary, !displayName.trim() && styles.disabled]}
          disabled={busy || !displayName.trim()}
          onPress={signUp}>
          <ThemedText style={styles.buttonText}>Sign Up</ThemedText>
        </Pressable>
      </View>

      <Pressable disabled={busy || !email} onPress={sendMagicLink}>
        <ThemedText style={styles.link}>Or send me a magic link instead</ThemedText>
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
  row: { flexDirection: 'row', gap: 12, marginTop: 8 },
  button: { flex: 1, backgroundColor: '#0a84ff', borderRadius: 10, padding: 14, alignItems: 'center' },
  secondary: { backgroundColor: '#3a3a3c' },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '600' },
  link: { textAlign: 'center', marginTop: 16, color: '#0a84ff' },
  status: { color: '#ff9f0a', textAlign: 'center' },
});
