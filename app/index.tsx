import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '@/lib/auth-context';

export default function Index() {
  const { session, initializing, passwordRecovery } = useAuth();

  if (initializing) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (passwordRecovery) return <Redirect href="/(auth)/reset-password" />;

  return <Redirect href={session ? '/(tabs)' : '/(auth)/sign-in'} />;
}
