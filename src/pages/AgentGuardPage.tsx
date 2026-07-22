import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, Navigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TrustNotice } from '@/components/TrustStatus';
import { useSubject, useTrustState } from '@/hooks';
import type {
  AgentGuardAction,
  AgentRef,
  IntentReceipt,
  Mandate,
} from '@aadharchain/agentguard-contract';
import {
  ensureAgentGuard,
  fetchAgentGuardStatus,
  compileMandate,
  confirmMandate,
  executeProtectedAction,
  pauseAgent,
  resumeAgent,
  verifyReceipt,
} from '@/lib/agentGuardClient';
import {
  emptySamanthaMemory,
  loadSamanthaMemoryMerged,
  memoryIsEmpty,
  saveSamanthaMemory,
  type SamanthaMemory,
} from '@/lib/samanthaMemory';
import { COMMERCE_EXCHANGE_LABEL } from '@/lib/commerceConfig';
import { customerReference } from '@/lib/displayText';
import { effectiveElevatedTrustState } from '@/lib/trust';

const SELLER_ACTION_OPTIONS: { id: AgentGuardAction; label: string }[] = [
  { id: 'seller.catalog.publish', label: 'Publish catalog' },
  { id: 'seller.catalog.archive', label: 'Archive catalog' },
  { id: 'seller.price.change', label: 'Change price' },
  { id: 'seller.inventory.commit', label: 'Commit inventory' },
  { id: 'seller.order.accept', label: 'Accept orders' },
  { id: 'seller.order.reject', label: 'Reject orders' },
  { id: 'seller.fulfilment.commit', label: 'Fulfilment' },
  { id: 'seller.remedy.promise', label: 'Promise remedy' },
  { id: 'seller.refund.issue', label: 'Issue refund' },
];

function refundMaxFromMandate(mandate: Mandate | null): number {
  const auto = mandate?.limits?.auto_approve_max_inr as Record<string, number> | undefined;
  if (auto?.['seller.refund.issue'] != null) return Number(auto['seller.refund.issue']);
  return 5000;
}

async function withAuthorityLoadTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(new Error('Authority status timed out. Retry to request the current state.')),
          10_000
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type SellerAssistantPanel = 'authority' | 'memory' | 'activity';

export function SellerAssistantSettings({
  panel,
  showPageChrome = false,
}: {
  panel?: SellerAssistantPanel;
  showPageChrome?: boolean;
}) {
  const showAuthority = !panel || panel === 'authority';
  const showMemory = !panel || panel === 'memory';
  const showActivity = !panel || panel === 'activity';
  const [searchParams, setSearchParams] = useSearchParams();
  const [receiptChecks, setReceiptChecks] = useState<Record<string, boolean>>({});
  const latestOutcome = searchParams.get('outcome');
  const latestReceipt = searchParams.get('receipt');
  const pendingApproval = searchParams.get('approval');
  const pendingDecision = searchParams.get('decision');
  const pendingCorrelation = searchParams.get('correlation');
  const pendingAmount = Number(searchParams.get('amount') || 0);
  const pendingResource = searchParams.get('resource');
  const { walletAddress, subjectId, principalId } = useSubject();
  const trust = useTrustState(walletAddress);
  const [agent, setAgent] = useState<AgentRef | null>(null);
  const [mandate, setMandate] = useState<Mandate | null>(null);
  const [receipts, setReceipts] = useState<IntentReceipt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [refundAutoMax, setRefundAutoMax] = useState(5000);
  const [selectedActions, setSelectedActions] = useState<AgentGuardAction[]>(
    SELLER_ACTION_OPTIONS.map((a) => a.id)
  );
  const [memory, setMemory] = useState<SamanthaMemory>(emptySamanthaMemory());
  const [approving, setApproving] = useState(false);
  const authorityReady = !busy && agent !== null && mandate !== null;

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
      const { ensured, status } = await withAuthorityLoadTimeout(
        (async () => {
          const ensured = await ensureAgentGuard(walletAddress);
          const status = await fetchAgentGuardStatus(walletAddress);
          return { ensured, status };
        })()
      );
      const nextAgent = status.agent ?? ensured.agent ?? null;
      const nextMandate = status.mandate ?? ensured.mandate ?? null;
      setAgent(nextAgent);
      setMandate(nextMandate);
      setReceipts(status.receipts ?? []);
      setRefundAutoMax(refundMaxFromMandate(nextMandate));
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
        decisionId: pendingDecision || undefined,
        approvalId: pendingApproval,
        correlationId: pendingCorrelation || undefined,
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
    if (!subjectId || !agent || !mandate) return;
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

  function toggleAction(id: AgentGuardAction) {
    setSelectedActions((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function clearMemory() {
    const confirmed = window.confirm(
      'Clear all Samantha memory for this signed-in seller? This removes saved likes, dislikes, preferences, and notes used in future assistant suggestions. Catalog, orders, and AgentGuard authority will not change.'
    );
    if (!confirmed) return;
    setMemory(saveSamanthaMemory(subjectId, emptySamanthaMemory()));
  }

  function removeFact(
    kind: keyof Pick<SamanthaMemory, 'likes' | 'dislikes' | 'preferences' | 'notes'>,
    value: string
  ) {
    const next = { ...memory, [kind]: memory[kind].filter((x) => x !== value) };
    setMemory(saveSamanthaMemory(subjectId, next));
  }

  async function handleVerifyReceipt(receiptId: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await verifyReceipt({ receiptId });
      setReceiptChecks((prev) => ({ ...prev, [receiptId]: Boolean(result.valid) }));
      if (!result.valid) {
        setError(result.reason || 'Receipt verification failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Receipt verification failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={
        showPageChrome
          ? 'mx-auto flex w-full max-w-[960px] flex-col gap-8 px-4 py-8 sm:px-6'
          : 'flex w-full flex-col gap-4'
      }
    >
      {showPageChrome ? (
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Assistant permissions
          </h1>
          <p className="max-w-[55ch] text-base leading-relaxed text-muted-foreground">
            Samantha is your Seller operations assistant. Set which protected actions she may carry
            out; AgentGuard checks every action independently.
          </p>
        </div>
      ) : null}

      {showAuthority && latestOutcome ? (
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
            <p className="mt-1 text-muted-foreground">
              Authorization reference {customerReference(latestReceipt)}
            </p>
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

      {showAuthority ? (
        <TrustNotice
          state={effectiveElevatedTrustState(trust.state, principalId)}
          loading={trust.loading}
          error={trust.error}
          reason={trust.reason}
          actionLabel="Resolve seller trust"
        />
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!subjectId ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Sign in so AgentGuard can save authority settings for your seller account.
          </CardContent>
        </Card>
      ) : (
        <>
          {showAuthority ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Seller agent permissions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {!authorityReady ? (
                  <div className="space-y-3" role="status" data-testid="agentguard-loading-state">
                    <p className="font-medium text-foreground">
                      {busy ? 'Loading current authority…' : 'Current authority is unavailable.'}
                    </p>
                    <p className="text-muted-foreground">
                      Protected controls remain unavailable until the agent and mandate status are
                      known. This usually takes a few seconds; if it exceeds 10 seconds, a retry
                      action appears.
                    </p>
                    {!busy ? (
                      <Button type="button" variant="secondary" onClick={() => void refresh()}>
                        Retry authority status
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <label className="block space-y-2" data-testid="agentguard-refund-limit">
                      <span className="text-muted-foreground">
                        Auto-approve refunds up to (INR)
                      </span>
                      <input
                        type="number"
                        min={0}
                        step={100}
                        className="quant w-full rounded-xl border border-border bg-background px-3 py-2"
                        value={refundAutoMax}
                        disabled={!authorityReady}
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
                              disabled={!authorityReady}
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
                      {busy ? (
                        <>
                          Loading current authority. Changes remain unavailable until its status is
                          known.
                        </>
                      ) : agent?.status === 'paused' ? (
                        <>
                          The agent is paused. Protected seller actions will not execute until you
                          resume it.
                        </>
                      ) : mandate?.status === 'active' ? (
                        <>
                          When you choose a refund at or below{' '}
                          <strong className="quant">INR {refundAutoMax}</strong>, it executes
                          immediately. A larger refund stops for one-time approval before execution.
                        </>
                      ) : (
                        <>Save these settings to activate seller authority.</>
                      )}
                    </p>
                    <p className="text-muted-foreground">
                      Assistant: Samantha · Role: Seller operations · Status:{' '}
                      <span data-testid="agentguard-status">
                        {busy && !agent ? 'loading' : (agent?.status ?? 'unavailable')}
                      </span>
                    </p>
                    <p className="text-muted-foreground">
                      Authority settings:{' '}
                      <span data-testid="agentguard-mandate-status">
                        {busy && !mandate ? 'loading' : (mandate?.status ?? 'not active')}
                      </span>{' '}
                      · {COMMERCE_EXCHANGE_LABEL}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        data-testid="agentguard-confirm-mandate"
                        disabled={!authorityReady || !subjectId || selectedActions.length === 0}
                        onClick={() => void handleConfirmMandate()}
                      >
                        {busy
                          ? 'Loading authority…'
                          : mandate?.status === 'active'
                            ? 'Save authority changes'
                            : 'Activate authority'}
                      </Button>
                      <Button
                        data-testid="agentguard-pause"
                        aria-describedby="agentguard-pause-consequences"
                        disabled={busy || !agent}
                        variant={agent?.status === 'paused' ? 'default' : 'outline'}
                        onClick={() => void handlePauseToggle()}
                      >
                        {agent?.status === 'paused' ? 'Resume agent' : 'Pause agent'}
                      </Button>
                      <Button variant="secondary" disabled={busy} onClick={() => void refresh()}>
                        Refresh
                      </Button>
                    </div>
                    <p id="agentguard-pause-consequences" className="text-muted-foreground">
                      Pausing stops Samantha from executing protected catalog, order, fulfilment,
                      and refund actions. She may still answer questions; your saved permissions
                      remain and take effect again when you resume.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          ) : null}

          {showMemory ? (
            <Card data-testid="seller-config-samantha">
              <CardHeader>
                <CardTitle className="text-base">Samantha memory</CardTitle>
                <CardDescription id="seller-samantha-memory-scope">
                  Saved only for this signed-in seller and used for future assistant suggestions.
                  Removing it does not change catalog, orders, or AgentGuard authority.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {(
                  [
                    ['likes', 'Prefer'],
                    ['dislikes', 'Avoid'],
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
                              aria-label={`Remove ${label.toLowerCase()} “${item}” from Samantha memory`}
                              aria-describedby="seller-samantha-memory-scope"
                              title={`Remove from ${label.toLowerCase()}`}
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
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-describedby="seller-samantha-memory-scope"
                  disabled={memoryIsEmpty(memory)}
                  onClick={clearMemory}
                >
                  Clear all Samantha memory
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {showActivity ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Protected activity</CardTitle>
                <CardDescription>
                  AgentGuard receipts for this seller account. Customer personal details are
                  excluded.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3" data-testid="agentguard-receipts">
                {receipts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No protected actions recorded for this seller account.
                  </p>
                ) : (
                  receipts.map((receipt) => (
                    <div
                      key={receipt.receipt_id}
                      className="rounded-3xl border border-border/70 bg-card/95 p-4 text-sm"
                      data-receipt-id={receipt.receipt_id}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-foreground">
                            {receipt.action} · INR{' '}
                            <span className="quant">{receipt.amount_inr}</span> · {receipt.outcome}
                          </p>
                          <p className="quant text-muted-foreground">
                            Authorization {customerReference(receipt.receipt_id)} · order{' '}
                            {customerReference(receipt.resource_id)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {receiptChecks[receipt.receipt_id] === true ? (
                            <Badge variant="outline">Verified</Badge>
                          ) : null}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void handleVerifyReceipt(receipt.receipt_id)}
                          >
                            Verify receipt
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}

export function AgentGuardPage() {
  const [searchParams] = useSearchParams();
  const next = new URLSearchParams(searchParams);
  if (!next.get('tab')) next.set('tab', 'agent-guard');
  const query = next.toString();
  return <Navigate to={query ? `/config?${query}` : '/config?tab=agent-guard'} replace />;
}
