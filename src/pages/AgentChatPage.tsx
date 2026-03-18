import { AgentChat, Alert, Badge, PageLayout, PageHeader } from '@portfolio-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { useAgentEntitlement } from '@/hooks/useAgentEntitlement';
import { useTrustState } from '@/hooks/useTrustState';
import { TrustNotice } from '@/components/TrustStatus';

export function AgentChatPage(): React.ReactElement {
  const { publicKey } = useWallet();
  const { user, loading: authLoading } = useAuthContext();
  const walletAddress = publicKey?.toBase58() ?? null;
  const subjectId = user?.wallet_address ?? walletAddress;
  const trust = useTrustState(walletAddress);
  const entitlement = useAgentEntitlement(subjectId, walletAddress);
  const showAgent = Boolean(subjectId) && entitlement.agent_access;

  return (
    <PageLayout>
      <PageHeader
        title="Seller Agent Assistant"
        subtitle="Chat with the AI agent to manage your catalog, optimize listings, and analyze pricing."
      />
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge tone={entitlement.agent_access ? 'success' : 'warning'}>
            Plan {entitlement.plan_tier || 'free'}
          </Badge>
          <Badge tone={trust.state === 'verified' ? 'success' : 'warning'}>
            {trust.state === 'verified' ? 'Verified seller tools enabled' : 'Read-only seller guidance'}
          </Badge>
          <Badge tone="info">
            Usage {entitlement.usage.requests_used}/{entitlement.usage.requests_limit}
          </Badge>
        </div>

        {!subjectId && !authLoading ? (
          <Alert
            tone="warning"
            title="Authentication required"
            description="Sign in to AadhaarChain or connect a verified seller wallet before starting the seller agent."
          />
        ) : null}

        {subjectId && !entitlement.agent_access ? (
          <Alert
            tone="warning"
            title="Subscription required"
            description={entitlement.blocked_reason ?? 'Active subscription required before starting the seller agent.'}
          />
        ) : null}

        {subjectId && entitlement.agent_access && trust.state !== 'verified' ? (
          <TrustNotice
            state={trust.state}
            loading={trust.loading}
            error={trust.error}
            reason={entitlement.blocked_reason ?? trust.reason}
            actionLabel="Resolve trust in AadhaarChain"
          />
        ) : null}

        {showAgent ? (
          <AgentChat
            endpoint="/api/agent/seller"
            title="Seller Agent"
            placeholder="e.g., Improve my best-selling listing copy"
            requestHeaders={() =>
              subjectId
                ? {
                    'X-User-Id': subjectId,
                    ...(walletAddress ? { 'X-Wallet-Address': walletAddress } : {}),
                  }
                : {}
            }
          />
        ) : null}
      </div>
    </PageLayout>
  );
}
