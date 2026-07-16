import * as Linking from 'expo-linking';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedTextInput } from '@/components/ThemedTextInput';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/lib/auth-context';
import { errorMessage } from '@/lib/errors';
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
    try {
      const { error } = await fn();
      if (error) setStatus(error.message);
    } catch (e) {
      setStatus(errorMessage(e, 'Something went wrong'));
    } finally {
      setBusy(false);
    }
  }

  const signIn = () =>
    withBusy(() => supabase.auth.signInWithPassword({ email, password }));

  const signUp = () =>
    withBusy(() =>
      supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName.trim() },
          emailRedirectTo: Linking.createURL('/'),
        },
      })
    );

  const sendMagicLink = () =>
    withBusy(async () => {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: Linking.createURL('/') },
      });
      if (!error) setStatus('Check your email for a sign-in link.');
      return { error };
    });

  const sendPasswordReset = () =>
    withBusy(async () => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: Linking.createURL('/'),
      });
      if (!error) setStatus('Check your email for a password reset link.');
      return { error };
    });

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Cheers</ThemedText>
      <ThemedText style={styles.subtitle}>Sign in to start a crawl</ThemedText>

      <ThemedTextInput
        style={styles.input}
        placeholder="Display name (for Sign Up — shown to friends)"
        value={displayName}
        onChangeText={setDisplayName}
      />
      <ThemedTextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <ThemedTextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

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

      <Pressable disabled={busy || !email.trim()} onPress={sendMagicLink}>
        <ThemedText style={[styles.link, !email.trim() && styles.linkDisabled]}>
          {email.trim() ? 'Or send me a magic link instead' : 'Enter your email above to send a magic link'}
        </ThemedText>
      </Pressable>
      <Pressable disabled={busy || !email.trim()} onPress={sendPasswordReset}>
        <ThemedText style={[styles.link, !email.trim() && styles.linkDisabled]}>
          {email.trim() ? 'Forgot password?' : 'Enter your email above to reset your password'}
        </ThemedText>
      </Pressable>

      {status && <ThemedText style={styles.status}>{status}</ThemedText>}
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
  },
  row: { flexDirection: 'row', gap: 12, marginTop: 8 },
  button: { flex: 1, backgroundColor: '#0a84ff', borderRadius: 10, padding: 14, alignItems: 'center' },
  secondary: { backgroundColor: '#3a3a3c' },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '600' },
  link: { textAlign: 'center', marginTop: 16, color: '#0a84ff' },
  linkDisabled: { color: '#888' },
  status: { color: '#ff9f0a', textAlign: 'center' },
});
