import { COMMERCE_API_BASE } from '@/lib/commerceConfig';
import { normalizeLoopbackUrl } from '@/lib/loopback';

export const config = {
  // Gateway for API calls (/api/auth/validate, /api/auth/me)
  identityUrl: normalizeLoopbackUrl(import.meta.env.VITE_IDENTITY_URL || 'http://127.0.0.1:8000'),
  // Frontend for login page redirect (/login)
  identityWebUrl: normalizeLoopbackUrl(import.meta.env.VITE_IDENTITY_WEB_URL || import.meta.env.VITE_IDENTITY_URL || 'http://127.0.0.1:3000'),
  apiUrl: COMMERCE_API_BASE || 'http://127.0.0.1:3001',
} as const;
