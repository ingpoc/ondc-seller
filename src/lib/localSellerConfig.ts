import type { PortfolioTrustState } from './trust';
import { assertSellerActionAllowed, canExecuteSellerAction } from './sellerActionPolicy';

const LOCAL_CONFIG_STORAGE_KEY = 'ondc-seller-local-config';
const VERIFIED_CONFIG_MESSAGE =
  'Verified seller trust is required before changing seller network configuration.';

export interface SellerClientConfig {
  baseUrl: string;
  subscriberId: string;
  privateKey: string;
  keyId?: string;
  domain?: string;
  country?: string;
  city?: string;
  timeout?: number;
}

export function readLocalSellerConfig(): Partial<SellerClientConfig> | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(LOCAL_CONFIG_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as Partial<SellerClientConfig>;
  } catch {
    return null;
  }
}

export function saveLocalSellerConfig(config: SellerClientConfig) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(LOCAL_CONFIG_STORAGE_KEY, JSON.stringify(config));
}

export function canMutateSellerConfig(trustState: PortfolioTrustState): boolean {
  return canExecuteSellerAction('seller_config_save', trustState);
}

export function assertCanMutateSellerConfig(trustState: PortfolioTrustState): void {
  try {
    assertSellerActionAllowed('seller_config_save', { trustState });
  } catch {
    throw new Error(VERIFIED_CONFIG_MESSAGE);
  }
}

export function saveVerifiedLocalSellerConfig(
  config: SellerClientConfig,
  trustState: PortfolioTrustState,
) {
  assertCanMutateSellerConfig(trustState);
  saveLocalSellerConfig(config);
}

export function getLocalSellerConfigSummary() {
  const config = readLocalSellerConfig();
  return {
    configured: Boolean(config?.subscriberId && config?.privateKey),
    subscriber_id: config?.subscriberId ?? null,
    base_url: config?.baseUrl ?? null,
  };
}

export type SellerNetworkConfigSource = 'stored' | 'env' | 'none';

const ENV_SOURCE_RE = /^(env|environment|env[_-]?only)$/i;
const CONFIG_KEYS: Array<keyof SellerClientConfig> = [
  'baseUrl',
  'subscriberId',
  'privateKey',
  'keyId',
  'domain',
  'country',
  'city',
  'timeout',
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickSellerClientConfig(value: Record<string, unknown>): Partial<SellerClientConfig> {
  const next: Partial<SellerClientConfig> = {};
  for (const key of CONFIG_KEYS) {
    if (!(key in value)) continue;
    const raw = value[key];
    if (key === 'timeout') {
      const timeout = Number(raw);
      if (Number.isFinite(timeout)) next.timeout = timeout;
      continue;
    }
    if (typeof raw === 'string') {
      next[key] = raw;
    }
  }
  return next;
}

function looksLikeSellerClientConfig(value: Record<string, unknown> | null): boolean {
  if (!value) return false;
  return CONFIG_KEYS.some((key) => key in value);
}

export function parseSellerNetworkConfigPayload(payload: unknown): {
  config: Partial<SellerClientConfig>;
  source: SellerNetworkConfigSource;
  message?: string;
} {
  const root = asRecord(payload);
  const nested = asRecord(root?.data);
  const sourceRaw = String(
    root?.source ?? nested?.source ?? root?.mode ?? nested?.mode ?? '',
  ).trim();
  const envOnly = Boolean(root?.env_only ?? nested?.env_only) || ENV_SOURCE_RE.test(sourceRaw);
  const configRecord =
    asRecord(root?.config) ??
    asRecord(nested?.config) ??
    (looksLikeSellerClientConfig(nested) ? nested : null) ??
    (looksLikeSellerClientConfig(root) ? root : null);
  const config = configRecord ? pickSellerClientConfig(configRecord) : {};
  const hasCredentials = Boolean(
    config.baseUrl || config.subscriberId || config.privateKey || config.keyId,
  );

  if (envOnly) {
    return {
      config,
      source: 'env',
      message:
        'ONDC credentials are provided by the server environment. This tab reads them when the server exposes them; it does not generate or save keys automatically.',
    };
  }
  if (hasCredentials) {
    return { config, source: 'stored' };
  }
  return {
    config,
    source: 'none',
    message:
      'No seller network credentials are saved in this browser form. The gateway may still use environment credentials that this page cannot display.',
  };
}
