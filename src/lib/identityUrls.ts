import { normalizeLoopbackUrl } from './loopback';

const LOCAL_IDENTITY_API_URL = 'http://127.0.0.1:43101';
const LOCAL_IDENTITY_WEB_URL = 'http://127.0.0.1:43100';
const DEPLOYED_IDENTITY_API_URL = 'https://identity-aadhar-gateway-main.onrender.com';
const DEPLOYED_IDENTITY_WEB_URL = 'https://aadharcha.in';

function resolveConfiguredUrl(configured: string | undefined, fallback: string) {
  return normalizeLoopbackUrl(configured?.trim() || fallback);
}

const IS_LOCAL_BROWSER_HOST =
  typeof window !== 'undefined'
    ? window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === '[::1]'
    : import.meta.env.DEV;

export function resolveIdentityApiUrl() {
  return resolveConfiguredUrl(
    import.meta.env.VITE_IDENTITY_URL,
    IS_LOCAL_BROWSER_HOST ? LOCAL_IDENTITY_API_URL : DEPLOYED_IDENTITY_API_URL,
  );
}

export function resolveIdentityWebUrl() {
  return resolveConfiguredUrl(
    import.meta.env.VITE_IDENTITY_WEB_URL,
    IS_LOCAL_BROWSER_HOST ? LOCAL_IDENTITY_WEB_URL : DEPLOYED_IDENTITY_WEB_URL,
  );
}

export function resolveTrustApiUrl() {
  return resolveConfiguredUrl(
    import.meta.env.VITE_TRUST_API_URL,
    IS_LOCAL_BROWSER_HOST ? LOCAL_IDENTITY_API_URL : DEPLOYED_IDENTITY_API_URL,
  );
}

export const IDENTITY_URL = resolveIdentityApiUrl();
export const IDENTITY_WEB_URL = resolveIdentityWebUrl();
export const TRUST_API_URL = resolveTrustApiUrl();
