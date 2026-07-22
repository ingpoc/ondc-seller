import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { UCPOrder, UCPOrderStatus } from '@ondc-sdk/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { TrustNotice } from '@/components/TrustStatus';
import { useSubject, useTrustState } from '@/hooks';
import { effectiveElevatedTrustState, type PortfolioTrustState } from '@/lib/trust';
import { recordSellerActionAuditEvent } from '@/lib/localSellerAudit';
import { COMMERCE_API_BASE, COMMERCE_DEMO_MODE, buildCommerceUrl } from '../lib/commerceConfig';
import { listSellerOrderNotesForOrder } from '../lib/localSellerNotes';
import {
  getCommerceOrder,
  paymentStatusLabel,
  type SellerCommerceOrder,
} from '../lib/commerceClient';
import { customerReference } from '../lib/displayText';
import { executeProtectedAction, verifyReceipt } from '../lib/agentGuardClient';
import {
  LEGACY_ACTION_ALIASES,
  type Approval,
  type IntentReceipt,
} from '@aadharchain/agentguard-contract';
const canAcceptOrder = (status: UCPOrderStatus): boolean => status === 'created';
const canRejectOrder = (status: UCPOrderStatus): boolean => status === 'created';
const canDispatchOrder = (status: UCPOrderStatus): boolean =>
  ['accepted', 'packed'].includes(status);
type SellerOrderMutation = 'accept' | 'reject' | 'dispatch';

export function normalizeTrackingId(value: string): string | null {
  const normalized = value.trim();
  return normalized || null;
}

export function canMutateSellerOrder(
  status: UCPOrderStatus,
  mutation: SellerOrderMutation
): boolean {
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

export function fullRefundAmount(
  order: Pick<UCPOrder, 'total'> & { refundedAmountInr?: number }
): number {
  return Math.max(
    0,
    Math.round(Number(order.total) || 0) - Math.round(Number(order.refundedAmountInr) || 0)
  );
}

export function refundConfirmationCopy(
  amountInr: number,
  orderReference: string,
  customerName: string
): string {
  return `Refund INR ${Math.round(amountInr).toLocaleString('en-IN')} to ${customerName} for order ${orderReference}? Payment will become Refunded and the order will close as Cancelled. This cannot be undone.`;
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

export function getOrderTimeline(order: UCPOrder): TimelineEvent[] {
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
      timestamp: order.cancellation?.cancelledAt || order.updatedAt,
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
  const { subjectId, walletAddress, principalId } = useSubject();
  const trust = useTrustState(walletAddress);
  const [order, setOrder] = useState<SellerCommerceOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [dispatchDialogOpen, setDispatchDialogOpen] = useState(false);
  const [trackingId, setTrackingId] = useState('');
  const [pendingApproval, setPendingApproval] = useState<Approval | null>(null);
  const [refundConfirmation, setRefundConfirmation] = useState<number | null>(null);
  const [lastReceipt, setLastReceipt] = useState<IntentReceipt | null>(null);
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
        // the only fallback; browser fixtures cannot become order authority.
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
          throw commerceError;
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
    if (!canMutateSellerOrder(order.status, 'accept')) {
      recordSellerActionAuditEvent({
        action: 'order_accept',
        targetId: id,
        walletAddress,
        subjectId,
        trustState: trust.state,
        outcome: 'blocked',
        reason: 'This order cannot be accepted from its current status.',
      });
      setError('This order cannot be accepted from its current status.');
      return;
    }
    setProcessing('accept');
    try {
      const executed = await executeProtectedAction({
        walletAddress,
        action: 'seller.order.accept',
        amountInr: 0,
        resourceId: id,
        idempotencyKey: `seller.order.accept:${id}`,
        payload: { order_id: id },
      });
      if (!executed.execution) {
        throw new Error(
          executed.decision === 'need_approval'
            ? 'Order acceptance requires exact approval.'
            : 'Order acceptance was denied by AgentGuard.'
        );
      }
      recordSellerActionAuditEvent({
        action: 'order_accept',
        targetId: id,
        walletAddress,
        subjectId,
        trustState: trust.state,
        outcome: 'applied',
        reason: 'Accepted seller order through commerce API.',
      });
      setOrder(await getCommerceOrder(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept order');
    } finally {
      setProcessing(null);
    }
  }

  async function handleReject() {
    if (!order || !id) return;
    if (!canMutateSellerOrder(order.status, 'reject')) {
      recordSellerActionAuditEvent({
        action: 'order_reject',
        targetId: id,
        walletAddress,
        subjectId,
        trustState: trust.state,
        outcome: 'blocked',
        reason: 'This order cannot be rejected from its current status.',
      });
      setError('This order cannot be rejected from its current status.');
      return;
    }
    if (
      !confirm(
        `Reject order ${customerReference(id)}? The customer order will be cancelled. This cannot be undone.`
      )
    )
      return;

    setProcessing('reject');
    try {
      const executed = await executeProtectedAction({
        walletAddress,
        action: 'seller.order.reject',
        amountInr: 0,
        resourceId: id,
        idempotencyKey: `seller.order.reject:${id}`,
        payload: { order_id: id, reason: 'Seller rejected the order' },
      });
      if (!executed.execution) {
        throw new Error(
          executed.decision === 'need_approval'
            ? 'Order rejection requires exact approval.'
            : 'Order rejection was denied by AgentGuard.'
        );
      }
      recordSellerActionAuditEvent({
        action: 'order_reject',
        targetId: id,
        walletAddress,
        subjectId,
        trustState: trust.state,
        outcome: 'applied',
        reason: 'Rejected seller order through commerce API.',
      });
      setOrder(await getCommerceOrder(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject order');
    } finally {
      setProcessing(null);
    }
  }

  async function handleDispatch(requestedTrackingId: string) {
    if (!order || !id) return;
    if (!canMutateSellerOrder(order.status, 'dispatch')) {
      recordSellerActionAuditEvent({
        action: 'order_dispatch',
        targetId: id,
        walletAddress,
        subjectId,
        trustState: trust.state,
        outcome: 'blocked',
        reason: 'This order cannot be dispatched from its current status.',
      });
      setError('This order cannot be dispatched from its current status.');
      return;
    }
    const normalizedTrackingId = normalizeTrackingId(requestedTrackingId);
    if (!normalizedTrackingId) {
      setError('Enter a tracking ID before dispatching this order.');
      return;
    }

    setProcessing('dispatch');
    try {
      const executed = await executeProtectedAction({
        walletAddress,
        action: 'seller.fulfilment.commit',
        amountInr: 0,
        resourceId: id,
        idempotencyKey: `seller.fulfilment.commit:${id}`,
        payload: {
          order_id: id,
          tracking_id: normalizedTrackingId,
          provider_name: 'Standard Courier',
        },
      });
      if (!executed.execution) {
        throw new Error(
          executed.decision === 'need_approval'
            ? 'Fulfilment update requires exact approval.'
            : 'Fulfilment update was denied by AgentGuard.'
        );
      }
      recordSellerActionAuditEvent({
        action: 'order_dispatch',
        targetId: id,
        walletAddress,
        subjectId,
        trustState: trust.state,
        outcome: 'applied',
        reason: 'Dispatched seller order through commerce API.',
      });
      setOrder(await getCommerceOrder(id));
      setDispatchDialogOpen(false);
      setTrackingId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dispatch order');
    } finally {
      setProcessing(null);
    }
  }

  async function applyAllowedRefund(amountInr: number, receipt: IntentReceipt) {
    if (!id) return;
    setOrder(await getCommerceOrder(id));
    setLastReceipt(receipt);
    setPendingApproval(null);
    setAgentGuardMessage(
      `Refund INR ${amountInr} allowed. Authorization reference ${customerReference(receipt.receipt_id)}.`
    );
  }

  async function handleAgentGuardRefund(amountInr: number) {
    if (!order || !id) return;
    setRefundConfirmation(null);
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
              `Refund INR ${amountInr} allowed. Authorization reference ${customerReference(executed.receipt.receipt_id)} verified.`
            );
          }
          return;
        }
      } catch (err) {
        throw err;
      }
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
      const executed = await executeProtectedAction({
        walletAddress,
        action: LEGACY_ACTION_ALIASES.refund,
        amountInr: pendingApproval.amount_inr,
        resourceId: pendingApproval.resource_id,
        approvalId: pendingApproval.approval_id,
        idempotencyKey: `seller-refund:${pendingApproval.resource_id}:${pendingApproval.amount_inr}:${pendingApproval.approval_id}`,
        payload: { order_id: pendingApproval.resource_id },
      });
      if (!executed.receipt || !executed.execution) {
        throw new Error('Approved refund was not executed.');
      }
      await applyAllowedRefund(pendingApproval.amount_inr, executed.receipt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed');
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
            Order reference {customerReference(order.id)}
          </h1>
          <p className="text-sm text-muted-foreground">Placed on {formatDate(order.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className={getStatusTone(order.status)}>{STATUS_LABELS[order.status]}</Badge>
          <Badge className="bg-primary/12 text-primary">
            Payment: {paymentStatusLabel(order.paymentStatus)}
          </Badge>
        </div>
      </div>

      <TrustNotice
        state={effectiveElevatedTrustState(trust.state, principalId)}
        loading={trust.loading}
        error={trust.error}
        reason={trust.reason}
        actionLabel="Resolve seller trust"
      />

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
                Payment and authorization
              </div>
              <p className="text-sm font-medium text-foreground">
                Payment: {paymentStatusLabel(order.paymentStatus)}
              </p>
              <p className="text-sm text-muted-foreground">
                AgentGuard checks each protected seller action independently.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        {canAcceptOrder(order.status) ? (
          <Button
            disabled={
              processing === 'accept' ||
              trust.loading ||
              !canMutateSellerOrder(order.status, 'accept')
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
              !canMutateSellerOrder(order.status, 'reject')
            }
            onClick={() => void handleReject()}
          >
            {processing === 'reject' ? 'Processing…' : 'Review rejection'}
          </Button>
        ) : null}
        {canDispatchOrder(order.status) ? (
          <Dialog
            open={dispatchDialogOpen}
            onOpenChange={(open) => {
              if (processing !== 'dispatch') {
                setDispatchDialogOpen(open);
                if (!open) setTrackingId('');
              }
            }}
          >
            <DialogTrigger asChild>
              <Button
                disabled={
                  processing === 'dispatch' ||
                  trust.loading ||
                  !canMutateSellerOrder(order.status, 'dispatch')
                }
              >
                Dispatch order
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form
                className="space-y-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleDispatch(trackingId);
                }}
              >
                <DialogHeader>
                  <DialogTitle>Dispatch order</DialogTitle>
                  <DialogDescription>
                    Enter the courier tracking ID. This will mark the order as dispatched and share
                    the tracking reference with the customer.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <Label htmlFor="dispatch-tracking-id">Tracking ID</Label>
                  <Input
                    id="dispatch-tracking-id"
                    name="trackingId"
                    autoComplete="off"
                    autoFocus
                    value={trackingId}
                    onChange={(event) => setTrackingId(event.target.value)}
                    placeholder="For example, SHIP-123456"
                    disabled={processing === 'dispatch'}
                    required
                  />
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={processing === 'dispatch'}
                    onClick={() => setDispatchDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={processing === 'dispatch' || !normalizeTrackingId(trackingId)}
                  >
                    {processing === 'dispatch' ? 'Dispatching…' : 'Confirm dispatch'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>

      <Card data-testid="agentguard-refund-panel">
        <CardHeader>
          <CardTitle>AgentGuard refunds</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {fullRefundAmount(order) > 0
              ? 'Review the customer, amount, and final order state before confirming. AgentGuard will request one-time approval when your mandate requires it.'
              : 'The full order value has been refunded. No further refund is available.'}
          </p>
          {fullRefundAmount(order) > 0 ? (
            refundConfirmation === fullRefundAmount(order) ? (
              <div
                className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
                role="alertdialog"
                aria-labelledby="refund-confirmation-title"
                aria-describedby="refund-confirmation-description"
              >
                <p id="refund-confirmation-title" className="font-medium text-foreground">
                  Confirm full refund
                </p>
                <p id="refund-confirmation-description" className="text-sm text-muted-foreground">
                  {refundConfirmationCopy(
                    refundConfirmation,
                    customerReference(order.id),
                    order.buyer?.name ?? 'the customer'
                  )}{' '}
                  AgentGuard checks the action after you confirm.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    data-testid="confirm-refund-full-amount"
                    variant="destructive"
                    disabled={!!processing}
                    onClick={() => void handleAgentGuardRefund(refundConfirmation)}
                  >
                    Confirm full refund
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!!processing}
                    onClick={() => setRefundConfirmation(null)}
                  >
                    Keep order
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  data-testid="refund-full-amount"
                  disabled={!!processing || (!COMMERCE_DEMO_MODE && trust.loading) || !subjectId}
                  onClick={() => setRefundConfirmation(fullRefundAmount(order))}
                >
                  {`Review full refund (INR ${fullRefundAmount(order).toLocaleString('en-IN')})`}
                </Button>
              </div>
            )
          ) : null}
          {agentGuardMessage ? (
            <p className="text-sm text-foreground" data-testid="agentguard-message">
              {agentGuardMessage}
            </p>
          ) : null}
          {pendingApproval ? (
            <div className="flex flex-wrap gap-2" data-testid="agentguard-approval">
              <Button
                data-testid="approve-once"
                disabled={!!processing}
                onClick={() => void handleApproveOnce()}
              >
                {processing === 'approve' ? 'Approving…' : 'Approve once'}
              </Button>
            </div>
          ) : null}
          {lastReceipt ? (
            <p className="text-sm text-muted-foreground" data-testid="agentguard-last-receipt">
              Last authorization reference: {customerReference(lastReceipt.receipt_id)} ·{' '}
              {lastReceipt.outcome} · INR {lastReceipt.amount_inr}
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
