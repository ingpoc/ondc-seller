import { COMMERCE_API_BASE } from '@/lib/commerceConfig';
import { IDENTITY_URL, IDENTITY_WEB_URL } from '@/lib/identityUrls';

export const config = {
  // Gateway for API calls (/api/auth/validate, /api/auth/me)
  identityUrl: IDENTITY_URL,
  // Frontend for login page redirect (/login)
  identityWebUrl: IDENTITY_WEB_URL,
  apiUrl: COMMERCE_API_BASE || 'http://127.0.0.1:3001',
} as const;
