import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrustNotice } from '@/components/TrustStatus';
import { useSubject, useTrustState } from '@/hooks';
import {
  ensureAgentGuard,
  fetchAgentGuardStatus,
  compileMandate,
  confirmMandate,
  executeProtectedAction,
  pauseAgent,
  resumeAgent,
  type AgentGuardAgent,
  type AgentGuardMandate,
  type AgentGuardPolicy,
  type AgentGuardReceipt,
} from '@/lib/agentGuardClient';
import {
  emptySamanthaMemory,
  loadSamanthaMemoryMerged,
  saveSamanthaMemory,
  type SamanthaMemory,
} from '@/lib/samanthaMemory';
import { COMMERCE_EXCHANGE_LABEL } from '@/lib/commerceConfig';
import { effectiveElevatedTrustState } from '@/lib/trust';

const SELLER_ACTION_OPTIONS: { id: string; label: string }[] = [
  { id: 'seller.catalog.publish', label: 'Publish catalog' },
  { id: 'seller.price.change', label: 'Change price' },
  { id: 'seller.inventory.commit', label: 'Commit inventory' },
  { id: 'seller.order.accept', label: 'Accept orders' },
  { id: 'seller.order.reject', label: 'Reject orders' },
  { id: 'seller.fulfillment.commit', label: 'Fulfilment' },
  { id: 'seller.remedy.promise', label: 'Promise remedy' },
  { id: 'seller.refund.issue', label: 'Issue refund' },
];

function refundMaxFromMandate(
  mandate: AgentGuardMandate | null,
  policy: AgentGuardPolicy | null
): number {
  const auto = mandate?.limits?.auto_approve_max_inr as Record<string, number> | undefined;
  if (auto?.['seller.refund.issue'] != null) return Number(auto['seller.refund.issue']);
  return policy?.refund_auto_max_inr ?? 5000;
}

export function AgentGuardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const latestOutcome = searchParams.get('outcome');
  const latestReceipt = searchParams.get('receipt');
  const pendingApproval = searchParams.get('approval');
  const pendingAmount = Number(searchParams.get('amount') || 0);
  const pendingResource = searchParams.get('resource');
  const { walletAddress, subjectId, principalId } = useSubject();
  const trust = useTrustState(walletAddress);
  const [agent, setAgent] = useState<AgentGuardAgent | null>(null);
  const [mandate, setMandate] = useState<AgentGuardMandate | null>(null);
  const [receipts, setReceipts] = useState<AgentGuardReceipt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refundAutoMax, setRefundAutoMax] = useState(5000);
  const [selectedActions, setSelectedActions] = useState<string[]>(
    SELLER_ACTION_OPTIONS.map((a) => a.id)
  );
  const [memory, setMemory] = useState<SamanthaMemory>(emptySamanthaMemory());
  const [approving, setApproving] = useState(false);

  const refresh = useCallback(async () => {
    setMemory(loadSamanthaMemoryMerged(subjectId));
    if (!subjectId) {
      setAgent(null);
      setMandate(null);
      setReceipts([]);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ensured = await ensureAgentGuard(walletAddress);
      const status = await fetchAgentGuardStatus(walletAddress);
      setAgent(status.agent);
      const nextMandate = ensured.mandate ?? status.mandate ?? null;
      setMandate(nextMandate);
      setReceipts(status.receipts ?? []);
      setRefundAutoMax(refundMaxFromMandate(nextMandate, status.policy));
      if (nextMandate?.allowed_actions?.length) {
        setSelectedActions(nextMandate.allowed_actions);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load AgentGuard');
    } finally {
      setBusy(false);
    }
  }, [subjectId, walletAddress]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const refreshMemory = () => setMemory(loadSamanthaMemoryMerged(subjectId));
    window.addEventListener('seller-samantha-memory-changed', refreshMemory);
    return () => window.removeEventListener('seller-samantha-memory-changed', refreshMemory);
  }, [subjectId]);

  const summary = useMemo(() => {
    const actions = SELLER_ACTION_OPTIONS.filter((a) => selectedActions.includes(a.id))
      .map((a) => a.label)
      .join(', ');
    return `Refunds up to INR ${refundAutoMax} auto-approve. Allowed: ${actions || 'none'}.`;
  }, [refundAutoMax, selectedActions]);

  async function handlePauseToggle() {
    if (!subjectId || !agent) return;
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

  async function handleApproveRefund() {
    if (!pendingApproval || !pendingResource || pendingAmount <= 0) return;
    setApproving(true);
    setError(null);
    try {
      const executed = await executeProtectedAction({
        walletAddress,
        action: 'seller.refund.issue',
        amountInr: pendingAmount,
        resourceId: pendingResource,
        approvalId: pendingApproval,
        payload: { order_id: pendingResource },
      });
      const receiptId = executed.receipt?.receipt_id;
      setSearchParams(receiptId ? { outcome: 'allow', receipt: receiptId } : { outcome: 'allow' });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed');
    } finally {
      setApproving(false);
    }
  }

  async function handleConfirmMandate() {
    if (!subjectId) return;
    setBusy(true);
    setError(null);
    try {
      const compiled = await compileMandate({
        walletAddress,
        agentId: agent?.agent_id,
        refundAutoMaxInr: refundAutoMax,
        allowedActions: selectedActions,
      });
      const confirmed = await confirmMandate({
        walletAddress,
        mandateId: compiled.mandate.mandate_id,
      });
      setMandate(confirmed.mandate);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mandate confirmation failed');
      setBusy(false);
    }
  }

  function toggleAction(id: string) {
    setSelectedActions((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function clearMemory() {
    setMemory(saveSamanthaMemory(subjectId, emptySamanthaMemory()));
  }

  function removeFact(
    kind: keyof Pick<SamanthaMemory, 'likes' | 'dislikes' | 'preferences' | 'notes'>,
    value: string
  ) {
    const next = { ...memory, [kind]: memory[kind].filter((x) => x !== value) };
    setMemory(saveSamanthaMemory(subjectId, next));
  }

  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-8 px-4 py-8 sm:px-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          AgentGuard authority
        </h1>
        <p className="max-w-[55ch] text-base leading-relaxed text-muted-foreground">
          Configure what the store agent may do. AgentGuard enforces limits, not the model.
        </p>
      </div>

      {latestOutcome ? (
        <div
          className="rounded-3xl border border-primary/30 bg-primary/10 px-5 py-4 text-sm"
          data-testid="agentguard-latest-outcome"
        >
          <p className="font-semibold text-foreground">
            {latestOutcome === 'allow'
              ? 'Refund approved and executed'
              : latestOutcome === 'need_approval'
                ? 'Refund is waiting for one-time approval'
                : 'Refund blocked by AgentGuard'}
          </p>
          {latestReceipt ? (
            <p className="mt-1 text-muted-foreground">Receipt {latestReceipt}</p>
          ) : null}
          {latestOutcome === 'need_approval' && pendingApproval ? (
            <Button
              type="button"
              size="sm"
              className="mt-3"
              onClick={() => void handleApproveRefund()}
              disabled={approving}
            >
              {approving ? 'Approving…' : `Approve and execute INR ${pendingAmount}`}
            </Button>
          ) : null}
        </div>
      ) : null}

      <TrustNotice
        state={effectiveElevatedTrustState(trust.state, principalId)}
        loading={trust.loading}
        error={trust.error}
        reason={trust.reason}
        actionLabel="Resolve seller trust"
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!subjectId ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Sign in so AgentGuard can bind a policy to your principal.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Edit mandate</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <label className="block space-y-2" data-testid="agentguard-refund-limit">
                <span className="text-muted-foreground">Auto-approve refunds up to (INR)</span>
                <input
                  type="number"
                  min={0}
                  step={100}
                  className="quant w-full rounded-xl border border-border bg-background px-3 py-2"
                  value={refundAutoMax}
                  onChange={(e) => setRefundAutoMax(Number(e.target.value) || 0)}
                  data-testid="agentguard-refund-max-input"
                />
              </label>
              <fieldset className="space-y-2" data-testid="agentguard-allowed-actions">
                <legend className="text-muted-foreground">Allowed actions</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {SELLER_ACTION_OPTIONS.map((opt) => (
                    <label key={opt.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedActions.includes(opt.id)}
                        onChange={() => toggleAction(opt.id)}
                        data-testid={`agentguard-action-${opt.id}`}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <p className="text-muted-foreground" data-testid="agentguard-mandate-summary">
                {summary}
              </p>
              <p data-testid="agentguard-policy">
                Routine refunds up to <strong className="quant">INR {refundAutoMax}</strong> may
                execute automatically. Larger refunds require one-time approval.
              </p>
              <p className="text-muted-foreground">
                Agent: {agent?.name ?? '—'} · Status:{' '}
                <span data-testid="agentguard-status">{agent?.status ?? '—'}</span>
              </p>
              <p className="text-muted-foreground">
                Mandate:{' '}
                <span data-testid="agentguard-mandate-status">
                  {mandate?.status ?? 'template ready'}
                </span>{' '}
                · {COMMERCE_EXCHANGE_LABEL}; payment rails simulated (not live UPI)
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  data-testid="agentguard-confirm-mandate"
                  disabled={busy || !subjectId || selectedActions.length === 0}
                  onClick={() => void handleConfirmMandate()}
                >
                  Confirm mandate
                </Button>
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

          <Card data-testid="seller-config-samantha">
            <CardHeader>
              <CardTitle>Samantha memory</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {(
                [
                  ['likes', 'Likes'],
                  ['dislikes', 'Dislikes'],
                  ['preferences', 'Preferences'],
                  ['notes', 'Notes'],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <p className="mb-1 text-muted-foreground">{label}</p>
                  {memory[key].length === 0 ? (
                    <p className="text-xs text-muted-foreground">—</p>
                  ) : (
                    <ul className="flex flex-wrap gap-1">
                      {memory[key].map((item) => (
                        <li key={item}>
                          <button
                            type="button"
                            className="rounded-full border border-border px-2 py-0.5 text-xs hover:bg-muted"
                            title="Remove"
                            onClick={() => removeFact(key, item)}
                          >
                            {item} ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              <Button type="button" size="sm" variant="outline" onClick={clearMemory}>
                Clear memory
              </Button>
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
                      {receipt.action} · INR <span className="quant">{receipt.amount_inr}</span> ·{' '}
                      {receipt.outcome}
                    </p>
                    <p className="quant text-muted-foreground">
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
