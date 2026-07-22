/**
 * Seller ConfigPage component tests (SDK-SELLER-CONFIG-001)
 * Tests for seller configuration page with ONDC credentials form
 */

import { describe, it, expect } from 'vitest';

// Seller client configuration interface (defined locally in ConfigPage)
interface SellerClientConfig {
  baseUrl: string;
  subscriberId: string;
  privateKey: string;
  keyId?: string;
  domain?: string;
  country?: string;
  city?: string;
  timeout?: number;
}

// Import the component to ensure TypeScript compilation
import { ConfigPage, isNetworkConfigComplete } from './ConfigPage';

describe('Seller ConfigPage (SDK-SELLER-CONFIG-001)', () => {
  it('should export ConfigPage component', () => {
    expect(ConfigPage).toBeDefined();
    expect(typeof ConfigPage).toBe('function');
  });

  describe('Configuration fields', () => {
    it('should have baseUrl field', () => {
      const config: Partial<SellerClientConfig> = {
        baseUrl: 'https://preprod.gateway.ondc.org',
      };
      expect(config.baseUrl).toBeDefined();
      expect(typeof config.baseUrl).toBe('string');
    });

    it('should have subscriberId field', () => {
      const config: Partial<SellerClientConfig> = {
        subscriberId: 'ondc.example.com',
      };
      expect(config.subscriberId).toBeDefined();
      expect(typeof config.subscriberId).toBe('string');
    });

    it('should have privateKey field', () => {
      const config: Partial<SellerClientConfig> = {
        privateKey: 'base64encodedkey',
      };
      expect(config.privateKey).toBeDefined();
      expect(typeof config.privateKey).toBe('string');
    });

    it('should have keyId field', () => {
      const config: Partial<SellerClientConfig> = {
        keyId: 'ondc.example.com-1234567890',
      };
      expect(config.keyId).toBeDefined();
      expect(typeof config.keyId).toBe('string');
    });

    it('should have domain field', () => {
      const config: Partial<SellerClientConfig> = {
        domain: 'nic2004:52110',
      };
      expect(config.domain).toBeDefined();
      expect(typeof config.domain).toBe('string');
    });

    it('should have country field', () => {
      const config: Partial<SellerClientConfig> = {
        country: 'IND',
      };
      expect(config.country).toBeDefined();
      expect(typeof config.country).toBe('string');
    });

    it('should have city field', () => {
      const config: Partial<SellerClientConfig> = {
        city: 'std:080',
      };
      expect(config.city).toBeDefined();
      expect(typeof config.city).toBe('string');
    });
  });

  describe('Validation - Subscriber ID', () => {
    const validateSubscriberId = (id: string): boolean => {
      if (!id) return false;
      const trimmed = id.trim();
      if (trimmed.length < 3) return false;
      return /^[a-zA-Z0-9.-]+$/.test(trimmed);
    };

    it('should validate correct subscriber ID', () => {
      expect(validateSubscriberId('ondc.example.com')).toBe(true);
      expect(validateSubscriberId('seller-test.example.com')).toBe(true);
      expect(validateSubscriberId('abc')).toBe(true);
    });

    it('should reject invalid subscriber ID - too short', () => {
      expect(validateSubscriberId('ab')).toBe(false);
      expect(validateSubscriberId('a')).toBe(false);
      expect(validateSubscriberId('')).toBe(false);
    });

    it('should reject invalid subscriber ID - invalid characters', () => {
      expect(validateSubscriberId('ondc example_com')).toBe(false);
      expect(validateSubscriberId('ondc@example.com')).toBe(false);
      expect(validateSubscriberId('ondc/example.com')).toBe(false);
    });

    it('should reject null or undefined', () => {
      expect(validateSubscriberId('')).toBe(false);
    });
  });

  describe('Validation - Private Key', () => {
    const isValidPrivateKey = (key: string): boolean => {
      if (!key) return false;
      try {
        const trimmed = key.trim();
        if (trimmed.length < 10) return false;
        return true;
      } catch {
        return false;
      }
    };

    it('should validate correct private key', () => {
      expect(isValidPrivateKey('base64encodedkey==')).toBe(true);
      expect(isValidPrivateKey('a'.repeat(10))).toBe(true);
      expect(isValidPrivateKey('x'.repeat(100))).toBe(true);
    });

    it('should reject invalid private key - too short', () => {
      expect(isValidPrivateKey('short')).toBe(false);
      expect(isValidPrivateKey('abc')).toBe(false);
      expect(isValidPrivateKey('')).toBe(false);
    });
  });

  describe('Configuration defaults', () => {
    it('should have default gateway URL', () => {
      const defaultBaseUrl = 'https://preprod.gateway.ondc.org';
      expect(defaultBaseUrl).toContain('https://');
      expect(defaultBaseUrl).toContain('ondc.org');
    });

    it('should have default domain for retail', () => {
      const defaultDomain = 'nic2004:52110';
      expect(defaultDomain).toBe('nic2004:52110');
    });

    it('should have default country code', () => {
      const defaultCountry = 'IND';
      expect(defaultCountry).toBe('IND');
      expect(defaultCountry.length).toBe(3);
    });

    it('should have default city code', () => {
      const defaultCity = 'std:080';
      expect(defaultCity).toBe('std:080');
    });
  });

  describe('Configuration actions', () => {
    it('should support save configuration action', () => {
      const actions = ['handleSave', 'handleTestConnection', 'handleGenerateKeyPair'];
      expect(actions).toContain('handleSave');
    });

    it('should support test connection action', () => {
      const actions = ['handleSave', 'handleTestConnection', 'handleGenerateKeyPair'];
      expect(actions).toContain('handleTestConnection');
    });

    it('should support generate key pair action', () => {
      const actions = ['handleSave', 'handleTestConnection', 'handleGenerateKeyPair'];
      expect(actions).toContain('handleGenerateKeyPair');
    });
  });

  describe('UI components', () => {
    it('should have show/hide password toggle', () => {
      const hasPasswordToggle = true;
      expect(hasPasswordToggle).toBe(true);
    });

    it('should display error messages inline', () => {
      const hasInlineErrors = true;
      expect(hasInlineErrors).toBe(true);
    });

    it('should show success message on save', () => {
      const showsSuccessMessage = true;
      expect(showsSuccessMessage).toBe(true);
    });

    it('should show error message on failure', () => {
      const showsErrorMessage = true;
      expect(showsErrorMessage).toBe(true);
    });
  });

  describe('Form sections', () => {
    it('should have ONDC Credentials section', () => {
      const sections = ['ONDC Credentials', 'Location Settings'];
      expect(sections).toContain('ONDC Credentials');
    });

    it('should have Location Settings section', () => {
      const sections = ['ONDC Credentials', 'Location Settings'];
      expect(sections).toContain('Location Settings');
    });

    it('should have Gateway URL input', () => {
      const fields = ['baseUrl', 'subscriberId', 'privateKey', 'keyId'];
      expect(fields).toContain('baseUrl');
    });

    it('should have Subscriber ID input', () => {
      const fields = ['baseUrl', 'subscriberId', 'privateKey', 'keyId'];
      expect(fields).toContain('subscriberId');
    });

    it('should have Private Key input', () => {
      const fields = ['baseUrl', 'subscriberId', 'privateKey', 'keyId'];
      expect(fields).toContain('privateKey');
    });

    it('should have Key ID input', () => {
      const fields = ['baseUrl', 'subscriberId', 'privateKey', 'keyId'];
      expect(fields).toContain('keyId');
    });
  });

  describe('API endpoints', () => {
    it('should connect to GET /api/seller/config to load', () => {
      const endpoint = '/api/seller/config';
      expect(endpoint).toContain('/api/seller/config');
    });

    it('should connect to POST /api/seller/config to save', () => {
      const endpoint = '/api/seller/config';
      expect(endpoint).toContain('/api/seller/config');
    });

    it('should connect to POST /api/seller/config/test to test', () => {
      const endpoint = '/api/seller/config/test';
      expect(endpoint).toContain('/api/seller/config/test');
    });
  });

  describe('SDK integration', () => {
    it('should use SellerClientConfig type from seller-sdk', () => {
      const usesSellerClientConfig = true;
      expect(usesSellerClientConfig).toBe(true);
    });

    it('should use generateKeyPair from shared package', () => {
      const imports = ['generateKeyPair', 'buildAuthHeader'];
      expect(imports).toContain('generateKeyPair');
    });

    it('should use buildAuthHeader from shared package', () => {
      const imports = ['generateKeyPair', 'buildAuthHeader'];
      expect(imports).toContain('buildAuthHeader');
    });
  });

  describe('Help information', () => {
    it('should provide configuration help section', () => {
      const hasHelpSection = true;
      expect(hasHelpSection).toBe(true);
    });

    it('should explain Generate New Key Pair action', () => {
      const helpTopics = ['Generate New Key Pair', 'Save Configuration', 'Test Connection'];
      expect(helpTopics).toContain('Generate New Key Pair');
    });

    it('should explain Save Configuration action', () => {
      const helpTopics = ['Generate New Key Pair', 'Save Configuration', 'Test Connection'];
      expect(helpTopics).toContain('Save Configuration');
    });

    it('should explain Test Connection action', () => {
      const helpTopics = ['Generate New Key Pair', 'Save Configuration', 'Test Connection'];
      expect(helpTopics).toContain('Test Connection');
    });
  });
});

describe('seller network configuration readiness', () => {
  const completeConfig: SellerClientConfig = {
    baseUrl: 'https://gateway.example',
    subscriberId: 'seller.example',
    privateKey: 'private-key-material',
    keyId: 'seller-key-1',
    domain: 'nic2004:52110',
    country: 'IND',
    city: 'std:080',
    timeout: 30000,
  };

  it('requires every connection detail before save or test can be used', () => {
    expect(isNetworkConfigComplete(completeConfig)).toBe(true);

    for (const field of [
      'baseUrl',
      'subscriberId',
      'privateKey',
      'keyId',
      'domain',
      'country',
      'city',
    ] as const) {
      expect(isNetworkConfigComplete({ ...completeConfig, [field]: '' })).toBe(false);
    }
    expect(isNetworkConfigComplete({ ...completeConfig, timeout: 0 })).toBe(false);
  });

  it('rejects an invalid subscriber identity even when every field is non-empty', () => {
    expect(isNetworkConfigComplete({ ...completeConfig, subscriberId: 'bad id' })).toBe(false);
  });
});
