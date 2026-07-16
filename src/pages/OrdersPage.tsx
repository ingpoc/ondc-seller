import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { UCPOrder, UCPOrderStatus } from '@ondc-sdk/shared';

import { cn } from '@/lib/utils';
import { AsyncState, Badge, Button, Card, PageHeader, PageLayout } from '@/components/seller-ui';
import { TrustNotice } from '@/components/TrustStatus';
import { effectiveElevatedTrustState, elevatedTrustSatisfied } from '@/lib/trust';
import { useSubject, useTrustState } from '@/hooks';
import { COMMERCE_API_BASE, COMMERCE_DEMO_MODE, buildCommerceUrl } from '../lib/commerceConfig';
import {
  acceptDemoSellerOrder,
  listDemoSellerOrders,
  rejectDemoSellerOrder,
} from '../lib/localSellerOrders';
import { listCommerceSellerOrders, transitionCommerceSellerOrder } from '../lib/commerceClient';
import { recordSellerActionAuditEvent } from '../lib/localSellerAudit';
import {
  buildSellerActionHeaders,
  buildSellerBackendActionPolicy,
  canExecuteSellerAction,
} from '../lib/sellerActionPolicy';

const isPendingStatus = (status: UCPOrderStatus): boolean => status === 'created';
const isAcceptedStatus = (status: UCPOrderStatus): boolean =>
  ['accepted', 'packed'].includes(status);
const isDispatchedStatus = (status: UCPOrderStatus): boolean =>
  ['shipped', 'out_for_delivery'].includes(status);
const isCompletedStatus = (status: UCPOrderStatus): boolean => status === 'delivered';
const isCancelledStatus = (status: UCPOrderStatus): boolean =>
  ['cancelled', 'returned'].includes(status);

type StatusFilter = 'all' | 'pending' | 'accepted' | 'dispatched' | 'completed' | 'cancelled';

const filterOptions: StatusFilter[] = [
  'all',
  'pending',
  'accepted',
  'dispatched',
  'completed',
  'cancelled',
];

const statusLabels: Record<UCPOrderStatus, string> = {
  created: 'Pending',
  accepted: 'Accepted',
  in_progress: 'In Progress',
  packed: 'Packed',
  shipped: 'Dispatched',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  returned: 'Returned',
};

function statusTone(status: UCPOrderStatus) {
  if (isCancelledStatus(status)) return 'error' as const;
  if (isCompletedStatus(status)) return 'success' as const;
  if (isPendingStatus(status)) return 'info' as const;
  if (isDispatchedStatus(status)) return 'warning' as const;
  return 'success' as const;
}

function filterOrders(orders: UCPOrder[], filter: StatusFilter) {
  if (filter === 'all') return orders;

  const filterMap: Record<StatusFilter, (status: UCPOrderStatus) => boolean> = {
    all: () => true,
    pending: isPendingStatus,
    accepted: isAcceptedStatus,
    dispatched: isDispatchedStatus,
    completed: isCompletedStatus,
    cancelled: isCancelledStatus,
  };

  return orders.filter((order) => filterMap[filter](order.status));
}

function countOrdersByFilter(orders: UCPOrder[], filter: StatusFilter) {
  return filterOrders(orders, filter).length;
}

export function OrderCard({
  order,
  onAccept,
  onReject,
  onViewDetails,
  processing,
  actionsDisabled = false,
}: {
  order: UCPOrder;
  onAccept?: (orderId: string) => void;
  onReject?: (orderId: string) => void;
  onViewDetails?: (orderId: string) => void;
  processing?: string | null;
  actionsDisabled?: boolean;
}) {
  const canAccept = isPendingStatus(order.status);
  const canReject = isPendingStatus(order.status);
  const isProcessing = processing === order.id;
  const total = order.quote?.total?.value ?? order.quote?.total?.amount ?? '0';
  const currency = order.quote?.total?.currency ?? 'INR';

  return (
    <Card className="gap-5 bg-card/95">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--ui-border)] pb-5">
        <div className="space-y-1">
          <div className="text-base font-semibold tracking-[-0.02em] text-[var(--ui-text)]">
            Order #{order.id}
          </div>
          <div className="text-sm text-[var(--ui-text-secondary)]">
            {new Date(order.createdAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </div>
        </div>
        <Badge tone={statusTone(order.status)}>{statusLabels[order.status] ?? order.status}</Badge>
      </div>

      <div className="space-y-3">
        {order.items.slice(0, 3).map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-4 text-sm text-[var(--ui-text)]"
          >
            <span>
              {item.quantity}x {item.name}
            </span>
            <span className="text-[var(--ui-text-secondary)]">
              {currency} {item.price.value ?? item.price.amount}
            </span>
          </div>
        ))}
        {order.items.length > 3 ? (
          <div className="text-sm text-[var(--ui-text-secondary)]">
            +{order.items.length - 3} more items
          </div>
        ) : null}
      </div>

      <div className="space-y-2 text-sm text-[var(--ui-text-secondary)]">
        <div>Customer: {order.buyer?.name ?? 'Unknown buyer'}</div>
        <div>
          Delivery to: {order.deliveryAddress?.city ?? 'Unknown city'}
          {order.deliveryAddress?.state ? `, ${order.deliveryAddress.state}` : ''}
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t border-[var(--ui-border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-lg font-semibold tracking-[-0.03em] text-[var(--ui-text)]">
          Total: {currency} {total}
        </div>

        <div className="flex flex-wrap gap-2">
          {canAccept ? (
            <Button
              type="button"
              size="sm"
              onClick={() => onAccept?.(order.id)}
              disabled={isProcessing || actionsDisabled}
            >
              Accept
            </Button>
          ) : null}
          {canReject ? (
            <Button
              type="button"
              size="sm"
              variant="danger"
              onClick={() => onReject?.(order.id)}
              disabled={isProcessing || actionsDisabled}
            >
              Reject
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => onViewDetails?.(order.id)}
          >
            View Details
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function OrdersPage() {
  const navigate = useNavigate();
  const { subjectId, walletAddress, principalId } = useSubject();
  const trust = useTrustState(walletAddress);
  const [orders, setOrders] = useState<UCPOrder[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [usingLocalOrderCache, setUsingLocalOrderCache] = useState(false);
  const orderActionsDisabled =
    trust.loading ||
    (!elevatedTrustSatisfied(trust.state, principalId) &&
      !canExecuteSellerAction('order_accept', trust.state));

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Portfolio stack: gateway /api/demo-commerce is the order source of truth.
      // Legacy /api/seller/orders only when an external UCP base is configured.
      try {
        const commerceOrders = await listCommerceSellerOrders(walletAddress || undefined);
        setOrders(commerceOrders);
        setUsingLocalOrderCache(false);
        return;
      } catch (primaryErr) {
        if (!COMMERCE_DEMO_MODE && COMMERCE_API_BASE) {
          const response = await fetch(buildCommerceUrl('/api/seller/orders'), {
            credentials: 'include',
          });
          if (!response.ok) {
            throw primaryErr instanceof Error ? primaryErr : new Error('Failed to load orders');
          }
          const data = await response.json();
          setOrders(data.orders || []);
          setUsingLocalOrderCache(false);
          return;
        }
        setOrders(listDemoSellerOrders());
        setUsingLocalOrderCache(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const handleAccept = useCallback(
    async (orderId: string) => {
      if (
        !elevatedTrustSatisfied(trust.state, principalId) &&
        !canExecuteSellerAction('order_accept', trust.state)
      ) {
        const reason = 'Verified seller trust is required before accepting orders.';
        recordSellerActionAuditEvent({
          action: 'order_accept',
          targetId: orderId,
          walletAddress,
          subjectId,
          trustState: trust.state,
          outcome: 'blocked',
          reason,
        });
        setError(reason);
        return;
      }

      setProcessing(orderId);
      try {
        try {
          await transitionCommerceSellerOrder(orderId, 'accepted');
          await loadOrders();
        } catch {
          if (!COMMERCE_DEMO_MODE && COMMERCE_API_BASE) {
            const response = await fetch(buildCommerceUrl(`/api/seller/orders/${orderId}/accept`), {
              method: 'POST',
              credentials: 'include',
              headers: buildSellerActionHeaders(
                buildSellerBackendActionPolicy('order_accept', {
                  trustState: trust.state,
                  walletAddress,
                  subjectId,
                  auditSubjectId: orderId,
                })
              ),
            });
            if (!response.ok) {
              throw new Error('Failed to accept order');
            }
            await loadOrders();
          } else {
            const next = acceptDemoSellerOrder(orderId);
            if (!next) {
              throw new Error('Order not found');
            }
            setOrders(listDemoSellerOrders());
            setUsingLocalOrderCache(true);
          }
        }
        recordSellerActionAuditEvent({
          action: 'order_accept',
          targetId: orderId,
          walletAddress,
          subjectId,
          trustState: trust.state,
          outcome: 'applied',
          reason: 'Accepted seller order from the orders list.',
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to accept order');
      } finally {
        setProcessing(null);
      }
    },
    [loadOrders, principalId, subjectId, trust.state, walletAddress]
  );

  const handleReject = useCallback(
    async (orderId: string) => {
      if (!window.confirm('Are you sure you want to reject this order?')) {
        return;
      }
      if (
        !elevatedTrustSatisfied(trust.state, principalId) &&
        !canExecuteSellerAction('order_reject', trust.state)
      ) {
        const reason = 'Verified seller trust is required before rejecting orders.';
        recordSellerActionAuditEvent({
          action: 'order_reject',
          targetId: orderId,
          walletAddress,
          subjectId,
          trustState: trust.state,
          outcome: 'blocked',
          reason,
        });
        setError(reason);
        return;
      }

      setProcessing(orderId);
      try {
        try {
          await transitionCommerceSellerOrder(orderId, 'rejected');
          await loadOrders();
        } catch {
          if (!COMMERCE_DEMO_MODE && COMMERCE_API_BASE) {
            const response = await fetch(buildCommerceUrl(`/api/seller/orders/${orderId}/reject`), {
              method: 'POST',
              credentials: 'include',
              headers: buildSellerActionHeaders(
                buildSellerBackendActionPolicy('order_reject', {
                  trustState: trust.state,
                  walletAddress,
                  subjectId,
                  auditSubjectId: orderId,
                  auditReferenceId: 'seller-rejection',
                })
              ),
              body: JSON.stringify({ reason: 'Seller rejected' }),
            });
            if (!response.ok) {
              throw new Error('Failed to reject order');
            }
            await loadOrders();
          } else {
            const next = rejectDemoSellerOrder(orderId, 'Seller rejected');
            if (!next) {
              throw new Error('Order not found');
            }
            setOrders(listDemoSellerOrders());
            setUsingLocalOrderCache(true);
          }
        }
        recordSellerActionAuditEvent({
          action: 'order_reject',
          targetId: orderId,
          walletAddress,
          subjectId,
          trustState: trust.state,
          outcome: 'applied',
          reason: 'Rejected seller order from the orders list.',
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to reject order');
      } finally {
        setProcessing(null);
      }
    },
    [loadOrders, principalId, subjectId, trust.state, walletAddress]
  );

  const handleViewDetails = useCallback(
    (orderId: string) => {
      navigate(`/orders/${orderId}`);
    },
    [navigate]
  );

  const filteredOrders = useMemo(() => filterOrders(orders, filter), [orders, filter]);

  return (
    <PageLayout>
      <PageHeader
        title="Incoming Orders"
        subtitle="Manage and track buyer demand without leaving the trust-aware seller shell."
      />
      {usingLocalOrderCache ? (
        <div className="mb-4">
          <Badge tone="warning">Demo (local cache)</Badge>
        </div>
      ) : null}
      <TrustNotice
        state={effectiveElevatedTrustState(trust.state, principalId)}
        loading={trust.loading}
        error={trust.error}
        reason={trust.reason}
        actionLabel="Resolve seller trust"
      />

      {loading ? (
        <AsyncState
          kind="loading"
          title="Loading orders"
          description="Pulling the latest order queue into the seller shell."
        />
      ) : error ? (
        <AsyncState
          kind="error"
          title="Orders unavailable"
          description={error}
          action={
            <Button type="button" variant="secondary" onClick={() => void loadOrders()}>
              Retry
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          <div className="hide-scrollbar flex gap-2 overflow-x-auto pb-1">
            {filterOptions.map((filterOption) => {
              const count = countOrdersByFilter(orders, filterOption);
              const active = filter === filterOption;

              return (
                <button
                  key={filterOption}
                  type="button"
                  onClick={() => setFilter(filterOption)}
                  className={cn(
                    'inline-flex items-center rounded-full px-4 py-2 text-sm font-medium capitalize transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-secondary text-secondary-foreground hover:bg-muted'
                  )}
                >
                  {filterOption}
                  <span className="ml-2 text-xs opacity-80">{count}</span>
                </button>
              );
            })}
          </div>

          {filteredOrders.length === 0 ? (
            <AsyncState
              kind="empty"
              title={filter === 'all' ? 'No incoming orders yet' : `No ${filter} orders`}
              description={
                filter === 'all'
                  ? 'Orders will appear here once buyers place them through the ONDC network.'
                  : `There are no ${filter} orders in the queue right now.`
              }
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {filteredOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onAccept={handleAccept}
                  onReject={handleReject}
                  onViewDetails={handleViewDetails}
                  processing={processing}
                  actionsDisabled={orderActionsDisabled}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </PageLayout>
  );
}
