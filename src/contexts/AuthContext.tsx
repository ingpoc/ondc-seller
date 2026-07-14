/**
 * Portfolio auth via gateway principal session (Auth0, Google, or booth demo).
 * Local: VITE_IDENTITY_AUTH_ENABLED=true in .env.local.
 * Production IdP: Auth0 Authorization Code Flow → aadharcha_session cookie.
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { SSOUser } from '@/lib/api';
import { IDENTITY_URL } from '@/lib/identityUrls';

const LOCAL_IDENTITY_AUTH_ENABLED = import.meta.env.VITE_IDENTITY_AUTH_ENABLED === 'true';
const AUDIENCE = 'ondcseller';

export type { SSOUser };

export interface AuthContextValue {
  user: SSOUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  login: (returnUrl?: string) => void;
  loginAuth0: (returnUrl?: string) => void;
  loginDemo: (returnUrl?: string) => void;
  loginGoogle: (returnUrl?: string) => void;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function returnAbsolute(returnUrl = '/'): string {
  if (returnUrl.startsWith('http')) return returnUrl;
  return `${window.location.origin}${returnUrl.startsWith('/') ? returnUrl : `/${returnUrl}`}`;
}

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
    void validateSession();
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

  const loginAuth0 = (returnUrl = '/') => {
    const encoded = encodeURIComponent(returnAbsolute(returnUrl));
    window.location.href = `${IDENTITY_URL}/api/auth/auth0/start?aud=${AUDIENCE}&return=${encoded}`;
  };

  const loginDemo = (returnUrl = '/') => {
    const encoded = encodeURIComponent(returnAbsolute(returnUrl));
    window.location.href = `${IDENTITY_URL}/api/auth/demo-continue?aud=${AUDIENCE}&return=${encoded}`;
  };

  const loginGoogle = (returnUrl = '/') => {
    const encoded = encodeURIComponent(returnAbsolute(returnUrl));
    window.location.href = `${IDENTITY_URL}/api/auth/google/start?aud=${AUDIENCE}&return=${encoded}`;
  };

  const login = (returnUrl = '/') => {
    loginAuth0(returnUrl);
  };

  const logout = async () => {
    try {
      await fetch(`${IDENTITY_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (logoutError) {
      console.error('Logout error:', logoutError);
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
        loginAuth0,
        loginDemo,
        loginGoogle,
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
