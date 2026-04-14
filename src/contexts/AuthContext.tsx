import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { SSOUser } from '@/lib/api';
import { IDENTITY_URL, IDENTITY_WEB_URL } from '@/lib/identityUrls';

const LOCAL_IDENTITY_AUTH_ENABLED = import.meta.env.VITE_IDENTITY_AUTH_ENABLED === 'true';

export type { SSOUser };

export interface AuthContextValue {
  /** Current authenticated user (null if not logged in) */
  user: SSOUser | null;
  /** Is user currently authenticated */
  isAuthenticated: boolean;
  /** Is authentication state loading */
  loading: boolean;
  /** Any authentication error */
  error: string | null;
  /** Login to SSO provider */
  login: (returnUrl?: string) => void;
  /** Logout from SSO provider */
  logout: () => void;
  /** Refresh user session from SSO */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SSOUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (import.meta.env.DEV && !LOCAL_IDENTITY_AUTH_ENABLED) {
      setUser(null);
      setLoading(false);
      setError(null);
      return;
    }
    validateSession();
  }, []);

  const validateSession = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${IDENTITY_URL}/api/auth/me`, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.data);
      } else {
        setUser(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auth check failed');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = (returnUrl = '/') => {
    const encodedReturn = encodeURIComponent(window.location.origin + returnUrl);
    // Use identityWebUrl for login page (frontend), not gateway
    window.location.href = `${IDENTITY_WEB_URL}/login?return=${encodedReturn}`;
  };

  const logout = async () => {
    try {
      await fetch(`${IDENTITY_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      window.location.href = '/';
    }
  };

  const refresh = () => validateSession();

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: user !== null,
        loading,
        error,
        login,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuthContext must be used within AuthProvider');
  return context;
}
