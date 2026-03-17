import { useState, useEffect } from 'react';
import { CARD, COLORS, SPACING, TYPOGRAPHY, DRAMS } from '@portfolio-ui';
import { PageLayout, PageHeader, DramsInput, DramsButton } from '@portfolio-ui';
import { useTrustState } from '../hooks/useTrustState';
import { TrustNotice } from '../components/TrustStatus';
import { useWallet } from '@solana/wallet-adapter-react';

// Seller client configuration interface
interface SellerClientConfig {
  /** ONDC gateway base URL */
  baseUrl: string;
  /** Subscriber ID (e.g., "ondc.example.com") */
  subscriberId: string;
  /** Base64 encoded Ed25519 private key */
  privateKey: string;
  /** Unique key identifier */
  keyId?: string;
  /** Default domain for requests */
  domain?: string;
  /** Default country code */
  country?: string;
  /** Default city code */
  city?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

interface ConfigError {
  field: string;
  message: string;
}

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

const validateSubscriberId = (id: string): boolean => {
  if (!id) return false;
  const trimmed = id.trim();
  if (trimmed.length < 3) return false;
  return /^[a-zA-Z0-9.-]+$/.test(trimmed);
};

const HELPER_TEXT_STYLE = {
  ...TYPOGRAPHY.bodySmall,
  color: DRAMS.textLight,
};

export function ConfigPage() {
  const { publicKey } = useWallet();
  const trust = useTrustState(publicKey?.toBase58() ?? null);
  const [config, setConfig] = useState<SellerClientConfig>({
    baseUrl: 'https://gateway.ondc.org',
    subscriberId: '',
    privateKey: '',
    keyId: '',
    domain: 'nic2004:52110',
    country: 'IND',
    city: 'std:080',
    timeout: 30000,
  });

  const [errors, setErrors] = useState<ConfigError[]>([]);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);

  // Load existing config on mount
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/seller/config`);
      if (response.ok) {
        const data = await response.json();
        if (data.config) {
          setConfig((prev: SellerClientConfig) => ({ ...prev, ...data.config }));
        }
      }
    } catch {
      // Ignore error if no config exists yet
    } finally {
      setLoading(false);
    }
  };

  const validate = (): ConfigError[] => {
    const validationErrors: ConfigError[] = [];

    if (!validateSubscriberId(config.subscriberId)) {
      validationErrors.push({
        field: 'subscriberId',
        message:
          'Subscriber ID must be at least 3 characters and contain only letters, numbers, dots, and hyphens',
      });
    }

    if (!isValidPrivateKey(config.privateKey)) {
      validationErrors.push({
        field: 'privateKey',
        message: 'Private key is required and must be at least 10 characters',
      });
    }

    if (!config.baseUrl) {
      validationErrors.push({ field: 'baseUrl', message: 'Gateway URL is required' });
    }

    return validationErrors;
  };

  const handleSave = async () => {
    const validationErrors = validate();
    setErrors(validationErrors);
    setTestResult(null);

    if (validationErrors.length > 0) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/seller/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        throw new Error('Failed to save configuration');
      }

      setTestResult({ success: true, message: 'Configuration saved successfully' });
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to save configuration',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateKeyPair = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/seller/config/generate-keys`, {
        method: 'POST',
      });
      if (response.ok) {
        throw new Error('Failed to generate key pair');
      }
      const data = await response.json();
      setConfig((prev: SellerClientConfig) => ({
        ...prev,
        privateKey: data.privateKey,
        keyId: `${config.subscriberId || 'seller'}-${Date.now()}`,
      }));
      setTestResult({
        success: true,
        message: 'New key pair generated. Remember to save your configuration.',
      });
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to generate key pair',
      });
    }
  };

  const handleTestConnection = async () => {
    const validationErrors = validate();
    setErrors(validationErrors);
    setTestResult(null);

    if (validationErrors.length > 0) {
      return;
    }

    setTesting(true);
    try {
      // Test connection via server API
      const response = await fetch(`${API_BASE}/api/seller/config/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });

      if (!response.ok) {
        throw new Error('Connection test failed');
      }

      const result = await response.json();
      setTestResult({
        success: true,
        message: result.message || 'Connection test successful',
      });
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Connection test failed',
      });
    } finally {
      setTesting(false);
    }
  };

  const getFieldError = (field: keyof SellerClientConfig): string | undefined => {
    return errors.find((e) => e.field === field)?.message;
  };

  if (loading && !config.subscriberId) {
    return (
      <PageLayout>
        <p style={{ ...TYPOGRAPHY.body, color: DRAMS.textLight }}>Loading configuration...</p>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <PageHeader
        title="Seller Configuration"
        subtitle="Configure your ONDC seller credentials and connection settings"
      />

      <TrustNotice
        state={trust.state}
        loading={trust.loading}
        error={trust.error}
        reason={trust.reason}
        actionLabel="Resolve operator trust in AadhaarChain"
      />

      {/* Result Message */}
      {testResult && (
        <div
          style={{
            ...CARD.base,
            backgroundColor: testResult.success ? '#f0fdf4' : '#fef2f2',
            borderColor: testResult.success ? '#86efac' : '#fecaca',
            marginBottom: SPACING.xl,
            padding: SPACING.lg,
          }}
        >
          <p
            style={{
              margin: 0,
              ...TYPOGRAPHY.label,
              color: testResult.success ? '#166534' : '#dc2626',
            }}
          >
            {testResult.success ? '✓' : '✕'} {testResult.message}
          </p>
        </div>
      )}

      {/* Configuration Form */}
      <div style={{ ...CARD.base, marginBottom: SPACING.xl }}>
        <h2 style={{ ...TYPOGRAPHY.h3, color: DRAMS.textDark, marginBottom: SPACING.xl }}>
          ONDC Credentials
        </h2>

        {/* Gateway URL */}
        <div style={{ marginBottom: SPACING.xl }}>
          <label
            style={{
              display: 'block',
              marginBottom: SPACING.sm,
              ...TYPOGRAPHY.label,
              color: DRAMS.textDark,
            }}
          >
            Gateway URL *
          </label>
          <DramsInput
            type="text"
            value={config.baseUrl}
            onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
            placeholder="https://gateway.ondc.org"
            error={!!getFieldError('baseUrl')}
          />
          {getFieldError('baseUrl') && (
            <p style={{ marginTop: SPACING.xs, color: COLORS.error, ...TYPOGRAPHY.bodySmall }}>
              {getFieldError('baseUrl')}
            </p>
          )}
        </div>

        {/* Subscriber ID */}
        <div style={{ marginBottom: SPACING.xl }}>
          <label
            style={{
              display: 'block',
              marginBottom: SPACING.sm,
              ...TYPOGRAPHY.label,
              color: DRAMS.textDark,
            }}
          >
            Subscriber ID *
          </label>
          <DramsInput
            type="text"
            value={config.subscriberId}
            onChange={(e) => setConfig({ ...config, subscriberId: e.target.value })}
            placeholder="ondc.example.com"
            error={!!getFieldError('subscriberId')}
          />
          {getFieldError('subscriberId') && (
            <p style={{ marginTop: SPACING.xs, color: COLORS.error, ...TYPOGRAPHY.bodySmall }}>
              {getFieldError('subscriberId')}
            </p>
          )}
          <p style={HELPER_TEXT_STYLE}>
            Your unique ONDC subscriber identifier (e.g., ondc.example.com)
          </p>
        </div>

        {/* Private Key */}
        <div style={{ marginBottom: SPACING.xl }}>
          <label
            style={{
              display: 'block',
              marginBottom: SPACING.sm,
              ...TYPOGRAPHY.label,
              color: DRAMS.textDark,
            }}
          >
            Private Key *
          </label>
          <div style={{ display: 'flex', gap: SPACING.md }}>
            <DramsInput
              type={showPrivateKey ? 'text' : 'password'}
              value={config.privateKey}
              onChange={(e) => setConfig({ ...config, privateKey: e.target.value })}
              placeholder="Base64 encoded Ed25519 private key"
              error={!!getFieldError('privateKey')}
              style={{ flex: 1, fontFamily: 'monospace' } as React.CSSProperties}
            />
            <DramsButton
              type="button"
              onClick={() => setShowPrivateKey(!showPrivateKey)}
              variant="gray"
            >
              {showPrivateKey ? 'Hide' : 'Show'}
            </DramsButton>
          </div>
          {getFieldError('privateKey') && (
            <p style={{ marginTop: SPACING.xs, color: COLORS.error, ...TYPOGRAPHY.bodySmall }}>
              {getFieldError('privateKey')}
            </p>
          )}
          <div style={{ display: 'flex', gap: SPACING.md }}>
            <DramsButton type="button" onClick={handleGenerateKeyPair} variant="gray">
              Generate New Key Pair
            </DramsButton>
          </div>
          <p style={HELPER_TEXT_STYLE}>Ed25519 private key for signing ONDC requests</p>
        </div>

        {/* Key ID */}
        <div style={{ marginBottom: SPACING.xl }}>
          <label
            style={{
              display: 'block',
              marginBottom: SPACING.sm,
              ...TYPOGRAPHY.label,
              color: DRAMS.textDark,
            }}
          >
            Key ID
          </label>
          <DramsInput
            type="text"
            value={config.keyId}
            onChange={(e) => setConfig({ ...config, keyId: e.target.value })}
            placeholder="ondc.example.com-1234567890"
          />
          <p style={HELPER_TEXT_STYLE}>
            Unique identifier for this key (auto-generated when using Generate Key Pair)
          </p>
        </div>
      </div>

      {/* Location Settings */}
      <div style={{ ...CARD.base, marginBottom: SPACING.xl }}>
        <h2 style={{ ...TYPOGRAPHY.h3, color: DRAMS.textDark, marginBottom: SPACING.xl }}>
          Location Settings
        </h2>

        {/* Domain */}
        <div style={{ marginBottom: SPACING.xl }}>
          <label
            style={{
              display: 'block',
              marginBottom: SPACING.sm,
              ...TYPOGRAPHY.label,
              color: DRAMS.textDark,
            }}
          >
            Domain
          </label>
          <DramsInput
            type="text"
            value={config.domain}
            onChange={(e) => setConfig({ ...config, domain: e.target.value })}
            placeholder="nic2004:52110"
          />
          <p style={HELPER_TEXT_STYLE}>ONDC domain code (default: nic2004:52110 for Retail)</p>
        </div>

        {/* City */}
        <div style={{ marginBottom: SPACING.xl }}>
          <label
            style={{
              display: 'block',
              marginBottom: SPACING.sm,
              ...TYPOGRAPHY.label,
              color: DRAMS.textDark,
            }}
          >
            City
          </label>
          <DramsInput
            type="text"
            value={config.city}
            onChange={(e) => setConfig({ ...config, city: e.target.value })}
            placeholder="std:080"
          />
          <p style={HELPER_TEXT_STYLE}>City code (e.g., std:080 for Bangalore)</p>
        </div>

        {/* Country */}
        <div style={{ marginBottom: SPACING.xl }}>
          <label
            style={{
              display: 'block',
              marginBottom: SPACING.sm,
              ...TYPOGRAPHY.label,
              color: DRAMS.textDark,
            }}
          >
            Country
          </label>
          <DramsInput
            type="text"
            value={config.country}
            onChange={(e) => setConfig({ ...config, country: e.target.value })}
            placeholder="IND"
            maxLength={3}
          />
          <p style={HELPER_TEXT_STYLE}>ISO 3166-1 alpha-2 country code (default: IND for India)</p>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: SPACING.md, flexWrap: 'wrap' }}>
        <DramsButton type="button" onClick={handleSave} disabled={loading} loading={loading}>
          {loading ? 'Saving...' : 'Save Configuration'}
        </DramsButton>

        <DramsButton
          type="button"
          onClick={handleTestConnection}
          disabled={testing}
          loading={testing}
          variant="gray"
        >
          {testing ? 'Testing...' : 'Test Connection'}
        </DramsButton>

        {testResult && (
          <DramsButton
            type="button"
            onClick={() => {
              setTestResult(null);
              setErrors([]);
            }}
            variant="gray"
          >
            Clear Messages
          </DramsButton>
        )}
      </div>

      {/* Info Section */}
      <div style={{ marginTop: SPACING.xl, ...CARD.base, padding: SPACING.lg }}>
        <h3 style={{ ...TYPOGRAPHY.h3, color: DRAMS.textDark, marginBottom: SPACING.md }}>
          Configuration Help
        </h3>
        <ul style={{ margin: 0, paddingLeft: SPACING.xl, ...TYPOGRAPHY.body }}>
          <li style={{ marginBottom: SPACING.sm }}>
            <span style={{ ...TYPOGRAPHY.label, color: DRAMS.orange }}>Generate New Key Pair:</span>{' '}
            Creates a new Ed25519 key pair for signing ONDC requests
          </li>
          <li style={{ marginBottom: SPACING.sm }}>
            <span style={{ ...TYPOGRAPHY.label, color: DRAMS.orange }}>Save Configuration:</span>{' '}
            Stores your configuration securely on the server
          </li>
          <li>
            <span style={{ ...TYPOGRAPHY.label, color: DRAMS.orange }}>Test Connection:</span>{' '}
            Verifies your credentials and tests connectivity to the ONDC gateway
          </li>
        </ul>
      </div>
    </PageLayout>
  );
}
