/**
 * Portfolio auth via gateway principal session (Auth0, Google, or local test sign-in).
 * Local: VITE_IDENTITY_AUTH_ENABLED=true in .env.local.
 * Production IdP: Auth0 Authorization Code Flow → aadharcha_session cookie.
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { SSOUser } from '@/lib/api';
import { authFetchBase } from '@/lib/identityUrls';

const LOCAL_IDENTITY_AUTH_ENABLED = import.meta.env.VITE_IDENTITY_AUTH_ENABLED === 'true';
const AUDIENCE = 'ondcseller';

function matchesAudience(user: SSOUser): boolean {
  return user.audience === AUDIENCE || user.audience === 'seller';
}

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

function authUrl(path: string): string {
  const base = authFetchBase();
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SSOUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const validateSession = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(authUrl('/api/auth/me'), {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        const nextUser = data.data as SSOUser | null;
        if (!nextUser) {
          setUser(null);
          return;
        }
        if (!matchesAudience(nextUser)) {
          setUser(null);
          setError('Signed in for a different app. Sign in again for Seller.');
          return;
        }
        setUser(nextUser);
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

  useEffect(() => {
    if (import.meta.env.DEV && !LOCAL_IDENTITY_AUTH_ENABLED) {
      setUser(null);
      setLoading(false);
      setError(null);
      return;
    }
    void validateSession();

    const onShow = () => {
      void validateSession();
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  const loginAuth0 = (returnUrl = '/') => {
    const encoded = encodeURIComponent(returnAbsolute(returnUrl));
    window.location.href = authUrl(`/api/auth/auth0/start?aud=${AUDIENCE}&return=${encoded}`);
  };

  const loginDemo = (returnUrl = '/') => {
    const encoded = encodeURIComponent(returnAbsolute(returnUrl));
    window.location.href = authUrl(`/api/auth/demo-continue?aud=${AUDIENCE}&return=${encoded}`);
  };

  const loginGoogle = (returnUrl = '/') => {
    const encoded = encodeURIComponent(returnAbsolute(returnUrl));
    window.location.href = authUrl(`/api/auth/google/start?aud=${AUDIENCE}&return=${encoded}`);
  };

  const login = (returnUrl = '/') => {
    loginAuth0(returnUrl);
  };

  const logout = async () => {
    try {
      await fetch(authUrl('/api/auth/logout'), {
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
