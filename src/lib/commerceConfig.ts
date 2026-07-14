import { isLoopbackUrl, isLocalBrowserHost, rejectLoopbackOnDeployedHost } from './loopback';

const RAW_COMMERCE_API_BASE = import.meta.env.VITE_API_BASE_URL?.trim() || '';
const COMMERCE_DEMO_MODE_OVERRIDE = import.meta.env.VITE_COMMERCE_DEMO_MODE;
const LOCAL_COMMERCE_BACKEND_RE = /^https?:\/\/(localhost|127\.0\.0\.1):3001$/i;

function resolveCommerceApiBase(raw: string): string {
  if (!raw) return '';
  if (!isLocalBrowserHost() && isLoopbackUrl(raw)) return '';
  return rejectLoopbackOnDeployedHost(raw, '');
}

const commerceApiBase = resolveCommerceApiBase(RAW_COMMERCE_API_BASE);

export const COMMERCE_DEMO_MODE = COMMERCE_DEMO_MODE_OVERRIDE === 'true' || (
  import.meta.env.DEV &&
  COMMERCE_DEMO_MODE_OVERRIDE !== 'false' &&
  LOCAL_COMMERCE_BACKEND_RE.test(commerceApiBase || RAW_COMMERCE_API_BASE)
);

export const COMMERCE_API_BASE = COMMERCE_DEMO_MODE ? '' : commerceApiBase;

/** Exchange label: Simulated only when demo mode is on; live builds show ONDC network. */
export const COMMERCE_EXCHANGE_LABEL = COMMERCE_DEMO_MODE
  ? 'Simulated exchange'
  : 'ONDC network';

export function buildCommerceUrl(endpoint: string): string {
  return COMMERCE_API_BASE ? `${COMMERCE_API_BASE}${endpoint}` : endpoint;
}
