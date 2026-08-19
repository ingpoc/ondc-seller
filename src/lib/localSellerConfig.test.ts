import { beforeEach, describe, expect, it } from 'vitest';
import type { PortfolioTrustState } from './trust';
import {
  canMutateSellerConfig,
  readLocalSellerConfig,
  saveVerifiedLocalSellerConfig,
  type SellerClientConfig,
} from './localSellerConfig';

const validConfig: SellerClientConfig = {
  baseUrl: 'https://preprod.gateway.ondc.org',
  subscriberId: 'seller.example',
  privateKey: 'local-private-key',
  keyId: 'seller-key-1',
  domain: 'nic2004:52110',
  country: 'IND',
  city: 'std:080',
  timeout: 30000,
};

describe('localSellerConfig trust policy', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('allows seller network configuration changes only for verified trust', () => {
    const states: PortfolioTrustState[] = [
      'no_identity',
      'identity_present_unverified',
      'verified',
      'manual_review',
      'revoked_or_blocked',
    ];

    expect(Object.fromEntries(states.map((state) => [state, canMutateSellerConfig(state)]))).toEqual({
      no_identity: false,
      identity_present_unverified: false,
      verified: true,
      manual_review: false,
      revoked_or_blocked: false,
    });
  });

  it('blocks local seller configuration persistence when trust is not verified', () => {
    expect(() => saveVerifiedLocalSellerConfig(validConfig, 'manual_review')).toThrow(
      'Verified seller trust is required before changing seller network configuration.',
    );

    expect(readLocalSellerConfig()).toBeNull();
  });

  it('persists local seller configuration when trust is verified', () => {
    saveVerifiedLocalSellerConfig(validConfig, 'verified');

    expect(readLocalSellerConfig()).toMatchObject({
      subscriberId: 'seller.example',
      privateKey: 'local-private-key',
    });
  });
});

describe('parseSellerNetworkConfigPayload', () => {
  it('reads stored credentials from an enveloped seller config payload', async () => {
    const { parseSellerNetworkConfigPayload } = await import('./localSellerConfig');
    expect(
      parseSellerNetworkConfigPayload({
        success: true,
        data: {
          config: {
            baseUrl: 'https://gateway.example',
            subscriberId: 'seller.example',
            keyId: 'seller-key-1',
          },
        },
      }),
    ).toMatchObject({
      source: 'stored',
      config: {
        baseUrl: 'https://gateway.example',
        subscriberId: 'seller.example',
        keyId: 'seller-key-1',
      },
    });
  });

  it('names env-only credentials instead of looking disconnected', async () => {
    const { parseSellerNetworkConfigPayload } = await import('./localSellerConfig');
    const parsed = parseSellerNetworkConfigPayload({
      source: 'env',
      config: { subscriberId: 'ondc.example.com' },
    });
    expect(parsed.source).toBe('env');
    expect(parsed.message).toMatch(/server environment/i);
    expect(parsed.config.subscriberId).toBe('ondc.example.com');
  });

  it('explains an empty form without implying the store is disconnected', async () => {
    const { parseSellerNetworkConfigPayload } = await import('./localSellerConfig');
    const parsed = parseSellerNetworkConfigPayload({});
    expect(parsed.source).toBe('none');
    expect(parsed.message).toMatch(/environment credentials/i);
  });
});
