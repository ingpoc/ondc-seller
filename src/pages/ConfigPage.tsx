import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { TrustNotice } from '../components/TrustStatus';
import { useTrustState } from '../hooks/useTrustState';
import { COMMERCE_DEMO_MODE, buildCommerceUrl } from '../lib/commerceConfig';
import {
  readLocalSellerConfig,
  saveLocalSellerConfig,
  type SellerClientConfig,
} from '../lib/localSellerConfig';

interface ConfigError {
  field: string;
  message: string;
}

const INITIAL_CONFIG: SellerClientConfig = {
  baseUrl: 'https://gateway.ondc.org',
  subscriberId: '',
  privateKey: '',
  keyId: '',
  domain: 'nic2004:52110',
  country: 'IND',
  city: 'std:080',
  timeout: 30000,
};

const isValidPrivateKey = (key: string): boolean => {
  if (!key) return false;
  try {
    const trimmed = key.trim();
    return trimmed.length >= 10;
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

function createDemoPrivateKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes));
}

export function ConfigPage() {
  const { publicKey } = useWallet();
  const trust = useTrustState(publicKey?.toBase58() ?? null);
  const [config, setConfig] = useState<SellerClientConfig>(INITIAL_CONFIG);
  const [errors, setErrors] = useState<ConfigError[]>([]);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);

  useEffect(() => {
    void loadConfig();
  }, []);

  async function loadConfig() {
    setLoading(true);
    try {
      if (COMMERCE_DEMO_MODE) {
        const localConfig = readLocalSellerConfig();
        if (localConfig) {
          setConfig((prev) => ({ ...prev, ...localConfig }));
        }
        return;
      }

      const response = await fetch(buildCommerceUrl('/api/seller/config'));
      if (response.ok) {
        const data = await response.json();
        if (data.config) {
          setConfig((prev) => ({ ...prev, ...data.config }));
        }
      }
    } catch {
      // Ignore initial fetch errors when config has not been created yet.
    } finally {
      setLoading(false);
    }
  }

  function validate(): ConfigError[] {
    const validationErrors: ConfigError[] = [];

    if (!validateSubscriberId(config.subscriberId)) {
      validationErrors.push({
        field: 'subscriberId',
        message:
          'Subscriber ID must be at least 3 characters and contain only letters, numbers, dots, and hyphens.',
      });
    }

    if (!isValidPrivateKey(config.privateKey)) {
      validationErrors.push({
        field: 'privateKey',
        message: 'Private key is required and must be at least 10 characters.',
      });
    }

    if (!config.baseUrl) {
      validationErrors.push({ field: 'baseUrl', message: 'Gateway URL is required.' });
    }

    return validationErrors;
  }

  async function handleSave() {
    const validationErrors = validate();
    setErrors(validationErrors);
    setTestResult(null);

    if (validationErrors.length > 0) {
      return;
    }

    setLoading(true);
    try {
      if (COMMERCE_DEMO_MODE) {
        saveLocalSellerConfig(config);
        setTestResult({
          success: true,
          message: 'Configuration saved locally for browser testing.',
        });
        return;
      }

      const response = await fetch(buildCommerceUrl('/api/seller/config'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        throw new Error('Failed to save configuration');
      }

      setTestResult({ success: true, message: 'Configuration saved successfully.' });
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to save configuration.',
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateKeyPair() {
    try {
      if (COMMERCE_DEMO_MODE) {
        setConfig((prev) => ({
          ...prev,
          privateKey: createDemoPrivateKey(),
          keyId: `${prev.subscriberId || 'seller'}-${Date.now()}`,
        }));
        setTestResult({
          success: true,
          message:
            'Generated a local demo key pair. Save the configuration to persist it for browser testing.',
        });
        return;
      }

      const response = await fetch(buildCommerceUrl('/api/seller/config/generate-keys'), {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to generate key pair');
      }
      const data = await response.json();
      setConfig((prev) => ({
        ...prev,
        privateKey: data.privateKey,
        keyId: `${prev.subscriberId || 'seller'}-${Date.now()}`,
      }));
      setTestResult({
        success: true,
        message: 'New key pair generated. Remember to save your configuration.',
      });
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to generate key pair.',
      });
    }
  }

  async function handleTestConnection() {
    const validationErrors = validate();
    setErrors(validationErrors);
    setTestResult(null);

    if (validationErrors.length > 0) {
      return;
    }

    setTesting(true);
    try {
      if (COMMERCE_DEMO_MODE) {
        setTestResult({
          success: true,
          message:
            'Local demo mode is active. Configuration structure looks valid for browser testing.',
        });
        return;
      }

      const response = await fetch(buildCommerceUrl('/api/seller/config/test'), {
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
        message: result.message || 'Connection test successful.',
      });
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Connection test failed.',
      });
    } finally {
      setTesting(false);
    }
  }

  function getFieldError(field: keyof SellerClientConfig): string | undefined {
    return errors.find((error) => error.field === field)?.message;
  }

  if (loading && !config.subscriberId) {
    return (
      <div className="mx-auto flex max-w-[1280px] px-4 py-8 sm:px-6 lg:px-8">
        <p className="text-sm text-muted-foreground">Loading configuration…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Seller configuration
        </div>
        <h1 className="text-3xl font-semibold tracking-[-0.04em] text-foreground">
          Keep the seller node ready for verified operations
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Configure ONDC credentials, gateway routing, and the local seller runtime context without
          leaving the trust-aware shell.
        </p>
      </div>

      <TrustNotice
        state={trust.state}
        loading={trust.loading}
        error={trust.error}
        reason={trust.reason}
        actionLabel="Resolve operator trust in AadhaarChain"
      />

      {testResult ? (
        <Card
          className={
            testResult.success
              ? 'border-primary/20 bg-primary/8'
              : 'border-destructive/20 bg-destructive/5'
          }
        >
          <CardContent className="p-4">
            <Badge className={testResult.success ? 'bg-primary/12 text-primary' : 'bg-destructive/12 text-destructive'}>
              {testResult.success ? 'Configuration healthy' : 'Configuration issue'}
            </Badge>
            <p className="mt-3 text-sm text-muted-foreground">{testResult.message}</p>
          </CardContent>
        </Card>
      ) : null}

      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSave();
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle>ONDC credentials</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="seller-config-base-url">Gateway URL</FieldLabel>
                <FieldContent>
                  <Input
                    id="seller-config-base-url"
                    name="baseUrl"
                    value={config.baseUrl}
                    onChange={(event) => setConfig({ ...config, baseUrl: event.target.value })}
                    placeholder="https://gateway.ondc.org"
                    aria-invalid={!!getFieldError('baseUrl')}
                  />
                  <FieldDescription>Use the ONDC gateway your seller node should target.</FieldDescription>
                  <FieldError>{getFieldError('baseUrl')}</FieldError>
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="seller-config-subscriber-id">Subscriber ID</FieldLabel>
                <FieldContent>
                  <Input
                    id="seller-config-subscriber-id"
                    name="subscriberId"
                    value={config.subscriberId}
                    onChange={(event) => setConfig({ ...config, subscriberId: event.target.value })}
                    placeholder="ondc.example.com"
                    aria-invalid={!!getFieldError('subscriberId')}
                  />
                  <FieldDescription>
                    Match the subscriber identity registered for the seller app.
                  </FieldDescription>
                  <FieldError>{getFieldError('subscriberId')}</FieldError>
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="seller-config-private-key">Private key</FieldLabel>
                <FieldContent>
                  <Input
                    id="seller-config-private-key"
                    name="privateKey"
                    type={showPrivateKey ? 'text' : 'password'}
                    value={config.privateKey}
                    onChange={(event) => setConfig({ ...config, privateKey: event.target.value })}
                    placeholder="Paste or generate a private key"
                    aria-invalid={!!getFieldError('privateKey')}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowPrivateKey((current) => !current)}
                    >
                      {showPrivateKey ? 'Hide key' : 'Show key'}
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => void handleGenerateKeyPair()}>
                      Generate key pair
                    </Button>
                  </div>
                  <FieldError>{getFieldError('privateKey')}</FieldError>
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="seller-config-key-id">Key ID</FieldLabel>
                <FieldContent>
                  <Input
                    id="seller-config-key-id"
                    name="keyId"
                    value={config.keyId}
                    onChange={(event) => setConfig({ ...config, keyId: event.target.value })}
                    placeholder="seller-1712345678901"
                  />
                  <FieldDescription>Used to identify the currently active signing key.</FieldDescription>
                </FieldContent>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Marketplace context</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="seller-config-domain">Domain</FieldLabel>
                <FieldContent>
                  <Input
                    id="seller-config-domain"
                    name="domain"
                    value={config.domain}
                    onChange={(event) => setConfig({ ...config, domain: event.target.value })}
                    placeholder="nic2004:52110"
                  />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="seller-config-country">Country</FieldLabel>
                <FieldContent>
                  <Input
                    id="seller-config-country"
                    name="country"
                    value={config.country}
                    onChange={(event) => setConfig({ ...config, country: event.target.value })}
                    placeholder="IND"
                  />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="seller-config-city">City</FieldLabel>
                <FieldContent>
                  <Input
                    id="seller-config-city"
                    name="city"
                    value={config.city}
                    onChange={(event) => setConfig({ ...config, city: event.target.value })}
                    placeholder="std:080"
                  />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="seller-config-timeout">Timeout (ms)</FieldLabel>
                <FieldContent>
                  <Input
                    id="seller-config-timeout"
                    name="timeout"
                    type="number"
                    value={String(config.timeout)}
                    onChange={(event) =>
                      setConfig({
                        ...config,
                        timeout: Number(event.target.value || 0),
                      })
                    }
                    placeholder="30000"
                  />
                </FieldContent>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving…' : 'Save configuration'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={testing}
            onClick={() => void handleTestConnection()}
          >
            {testing ? 'Testing…' : 'Test connection'}
          </Button>
        </div>
      </form>
    </div>
  );
}
