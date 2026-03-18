import { AgentChat, Alert, Badge, PageLayout, PageHeader } from '@portfolio-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { useAgentRuntime } from '@/hooks/useAgentEntitlement';
import { useTrustState } from '@/hooks/useTrustState';
import { TrustNotice } from '@/components/TrustStatus';

export function AgentChatPage(): React.ReactElement {
  const { publicKey } = useWallet();
  const { user, loading: authLoading } = useAuthContext();
  const walletAddress = publicKey?.toBase58() ?? null;
  const subjectId = user?.wallet_address ?? walletAddress;
  const trust = useTrustState(walletAddress);
  const runtime = useAgentRuntime(subjectId, walletAddress);
  const showAgent = Boolean(subjectId) && runtime.agent_access;
  const usageLabel =
    runtime.usage.requests_limit > 0
      ? `Usage ${runtime.usage.requests_used}/${runtime.usage.requests_limit}`
      : `${runtime.usage.requests_used} requests this period`;

  return (
    <PageLayout>
      <PageHeader
        title="Seller Agent Assistant"
        subtitle="Chat with the AI agent to manage your catalog, optimize listings, and analyze pricing."
      />
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge tone={runtime.runtime_available ? 'success' : 'warning'}>
            Runtime {runtime.auth_mode}
          </Badge>
          <Badge tone={trust.state === 'verified' ? 'success' : 'warning'}>
            {trust.state === 'verified' ? 'Verified seller tools enabled' : 'Read-only seller guidance'}
          </Badge>
          <Badge tone="info">{runtime.model}</Badge>
          <Badge tone="info">{usageLabel}</Badge>
        </div>

        {!subjectId && !authLoading ? (
          <Alert
            tone="warning"
            title="Authentication required"
            description="Sign in to AadhaarChain or connect a verified seller wallet before starting the seller agent."
          />
        ) : null}

        {subjectId && !runtime.runtime_available ? (
          <Alert
            tone="warning"
            title="Claude runtime unavailable"
            description={runtime.blocked_reason ?? 'Configure supported Claude Agent SDK auth or use the local Claude CLI dev adapter on localhost.'}
          />
        ) : null}

        {subjectId && runtime.agent_access && trust.state !== 'verified' ? (
          <TrustNotice
            state={trust.state}
            loading={trust.loading}
            error={trust.error}
            reason={trust.reason}
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
