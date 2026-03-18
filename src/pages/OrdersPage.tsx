import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { UCPOrder, UCPOrderStatus } from '@ondc-sdk/shared';
import {
  PageLayout,
  PageHeader,
  CARD,
  SPACING,
  TYPOGRAPHY,
  BUTTON,
  BADGE,
  DRAMS,
  RADIUS,
  TRANSITIONS,
  GRID,
} from '@portfolio-ui';
import { COMMERCE_DEMO_MODE, buildCommerceUrl } from '../lib/commerceConfig';

// Order status grouping for seller
const isPendingStatus = (status: UCPOrderStatus): boolean => status === 'created';
const isAcceptedStatus = (status: UCPOrderStatus): boolean =>
  ['accepted', 'packed'].includes(status);
const isDispatchedStatus = (status: UCPOrderStatus): boolean =>
  ['shipped', 'out_for_delivery'].includes(status);
const isCompletedStatus = (status: UCPOrderStatus): boolean => status === 'delivered';
const isCancelledStatus = (status: UCPOrderStatus): boolean =>
  ['cancelled', 'returned'].includes(status);

const getStatusLabel = (status: UCPOrderStatus): string => {
  const labels: Record<UCPOrderStatus, string> = {
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
  return labels[status] || status;
};

const getStatusBadgeVariant = (status: UCPOrderStatus): keyof typeof BADGE => {
  if (isCancelledStatus(status)) return 'error';
  if (isCompletedStatus(status)) return 'success';
  if (isPendingStatus(status)) return 'info';
  if (isDispatchedStatus(status)) return 'warning';
  return 'success';
};

type StatusFilter = 'all' | 'pending' | 'accepted' | 'dispatched' | 'completed' | 'cancelled';

// Extract filter logic to reuse
const filterOrders = (orders: UCPOrder[], filter: StatusFilter): UCPOrder[] => {
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
};

const countOrdersByFilter = (orders: UCPOrder[], filter: StatusFilter): number => {
  return filterOrders(orders, filter).length;
};

interface OrderCardProps {
  order: UCPOrder;
  onAccept?: (orderId: string) => void;
  onReject?: (orderId: string) => void;
  onViewDetails?: (orderId: string) => void;
  processing?: string | null;
}

export function OrderCard({
  order,
  onAccept,
  onReject,
  onViewDetails,
  processing,
}: OrderCardProps) {
  const canAccept = isPendingStatus(order.status);
  const canReject = isPendingStatus(order.status);
  const isProcessing = processing === order.id;

  const HEADER_STYLE = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
    paddingBottom: SPACING.lg,
    borderBottom: `1px solid ${DRAMS.grayTrack}`,
  };

  const ORDER_ID_STYLE = {
    ...TYPOGRAPHY.bodySmall,
    color: DRAMS.textLight,
    marginBottom: SPACING.xs,
  };

  const DATE_STYLE = {
    ...TYPOGRAPHY.bodySmall,
    color: DRAMS.textLight,
  };

  const ITEM_ROW_STYLE = {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
    ...TYPOGRAPHY.body,
  };

  const INFO_ROW_STYLE = {
    ...TYPOGRAPHY.bodySmall,
    color: DRAMS.textLight,
    marginBottom: SPACING.xs,
  };

  const FOOTER_STYLE = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: SPACING.md,
    borderTop: `1px solid ${DRAMS.grayTrack}`,
  };

  const TOTAL_STYLE = {
    ...TYPOGRAPHY.h4,
    color: DRAMS.textDark,
  };

  const ACTIONS_STYLE = {
    display: 'flex',
    gap: SPACING.sm,
  };

  return (
    <div style={CARD.base}>
      <div style={HEADER_STYLE}>
        <div>
          <div style={ORDER_ID_STYLE}>Order #{order.id}</div>
          <div style={DATE_STYLE}>
            {new Date(order.createdAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </div>
        </div>
        <div
          style={{
            ...BADGE.base,
            ...BADGE[getStatusBadgeVariant(order.status)],
          }}
        >
          {getStatusLabel(order.status)}
        </div>
      </div>

      <div style={{ marginBottom: SPACING.lg }}>
        {order.items.slice(0, 3).map((item) => (
          <div key={item.id} style={ITEM_ROW_STYLE}>
            <span style={{ color: DRAMS.textDark }}>
              {item.quantity}x {item.name}
            </span>
            <span style={{ color: DRAMS.textLight }}>
              {order.quote?.total?.currency} {item.price.value ?? item.price.amount}
            </span>
          </div>
        ))}
        {order.items.length > 3 && (
          <div style={{ ...TYPOGRAPHY.bodySmall, color: DRAMS.textLight, marginTop: SPACING.sm }}>
            +{order.items.length - 3} more items
          </div>
        )}
      </div>

      <div style={{ marginBottom: SPACING.lg }}>
        <div style={INFO_ROW_STYLE}>Customer: {order.buyer?.name}</div>
        <div style={INFO_ROW_STYLE}>
          Delivery to: {order.deliveryAddress?.city}, {order.deliveryAddress?.state}
        </div>
      </div>

      <div style={FOOTER_STYLE}>
        <div style={TOTAL_STYLE}>
          Total: {order.quote?.total?.currency}{' '}
          {order.quote?.total?.value ?? order.quote?.total?.amount}
        </div>

        <div style={ACTIONS_STYLE}>
          {canAccept && onAccept && (
            <button
              onClick={() => onAccept(order.id)}
              disabled={isProcessing}
              style={{
                ...BUTTON.primary,
                padding: `${SPACING.md} ${SPACING.lg}`,
                ...TYPOGRAPHY.bodySmall,
                ...(isProcessing ? { opacity: 0.5 } : {}),
              }}
            >
              Accept
            </button>
          )}
          {canReject && onReject && (
            <button
              onClick={() => onReject(order.id)}
              disabled={isProcessing}
              style={{
                ...BUTTON.danger,
                padding: `${SPACING.md} ${SPACING.lg}`,
                ...TYPOGRAPHY.bodySmall,
                ...(isProcessing ? { opacity: 0.5 } : {}),
              }}
            >
              Reject
            </button>
          )}
          <button
            onClick={() => onViewDetails?.(order.id)}
            style={{
              ...BUTTON.secondary,
              padding: `${SPACING.md} ${SPACING.lg}`,
              ...TYPOGRAPHY.bodySmall,
            }}
          >
            View Details
          </button>
        </div>
      </div>
    </div>
  );
}

export function OrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<UCPOrder[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (COMMERCE_DEMO_MODE) {
        setOrders([]);
        return;
      }

      const response = await fetch(buildCommerceUrl('/api/seller/orders'));
      if (!response.ok) {
        throw new Error('Failed to load orders');
      }
      const data = await response.json();
      setOrders(data.orders || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleAccept = useCallback(
    async (orderId: string) => {
      setProcessing(orderId);
      try {
        if (COMMERCE_DEMO_MODE) {
          setOrders((current) => current.map((order) => (
            order.id === orderId ? { ...order, status: 'accepted' } : order
          )));
          return;
        }

        const response = await fetch(buildCommerceUrl(`/api/seller/orders/${orderId}/accept`), {
          method: 'POST',
        });
        if (!response.ok) {
          throw new Error('Failed to accept order');
        }
        await loadOrders();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to accept order');
      } finally {
        setProcessing(null);
      }
    },
    [loadOrders]
  );

  const handleReject = useCallback(
    async (orderId: string) => {
      if (!confirm('Are you sure you want to reject this order?')) {
        return;
      }

      setProcessing(orderId);
      try {
        if (COMMERCE_DEMO_MODE) {
          setOrders((current) => current.map((order) => (
            order.id === orderId
              ? {
                  ...order,
                  status: 'cancelled',
                  cancellation: {
                    cancelledAt: new Date().toISOString(),
                    cancelledBy: 'seller',
                    reason: 'Seller rejected',
                  },
                }
              : order
          )));
          return;
        }

        const response = await fetch(buildCommerceUrl(`/api/seller/orders/${orderId}/reject`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Seller rejected' }),
        });
        if (!response.ok) {
          throw new Error('Failed to reject order');
        }
        await loadOrders();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to reject order');
      } finally {
        setProcessing(null);
      }
    },
    [loadOrders]
  );

  const handleViewDetails = useCallback(
    (orderId: string) => {
      navigate(`/orders/${orderId}`);
    },
    [navigate]
  );

  const filteredOrders = useMemo(() => filterOrders(orders, filter), [orders, filter]);

  if (loading) {
    return (
      <PageLayout>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: SPACING['3xl'],
            color: DRAMS.textLight,
            ...TYPOGRAPHY.body,
          }}
        >
          Loading orders...
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout>
        <PageHeader title="Incoming Orders" subtitle="Manage and track all your customer orders" />
        <div style={{ ...BADGE.error, padding: SPACING.lg }}>
          <p style={{ margin: 0, ...TYPOGRAPHY.label }}>Error</p>
          <p style={{ margin: `${SPACING.xs} 0 0 0` }}>{error}</p>
          <button
            onClick={loadOrders}
            style={{ marginTop: SPACING.lg, ...BUTTON.secondary, ...TYPOGRAPHY.body }}
          >
            Retry
          </button>
        </div>
      </PageLayout>
    );
  }

  const filterOptions: StatusFilter[] = [
    'all',
    'pending',
    'accepted',
    'dispatched',
    'completed',
    'cancelled',
  ];

  // DRAMS: Pill-style filter tabs
  const FILTERS_STYLE = {
    display: 'flex',
    gap: SPACING.sm,
    paddingBottom: SPACING.lg,
    overflowX: 'auto' as const,
  };

  // DRAMS: Pill-style filter buttons
  const FILTER_BUTTON_STYLE = {
    padding: `${SPACING.md} ${SPACING.xl}`,
    border: 'none',
    borderRadius: RADIUS.pill,
    background: 'transparent',
    ...TYPOGRAPHY.body,
    cursor: 'pointer',
    textTransform: 'capitalize' as const,
    whiteSpace: 'nowrap' as const,
    transition: TRANSITIONS.hover,
  };

  return (
    <PageLayout>
      <PageHeader title="Incoming Orders" subtitle="Manage and track all your customer orders" />

      <div style={FILTERS_STYLE}>
        {filterOptions.map((filterOption) => {
          const count = countOrdersByFilter(orders, filterOption);
          return (
            <button
              key={filterOption}
              onClick={() => setFilter(filterOption)}
              style={{
                ...FILTER_BUTTON_STYLE,
                background: filter === filterOption ? DRAMS.orange : DRAMS.grayTrack,
                color: filter === filterOption ? 'white' : DRAMS.textDark,
                fontWeight: filter === filterOption ? 600 : TYPOGRAPHY.label.fontWeight,
              }}
            >
              {filterOption}
              <span style={{ marginLeft: SPACING.sm, opacity: 0.7 }}>{count}</span>
            </button>
          );
        })}
      </div>

      {filteredOrders.length === 0 ? (
        <div
          style={{ ...CARD.base, textAlign: 'center', padding: `${SPACING['3xl']} ${SPACING.xl}` }}
        >
          <p style={{ ...TYPOGRAPHY.h3, color: DRAMS.textDark, margin: `0 0 ${SPACING.sm} 0` }}>
            {filter === 'all' ? 'No incoming orders yet' : `No ${filter} orders`}
          </p>
          <p style={{ ...TYPOGRAPHY.body, color: DRAMS.textLight, margin: 0 }}>
            {filter === 'all'
              ? 'Orders will appear here when customers place them'
              : `There are no ${filter} orders at the moment`}
          </p>
        </div>
      ) : (
        <div style={GRID.autoFill}>
          {filteredOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onAccept={handleAccept}
              onReject={handleReject}
              onViewDetails={handleViewDetails}
              processing={processing}
            />
          ))}
        </div>
      )}
    </PageLayout>
  );
}
