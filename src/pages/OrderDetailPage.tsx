import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import type { UCPOrder, UCPOrderStatus } from '@ondc-sdk/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { TrustNotice } from '@/components/TrustStatus';
import { useSubject, useTrustState } from '@/hooks';
import { effectiveElevatedTrustState, type PortfolioTrustState } from '@/lib/trust';
import { recordSellerActionAuditEvent } from '@/lib/localSellerAudit';
import {
  buildSellerActionHeaders,
  buildSellerBackendActionPolicy,
  canExecuteSellerAction,
  type SellerSensitiveAction,
} from '@/lib/sellerActionPolicy';
import { COMMERCE_API_BASE, COMMERCE_DEMO_MODE, buildCommerceUrl } from '../lib/commerceConfig';
import {
  acceptDemoSellerOrder,
  dispatchDemoSellerOrder,
  getDemoSellerOrder,
  listSellerOrderNotesForOrder,
  refundDemoSellerOrder,
  rejectDemoSellerOrder,
} from '../lib/localSellerOrders';
import { getCommerceOrder } from '../lib/commerceClient';
import {
  consumeApproval,
  evaluateRefund,
  executeProtectedAction,
  verifyReceipt,
  type AgentGuardApproval,
  type AgentGuardReceipt,
} from '../lib/agentGuardClient';
import { LEGACY_ACTION_ALIASES } from '@aadharchain/agentguard-contract';
import { createSignedIdentityProof } from '../lib/trust';
const canAcceptOrder = (status: UCPOrderStatus): boolean => status === 'created';
const canRejectOrder = (status: UCPOrderStatus): boolean => status === 'created';
const canDispatchOrder = (status: UCPOrderStatus): boolean =>
  ['accepted', 'packed'].includes(status);
type SellerOrderMutation = 'accept' | 'reject' | 'dispatch';

export function canMutateSellerOrder(
  status: UCPOrderStatus,
  mutation: SellerOrderMutation,
  trustState: PortfolioTrustState
): boolean {
  const actionByMutation: Record<SellerOrderMutation, SellerSensitiveAction> = {
    accept: 'order_accept',
    reject: 'order_reject',
    dispatch: 'order_dispatch',
  };
  if (!canExecuteSellerAction(actionByMutation[mutation], trustState)) return false;
  if (mutation === 'accept') return canAcceptOrder(status);
  if (mutation === 'reject') return canRejectOrder(status);
  return canDispatchOrder(status);
}

export function sellerRefundTrustSatisfied(
  trustState: PortfolioTrustState,
  principalId: string | null | undefined,
  demoMode: boolean
): boolean {
  return demoMode || effectiveElevatedTrustState(trustState, principalId) === 'verified';
}

export function sellerApprovalNeedsWalletProof(
  principalId: string | null | undefined,
  demoMode: boolean
): boolean {
  return !demoMode && !principalId;
}

const STATUS_LABELS: Record<UCPOrderStatus, string> = {
  created: 'Pending',
  accepted: 'Accepted',
  in_progress: 'In progress',
  packed: 'Packed',
  shipped: 'Dispatched',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  returned: 'Returned',
};

function getStatusTone(status: UCPOrderStatus) {
  if (status === 'cancelled' || status === 'returned') {
    return 'bg-destructive/12 text-destructive';
  }
  if (status === 'delivered') {
    return 'bg-primary/12 text-primary';
  }
  if (status === 'created') {
    return 'bg-secondary text-secondary-foreground';
  }
  return 'bg-accent text-accent-foreground';
}

interface TimelineEvent {
  status: string;
  label: string;
  timestamp?: string;
  completed: boolean;
}

function getOrderTimeline(order: UCPOrder): TimelineEvent[] {
  const events: TimelineEvent[] = [
    {
      status: 'created',
      label: 'Order placed',
      timestamp: order.createdAt,
      completed: true,
    },
  ];

  if (
    order.status === 'accepted' ||
    ['accepted', 'packed', 'shipped', 'out_for_delivery', 'delivered'].includes(order.status)
  ) {
    events.push({ status: 'accepted', label: 'Order accepted', completed: true });
  }

  if (order.fulfillment?.status === 'in_transit' || order.status === 'shipped') {
    events.push({ status: 'packed', label: 'Order packed', completed: true });
  }

  if (order.status === 'shipped' || order.fulfillment?.status === 'in_transit') {
    events.push({ status: 'shipped', label: 'Order dispatched', completed: true });
  }

  if (order.status === 'cancelled') {
    events.push({
      status: 'cancelled',
      label: 'Order cancelled',
      timestamp: order.cancellation?.cancelledAt,
      completed: true,
    });
  }

  if (order.status === 'delivered') {
    events.push({ status: 'delivered', label: 'Order delivered', completed: true });
  }

  return events;
}

function formatDate(value?: string) {
  if (!value) return 'Not available';
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { signMessage } = useWallet();
  const { subjectId, walletAddress, principalId } = useSubject();
  const trust = useTrustState(walletAddress);
  const [order, setOrder] = useState<UCPOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<AgentGuardApproval | null>(null);
  const [lastApprovalId, setLastApprovalId] = useState<string | null>(null);
  const [lastReceipt, setLastReceipt] = useState<AgentGuardReceipt | null>(null);
  const [agentGuardMessage, setAgentGuardMessage] = useState<string | null>(null);
  const orderNotes = order ? listSellerOrderNotesForOrder(order.id) : [];

  useEffect(() => {
    const loadOrder = async () => {
      if (!id) {
        setError('Order ID is required');
        setLoading(false);
        return;
      }

      try {
        // The shared commerce exchange is the portfolio order source in both
        // local and deployed AgentGuard lanes. A configured legacy UCP API is
        // only a fallback; local fixtures are last.
        try {
          setOrder(await getCommerceOrder(id));
          return;
        } catch (commerceError) {
          if (!COMMERCE_DEMO_MODE && COMMERCE_API_BASE) {
            const response = await fetch(buildCommerceUrl(`/api/seller/orders/${id}`), {
              credentials: 'include',
            });
            if (!response.ok) throw commerceError;
            const data = await response.json();
            setOrder(data.order);
            return;
          }
          const demoOrder = getDemoSellerOrder(id);
          if (!demoOrder) throw commerceError;
          setOrder(demoOrder);
          return;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load order');
      } finally {
        setLoading(false);
      }
    };

    void loadOrder();
  }, [id]);

  async function handleAccept() {
    if (!order || !id) return;
    if (!canMutateSellerOrder(order.status, 'accept', trust.state)) {
      recordSellerActionAuditEvent({
        action: 'order_accept',
        targetId: id,
        walletAddress,
        subjectId,
        trustState: trust.state,
        outcome: 'blocked',
        reason: 'Verified seller trust is required before accepting orders.',
      });
      setError('Verified seller trust is required before accepting orders.');
      return;
    }
    setProcessing('accept');
    try {
      if (COMMERCE_DEMO_MODE) {
        const next = acceptDemoSellerOrder(id);
        if (!next) throw new Error('Order not found');
        recordSellerActionAuditEvent({
          action: 'order_accept',
          targetId: id,
          walletAddress,
          subjectId,
          trustState: trust.state,
          outcome: 'applied',
          reason: 'Accepted seller order in demo mode.',
        });
        setOrder(next);
        return;
      }

      const response = await fetch(buildCommerceUrl(`/api/seller/orders/${id}/accept`), {
        method: 'POST',
        credentials: 'include',
        headers: buildSellerActionHeaders(
          buildSellerBackendActionPolicy('order_accept', {
            trustState: trust.state,
            walletAddress,
            subjectId,
            auditSubjectId: id,
          })
        ),
      });
      if (!response.ok) throw new Error('Failed to accept order');
      const data = await response.json();
      recordSellerActionAuditEvent({
        action: 'order_accept',
        targetId: id,
        walletAddress,
        subjectId,
        trustState: trust.state,
        outcome: 'applied',
        reason: 'Accepted seller order through commerce API.',
      });
      setOrder(data.order);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept order');
    } finally {
      setProcessing(null);
    }
  }

  async function handleReject() {
    if (!order || !id) return;
    if (!canMutateSellerOrder(order.status, 'reject', trust.state)) {
      recordSellerActionAuditEvent({
        action: 'order_reject',
        targetId: id,
        walletAddress,
        subjectId,
        trustState: trust.state,
        outcome: 'blocked',
        reason: 'Verified seller trust is required before rejecting orders.',
      });
      setError('Verified seller trust is required before rejecting orders.');
      return;
    }
    if (!confirm('Are you sure you want to reject this order?')) return;

    setProcessing('reject');
    try {
      if (COMMERCE_DEMO_MODE) {
        const next = rejectDemoSellerOrder(id, 'Seller rejected the order');
        if (!next) throw new Error('Order not found');
        recordSellerActionAuditEvent({
          action: 'order_reject',
          targetId: id,
          walletAddress,
          subjectId,
          trustState: trust.state,
          outcome: 'applied',
          reason: 'Rejected seller order in demo mode.',
        });
        setOrder(next);
        return;
      }

      const response = await fetch(buildCommerceUrl(`/api/seller/orders/${id}/reject`), {
        method: 'POST',
        credentials: 'include',
        headers: buildSellerActionHeaders(
          buildSellerBackendActionPolicy('order_reject', {
            trustState: trust.state,
            walletAddress,
            subjectId,
            auditSubjectId: id,
            auditReferenceId: 'seller-rejection',
          })
        ),
        body: JSON.stringify({ reason: 'Seller rejected the order' }),
      });
      if (!response.ok) throw new Error('Failed to reject order');
      const data = await response.json();
      recordSellerActionAuditEvent({
        action: 'order_reject',
        targetId: id,
        walletAddress,
        subjectId,
        trustState: trust.state,
        outcome: 'applied',
        reason: 'Rejected seller order through commerce API.',
      });
      setOrder(data.order);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject order');
    } finally {
      setProcessing(null);
    }
  }

  async function handleDispatch() {
    if (!order || !id) return;
    if (!canMutateSellerOrder(order.status, 'dispatch', trust.state)) {
      recordSellerActionAuditEvent({
        action: 'order_dispatch',
        targetId: id,
        walletAddress,
        subjectId,
        trustState: trust.state,
        outcome: 'blocked',
        reason: 'Verified seller trust is required before dispatching orders.',
      });
      setError('Verified seller trust is required before dispatching orders.');
      return;
    }
    const trackingId = prompt('Enter tracking ID:');
    if (!trackingId) return;

    setProcessing('dispatch');
    try {
      if (COMMERCE_DEMO_MODE) {
        const next = dispatchDemoSellerOrder(id, trackingId);
        if (!next) throw new Error('Order not found');
        recordSellerActionAuditEvent({
          action: 'order_dispatch',
          targetId: id,
          walletAddress,
          subjectId,
          trustState: trust.state,
          outcome: 'applied',
          reason: 'Dispatched seller order in demo mode.',
        });
        setOrder(next);
        return;
      }

      const response = await fetch(buildCommerceUrl(`/api/seller/orders/${id}/dispatch`), {
        method: 'POST',
        credentials: 'include',
        headers: buildSellerActionHeaders(
          buildSellerBackendActionPolicy('order_dispatch', {
            trustState: trust.state,
            walletAddress,
            subjectId,
            auditSubjectId: id,
            auditReferenceId: trackingId,
          })
        ),
        body: JSON.stringify({ trackingId, providerName: 'Standard Courier' }),
      });
      if (!response.ok) throw new Error('Failed to dispatch order');
      const data = await response.json();
      recordSellerActionAuditEvent({
        action: 'order_dispatch',
        targetId: id,
        walletAddress,
        subjectId,
        trustState: trust.state,
        outcome: 'applied',
        reason: 'Dispatched seller order through commerce API.',
      });
      setOrder(data.order);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dispatch order');
    } finally {
      setProcessing(null);
    }
  }

  async function applyAllowedRefund(amountInr: number, receipt: AgentGuardReceipt) {
    if (!id) return;
    if (COMMERCE_DEMO_MODE) {
      const next = refundDemoSellerOrder(id, amountInr, receipt.receipt_id);
      if (!next) throw new Error('Order not found');
      setOrder(next);
    }
    setLastReceipt(receipt);
    setPendingApproval(null);
    setAgentGuardMessage(
      `Refund INR ${amountInr} allowed. Receipt ${receipt.receipt_id} (no identity data).`
    );
  }

  async function handleAgentGuardRefund(amountInr: number) {
    if (!order || !id) return;
    // AgentGuard binds cookie principal; wallet is legacy hangar only.
    if (!subjectId) {
      setError('Sign in before AgentGuard refunds.');
      return;
    }
    // Session principal AG does not require hangar wallet KYC.
    if (!sellerRefundTrustSatisfied(trust.state, principalId, COMMERCE_DEMO_MODE)) {
      setError('Verified seller trust is required for AgentGuard refunds.');
      return;
    }
    setProcessing(`refund-${amountInr}`);
    setError(null);
    setAgentGuardMessage(null);
    try {
      const refundAttemptId = globalThis.crypto.randomUUID();
      // Prefer execute boundary for in-policy refunds (evaluate+commerce in one call).
      try {
        const executed = await executeProtectedAction({
          walletAddress,
          action: LEGACY_ACTION_ALIASES.refund,
          amountInr,
          resourceId: id,
          idempotencyKey: `seller-refund:${id}:${amountInr}:${refundAttemptId}`,
          payload: { order_id: id },
        });
        if (executed.decision === 'need_approval' && executed.approval) {
          setPendingApproval(executed.approval);
          setLastApprovalId(executed.approval.approval_id);
          setAgentGuardMessage(
            executed.approval ? 'Approval required for this refund.' : 'Approval required.'
          );
          return;
        }
        if (executed.receipt) {
          if (executed.receipt.outcome === 'paused' || executed.decision === 'deny') {
            setAgentGuardMessage(
              executed.receipt.outcome === 'paused' || /paus/i.test(String(executed.decision))
                ? 'Agent is paused.'
                : 'Refund denied while agent is paused or out of policy.'
            );
            setLastReceipt(executed.receipt);
            return;
          }
          await applyAllowedRefund(amountInr, executed.receipt);
          const verified = await verifyReceipt({ receiptId: executed.receipt.receipt_id });
          if (verified.valid) {
            setAgentGuardMessage(
              `Refund INR ${amountInr} allowed. Receipt ${executed.receipt.receipt_id} verified.`
            );
          }
          return;
        }
      } catch {
        // Fall back to evaluate-only path for need_approval UX when execute requires approval payload.
      }
      const result = await evaluateRefund({
        walletAddress,
        amountInr,
        resourceId: id,
      });
      if (result.decision === 'allow' && result.receipt) {
        await applyAllowedRefund(amountInr, result.receipt);
        return;
      }
      if (result.decision === 'need_approval' && result.approval) {
        setPendingApproval(result.approval);
        setLastApprovalId(result.approval.approval_id);
        setAgentGuardMessage(result.reason);
        return;
      }
      setPendingApproval(null);
      setAgentGuardMessage(result.reason || 'Refund denied.');
      if (result.receipt) setLastReceipt(result.receipt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AgentGuard refund failed');
    } finally {
      setProcessing(null);
    }
  }

  async function handleApproveOnce() {
    if (!pendingApproval || !subjectId) {
      setError('No pending approval.');
      return;
    }
    setProcessing('approve');
    setError(null);
    try {
      // Demo/Hermes: skip wallet popup; consume is the one-time authority gate.
      if (
        sellerApprovalNeedsWalletProof(principalId, COMMERCE_DEMO_MODE) &&
        signMessage &&
        walletAddress
      ) {
        await createSignedIdentityProof({
          walletAddress,
          audience: 'seller',
          purpose: 'seller_refund_approval',
          signMessage,
        });
      } else if (sellerApprovalNeedsWalletProof(principalId, COMMERCE_DEMO_MODE)) {
        setError('Wallet signMessage is required to approve once.');
        return;
      }
      const consumed = await consumeApproval({
        walletAddress,
        approvalId: pendingApproval.approval_id,
      });
      await applyAllowedRefund(pendingApproval.amount_inr, consumed.receipt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed');
    } finally {
      setProcessing(null);
    }
  }

  async function handleReplayApproval() {
    const approvalId = lastApprovalId || pendingApproval?.approval_id;
    if (!approvalId || !subjectId) {
      setError('No approval to replay.');
      return;
    }
    setProcessing('replay');
    setError(null);
    try {
      await consumeApproval({
        walletAddress,
        approvalId,
      });
      setAgentGuardMessage('Unexpected: replay succeeded');
    } catch (err) {
      setAgentGuardMessage(
        err instanceof Error ? err.message : 'Approval already consumed (replay rejected).'
      );
    } finally {
      setProcessing(null);
    }
  }

  const timeline = useMemo(() => (order ? getOrderTimeline(order) : []), [order]);

  if (loading) {
    return (
      <div className="mx-auto flex max-w-[1280px] px-4 py-8 sm:px-6 lg:px-8">
        <p className="text-sm text-muted-foreground">Loading order details…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto flex max-w-[1280px] flex-col gap-4 px-4 py-8 sm:px-6 lg:px-8">
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Orders
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-foreground">Order error</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
        <Button variant="secondary" className="w-fit" onClick={() => navigate('/orders')}>
          Back to orders
        </Button>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto flex max-w-[1280px] flex-col gap-4 px-4 py-8 sm:px-6 lg:px-8">
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Orders
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-foreground">
            Order not found
          </h1>
        </div>
        <Button variant="secondary" className="w-fit" onClick={() => navigate('/orders')}>
          Back to orders
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <Button variant="secondary" className="w-fit" onClick={() => navigate('/orders')}>
        Back to orders
      </Button>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Order detail
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-foreground">
            Order #{order.id}
          </h1>
          <p className="text-sm text-muted-foreground">Placed on {formatDate(order.createdAt)}</p>
        </div>
        <Badge className={getStatusTone(order.status)}>{STATUS_LABELS[order.status]}</Badge>
      </div>

      <TrustNotice
        state={effectiveElevatedTrustState(trust.state, principalId)}
        loading={trust.loading}
        error={trust.error}
        reason={trust.reason}
        actionLabel="Resolve seller trust"
      />

      <div className="flex flex-wrap gap-3">
        {canAcceptOrder(order.status) ? (
          <Button
            disabled={
              processing === 'accept' ||
              trust.loading ||
              !canMutateSellerOrder(order.status, 'accept', trust.state)
            }
            onClick={() => void handleAccept()}
          >
            {processing === 'accept' ? 'Processing…' : 'Accept order'}
          </Button>
        ) : null}
        {canRejectOrder(order.status) ? (
          <Button
            variant="destructive"
            disabled={
              processing === 'reject' ||
              trust.loading ||
              !canMutateSellerOrder(order.status, 'reject', trust.state)
            }
            onClick={() => void handleReject()}
          >
            {processing === 'reject' ? 'Processing…' : 'Reject order'}
          </Button>
        ) : null}
        {canDispatchOrder(order.status) ? (
          <Button
            disabled={
              processing === 'dispatch' ||
              trust.loading ||
              !canMutateSellerOrder(order.status, 'dispatch', trust.state)
            }
            onClick={() => void handleDispatch()}
          >
            {processing === 'dispatch' ? 'Processing…' : 'Dispatch order'}
          </Button>
        ) : null}
      </div>

      <Card data-testid="agentguard-refund-panel">
        <CardHeader>
          <CardTitle>AgentGuard refunds</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Demo: INR 3,000 auto-allows; INR 7,500 needs one-time approval. Policy limit INR 5,000.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              data-testid="refund-3000"
              disabled={!!processing || (!COMMERCE_DEMO_MODE && trust.loading) || !subjectId}
              onClick={() => void handleAgentGuardRefund(3000)}
            >
              {processing === 'refund-3000' ? 'Processing…' : 'Refund INR 3,000'}
            </Button>
            <Button
              data-testid="refund-7500"
              variant="outline"
              disabled={!!processing || (!COMMERCE_DEMO_MODE && trust.loading) || !subjectId}
              onClick={() => void handleAgentGuardRefund(7500)}
            >
              {processing === 'refund-7500' ? 'Processing…' : 'Refund INR 7,500'}
            </Button>
          </div>
          {agentGuardMessage ? (
            <p className="text-sm text-foreground" data-testid="agentguard-message">
              {agentGuardMessage}
            </p>
          ) : null}
          {pendingApproval || lastApprovalId ? (
            <div className="flex flex-wrap gap-2" data-testid="agentguard-approval">
              {pendingApproval ? (
                <Button
                  data-testid="approve-once"
                  disabled={
                    !!processing ||
                    (sellerApprovalNeedsWalletProof(principalId, COMMERCE_DEMO_MODE) &&
                      !signMessage)
                  }
                  onClick={() => void handleApproveOnce()}
                >
                  {processing === 'approve' ? 'Approving…' : 'Approve once'}
                </Button>
              ) : null}
              <Button
                data-testid="replay-approval"
                variant="destructive"
                disabled={!!processing}
                onClick={() => void handleReplayApproval()}
              >
                {processing === 'replay' ? 'Replaying…' : 'Replay approval'}
              </Button>
            </div>
          ) : null}
          {lastReceipt ? (
            <p className="text-sm text-muted-foreground" data-testid="agentguard-last-receipt">
              Last receipt: {lastReceipt.receipt_id} · {lastReceipt.outcome} · INR{' '}
              {lastReceipt.amount_inr}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {order.cancellation ? (
        <Card className="border-destructive/20 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive">Cancellation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>{order.cancellation.reason || 'Seller rejected the order.'}</p>
            <p>Cancelled at {formatDate(order.cancellation.cancelledAt)}</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.95fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Buyer and delivery</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Buyer
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    {order.buyer?.name || 'Unknown buyer'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {order.buyer?.contact?.phone || order.buyer?.phone || 'No phone'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {order.buyer?.contact?.email || order.buyer?.email || 'No email'}
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Delivery
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    {order.deliveryAddress?.name || 'No recipient'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {order.deliveryAddress?.line1 || 'No line 1'}
                  </p>
                  {order.deliveryAddress?.line2 ? (
                    <p className="text-sm text-muted-foreground">{order.deliveryAddress.line2}</p>
                  ) : null}
                  <p className="text-sm text-muted-foreground">
                    {[
                      order.deliveryAddress?.city,
                      order.deliveryAddress?.state,
                      order.deliveryAddress?.postalCode,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {order.deliveryAddress?.country || 'Country unavailable'}
                  </p>
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Fulfillment
                  </div>
                  <p className="text-sm text-foreground">
                    {order.fulfillment?.providerName || 'Pending provider'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {order.fulfillment?.tracking?.statusMessage || 'No tracking update yet.'}
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Payment
                  </div>
                  <p className="text-sm text-foreground">
                    {order.payment?.type || 'Unknown payment type'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {order.payment?.status || 'Unknown status'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Order items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {order.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-4 rounded-3xl border border-border/70 bg-card/95 p-4"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">{item.name}</p>
                    <p className="text-sm text-muted-foreground">Quantity: {item.quantity}</p>
                  </div>
                  <div className="text-right text-sm font-medium text-primary">
                    {order.quote?.total?.currency || item.price.currency}{' '}
                    {item.price.value ?? item.price.amount}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {orderNotes.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Seller notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {orderNotes.map((note) => (
                  <div key={note.id} className="rounded-3xl border border-border/70 bg-card/95 p-4">
                    <p className="text-sm text-foreground">{note.note}</p>
                    {note.next_step ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Next step: {note.next_step}
                      </p>
                    ) : null}
                    <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      {formatDate(note.created_at)}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Commercial summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Order total</span>
                <span className="text-lg font-semibold text-primary">
                  {order.quote?.total?.currency}{' '}
                  {order.quote?.total?.value ?? order.quote?.total?.amount}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Last updated</span>
                <span className="text-foreground">{formatDate(order.updatedAt)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {timeline.map((event, index) => (
                <div key={`${event.status}-${index}`} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className={
                        event.completed
                          ? 'mt-1 size-3 rounded-full bg-primary'
                          : 'mt-1 size-3 rounded-full bg-secondary'
                      }
                    />
                    {index < timeline.length - 1 ? (
                      <div className="mt-2 h-full w-px bg-border" />
                    ) : null}
                  </div>
                  <div className="pb-4">
                    <p className="text-sm font-medium text-foreground">{event.label}</p>
                    {event.timestamp ? (
                      <p className="text-sm text-muted-foreground">{formatDate(event.timestamp)}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">Awaiting update</p>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
