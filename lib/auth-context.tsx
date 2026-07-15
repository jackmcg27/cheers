import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { parseAuthTokensFromUrl } from '@/lib/deep-link';
import { supabase } from '@/lib/supabase';

type AuthContextValue = {
  session: Session | null;
  initializing: boolean;
  passwordRecovery: boolean;
  clearPasswordRecovery: () => void;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  initializing: true,
  passwordRecovery: false,
  clearPasswordRecovery: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setInitializing(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    function consumeUrl(url: string | null) {
      if (!url) return;
      const tokens = parseAuthTokensFromUrl(url);
      if (!tokens) return;
      if (tokens.type === 'recovery') setPasswordRecovery(true);
      supabase.auth.setSession({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken });
    }

    Linking.getInitialURL().then(consumeUrl);
    const subscription = Linking.addEventListener('url', (event) => consumeUrl(event.url));
    return () => subscription.remove();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        initializing,
        passwordRecovery,
        clearPasswordRecovery: () => setPasswordRecovery(false),
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
