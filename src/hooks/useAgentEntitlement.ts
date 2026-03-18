import { useEffect, useMemo, useState } from 'react';
import type { EntitlementSnapshot } from '@/types/agent';

const DEFAULT_ENTITLEMENT: EntitlementSnapshot = {
  app_id: 'ondc-seller',
  subscription_status: 'inactive',
  plan_tier: 'free',
  agent_access: false,
  trust_required_for_write: true,
  usage: {
    requests_used: 0,
    requests_limit: 0,
    period_start: '',
    period_end: '',
    estimated_cost_usd: 0,
  },
  allowed_capabilities: [],
  blocked_reason: 'Authentication required.',
};

export function useAgentEntitlement(subjectId?: string | null, walletAddress?: string | null) {
  const [snapshot, setSnapshot] = useState<EntitlementSnapshot>(DEFAULT_ENTITLEMENT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!subjectId) {
      setSnapshot(DEFAULT_ENTITLEMENT);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch('/api/entitlements/me?app=ondc-seller', {
          headers: {
            'X-User-Id': subjectId,
            ...(walletAddress ? { 'X-Wallet-Address': walletAddress } : {}),
          },
        });
        if (!response.ok) {
          throw new Error(`Entitlement request failed: ${response.status}`);
        }
        const next = (await response.json()) as EntitlementSnapshot;
        if (!cancelled) {
          setSnapshot(next);
        }
      } catch (err) {
        if (!cancelled) {
          setSnapshot(DEFAULT_ENTITLEMENT);
          setError(err instanceof Error ? err.message : 'Failed to load entitlement.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [subjectId, walletAddress]);

  return useMemo(
    () => ({
      ...snapshot,
      loading,
      error,
    }),
    [snapshot, loading, error],
  );
}
