import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { authApi, type OwnerProfile } from './api';

interface AuthState {
  owner: OwnerProfile | null;
  loading: boolean;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [owner, setOwner] = useState<OwnerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const state = await authApi.session();
    setOwner(state.owner);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const state = await authApi.session();
        if (!cancelled) setOwner(state.owner);
      } catch {
        if (!cancelled) setOwner(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (password: string) => {
    await authApi.login(password);
    const state = await authApi.session();
    setOwner(state.owner);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setOwner(null);
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({ owner, loading, login, logout, refresh }),
    [owner, loading, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth لازم يكون داخل AuthProvider');
  return context;
}
