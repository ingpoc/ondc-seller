import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrustNotice } from '@/components/TrustStatus';
import { useSubject, useTrustState } from '@/hooks';
import {
  ensureAgentGuard,
  fetchAgentGuardStatus,
  pauseAgent,
  resumeAgent,
  type AgentGuardAgent,
  type AgentGuardPolicy,
  type AgentGuardReceipt,
} from '@/lib/agentGuardClient';

export function AgentGuardPage() {
  const { walletAddress } = useSubject();
  const trust = useTrustState(walletAddress);
  const [agent, setAgent] = useState<AgentGuardAgent | null>(null);
  const [policy, setPolicy] = useState<AgentGuardPolicy | null>(null);
  const [receipts, setReceipts] = useState<AgentGuardReceipt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!walletAddress) {
      setAgent(null);
      setPolicy(null);
      setReceipts([]);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await ensureAgentGuard(walletAddress);
      const status = await fetchAgentGuardStatus(walletAddress);
      setAgent(status.agent);
      setPolicy(status.policy);
      setReceipts(status.receipts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load AgentGuard');
    } finally {
      setBusy(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handlePauseToggle() {
    if (!walletAddress || !agent) return;
    setBusy(true);
    setError(null);
    try {
      if (agent.status === 'paused') {
        await resumeAgent({ walletAddress, agentId: agent.agent_id });
      } else {
        await pauseAgent({ walletAddress, agentId: agent.agent_id });
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pause/resume failed');
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          AgentGuard
        </div>
        <h1 className="text-3xl font-semibold tracking-[-0.04em] text-foreground">
          Store Operations Assistant
        </h1>
        <p className="text-sm text-muted-foreground">
          Bounded AI authority for refunds. Policy is enforced by AadhaarChain — not the chat
          model.
        </p>
      </div>

      <TrustNotice
        state={trust.state}
        loading={trust.loading}
        error={trust.error}
        reason={trust.reason}
        actionLabel="Resolve seller trust"
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!walletAddress ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Sign in with AadhaarChain so AgentGuard can bind a policy to your wallet.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Policy</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p data-testid="agentguard-policy">
                Routine refunds up to{' '}
                <strong>INR {policy?.refund_auto_max_inr ?? 5000}</strong> may execute
                automatically. Larger refunds require one-time approval.
              </p>
              <p className="text-muted-foreground">
                Agent: {agent?.name ?? '—'} · Status:{' '}
                <span data-testid="agentguard-status">{agent?.status ?? '—'}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  data-testid="agentguard-pause"
                  disabled={busy || !agent}
                  variant={agent?.status === 'paused' ? 'default' : 'outline'}
                  onClick={() => void handlePauseToggle()}
                >
                  {agent?.status === 'paused' ? 'Resume agent' : 'Pause agent'}
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => void refresh()}>
                  Refresh
                </Button>
                <Button asChild variant="outline">
                  <Link to="/orders/seller-demo-1002">Try refunds on demo order</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Receipts (PII-free)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3" data-testid="agentguard-receipts">
              {receipts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No receipts yet.</p>
              ) : (
                receipts.map((receipt) => (
                  <div
                    key={receipt.receipt_id}
                    className="rounded-3xl border border-border/70 bg-card/95 p-4 text-sm"
                    data-receipt-id={receipt.receipt_id}
                  >
                    <p className="font-medium text-foreground">
                      {receipt.action} · INR {receipt.amount_inr} · {receipt.outcome}
                    </p>
                    <p className="text-muted-foreground">
                      {receipt.receipt_id} · {receipt.resource_id}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
