import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { get, post, refreshSession, setAccessToken, setSessionExpiredHandler } from './api';
import type { SessionUser } from './types';

interface AuthState {
  user: SessionUser | null;
  ready: boolean;
  signIn: (data: { accessToken: string; user: SessionUser }) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null));
    // لو كان مسجل دخول قبل كده، نرجّع الجلسة من الكوكي المقفولة
    refreshSession()
      .then(async (ok) => {
        if (ok) setUser(await get<SessionUser>('/auth/me'));
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  const signIn = useCallback((data: { accessToken: string; user: SessionUser }) => {
    setAccessToken(data.accessToken);
    setUser(data.user);
  }, []);

  const signOut = useCallback(async () => {
    await post('/auth/logout').catch(() => undefined);
    setAccessToken(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo(() => ({ user, ready, signIn, signOut }), [user, ready, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
