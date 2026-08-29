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
  /** هل فيه حساب مالك أصلًا؟ إذا لأ نعرض صفحة الإعداد الأول */
  initialized: boolean;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [owner, setOwner] = useState<OwnerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(true);

  const refresh = useCallback(async () => {
    const [state, status] = await Promise.all([authApi.session(), authApi.status()]);
    setOwner(state.owner);
    setInitialized(status.initialized);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [state, status] = await Promise.all([authApi.session(), authApi.status()]);
        if (!cancelled) {
          setOwner(state.owner);
          setInitialized(status.initialized);
        }
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
    setInitialized(true);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setOwner(null);
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({ owner, loading, initialized, login, logout, refresh }),
    [owner, loading, initialized, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth لازم يكون داخل AuthProvider');
  return context;
}
