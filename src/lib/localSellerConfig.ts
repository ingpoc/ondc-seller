import type { PortfolioTrustState } from './trust';
import { assertSellerActionAllowed, canExecuteSellerAction } from './sellerActionPolicy';

const LOCAL_CONFIG_STORAGE_KEY = 'ondc-seller-local-config';
const VERIFIED_CONFIG_MESSAGE =
  'Verified seller trust is required before changing payout or seller configuration.';

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
