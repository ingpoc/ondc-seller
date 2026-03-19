import { useState, useEffect, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { UCPOrder, UCPOrderStatus } from '@ondc-sdk/shared';
import {
  PageLayout,
  PageHeader,
  DRAMS,
  SPACING,
  TYPOGRAPHY,
  RADIUS,
  BUTTON,
  CARD,
  COLORS,
} from '@portfolio-ui';
import { COMMERCE_DEMO_MODE, buildCommerceUrl } from '../lib/commerceConfig';
import {
  acceptDemoSellerOrder,
  dispatchDemoSellerOrder,
  getDemoSellerOrder,
  listSellerOrderNotesForOrder,
  rejectDemoSellerOrder,
} from '../lib/localSellerOrders';

const canAcceptOrder = (status: UCPOrderStatus): boolean => status === 'created';
const canRejectOrder = (status: UCPOrderStatus): boolean => status === 'created';
const canDispatchOrder = (status: UCPOrderStatus): boolean =>
  ['accepted', 'packed'].includes(status);

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

const getStatusColor = (status: UCPOrderStatus): string => {
  if (status === 'cancelled' || status === 'returned') return COLORS.error;
  if (status === 'delivered') return DRAMS.orange;
  if (status === 'created') return DRAMS.textDark;
  if (['accepted', 'packed'].includes(status)) return DRAMS.orange;
  return DRAMS.orange;
};

interface TimelineEvent {
  status: string;
  label: string;
  timestamp?: string;
  completed: boolean;
}

const getOrderTimeline = (order: UCPOrder): TimelineEvent[] => {
  const events: TimelineEvent[] = [
    {
      status: 'created',
      label: 'Order Placed',
      timestamp: order.createdAt,
      completed: true,
    },
  ];

  if (
    order.status === 'accepted' ||
    ['accepted', 'packed', 'shipped', 'out_for_delivery', 'delivered'].includes(order.status)
  ) {
    events.push({
      status: 'accepted',
      label: 'Order Accepted',
      completed: true,
    });
  }

  if (order.fulfillment?.status === 'in_transit' || order.status === 'shipped') {
    events.push({
      status: 'packed',
      label: 'Order Packed',
      completed: true,
    });
  }

  if (order.status === 'shipped' || order.fulfillment?.status === 'in_transit') {
    events.push({
      status: 'shipped',
      label: 'Order Dispatched',
      completed: true,
    });
  }

  if (order.status === 'cancelled') {
    events.push({
      status: 'cancelled',
      label: 'Order Cancelled',
      timestamp: order.cancellation?.cancelledAt,
      completed: true,
    });
  }

  return events;
};

const BACK_BUTTON_STYLE: CSSProperties = {
  ...BUTTON.secondary,
  padding: `${SPACING.sm} ${SPACING.lg}`,
  marginBottom: SPACING.md,
};

const STATUS_BADGE_STYLE: CSSProperties = {
  padding: `${SPACING.sm} ${SPACING.lg}`,
  borderRadius: RADIUS.md,
  ...TYPOGRAPHY.label,
  textTransform: 'capitalize' as const,
};

const ACTIONS_CARD_STYLE: CSSProperties = {
  ...CARD.base,
  marginBottom: SPACING.xl,
  display: 'flex',
  gap: SPACING.md,
  flexWrap: 'wrap' as const,
};

const SECTION_CARD_STYLE: CSSProperties = {
  ...CARD.base,
  marginBottom: SPACING.xl,
};

const SECTION_TITLE_STYLE: CSSProperties = {
  ...TYPOGRAPHY.h3,
  margin: `0 0 ${SPACING.md} 0`,
};

const ITEM_ROW_STYLE: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: SPACING.md,
  borderRadius: RADIUS.md,
  border: `1px solid ${DRAMS.grayTrack}`,
  backgroundColor: 'white',
  marginBottom: SPACING.sm,
};

const TIMELINE_STYLE: CSSProperties = {
  position: 'relative' as const,
};

const TIMELINE_LINE_STYLE: CSSProperties = {
  position: 'absolute' as const,
  left: '8px',
  top: 0,
  bottom: 0,
  width: '2px',
  backgroundColor: DRAMS.grayTrack,
};

const TIMELINE_EVENT_STYLE: CSSProperties = {
  position: 'relative' as const,
  paddingLeft: SPACING['3xl'],
  paddingBottom: SPACING.xl,
};

const TIMELINE_DOT_STYLE: CSSProperties = {
  position: 'absolute' as const,
  left: 0,
  top: '4px',
  width: '18px',
  height: '18px',
  borderRadius: RADIUS.circle,
  border: '2px solid white',
};

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<UCPOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const orderNotes = order ? listSellerOrderNotesForOrder(order.id) : [];

  useEffect(() => {
    const loadOrder = async () => {
      if (!id) {
        setError('Order ID is required');
        setLoading(false);
        return;
      }

      try {
        if (COMMERCE_DEMO_MODE) {
          const demoOrder = getDemoSellerOrder(id);
          if (!demoOrder) {
            throw new Error('Order not found');
          }
          setOrder(demoOrder);
          return;
        }

        const response = await fetch(buildCommerceUrl(`/api/seller/orders/${id}`));
        if (!response.ok) throw new Error('Order not found');
        const data = await response.json();
        setOrder(data.order);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load order');
      } finally {
        setLoading(false);
      }
    };

    loadOrder();
  }, [id]);

  const handleAccept = async () => {
    if (!order || !id) return;
    setProcessing('accept');
    try {
      if (COMMERCE_DEMO_MODE) {
        const next = acceptDemoSellerOrder(id);
        if (!next) {
          throw new Error('Order not found');
        }
        setOrder(next);
        return;
      }

      const response = await fetch(buildCommerceUrl(`/api/seller/orders/${id}/accept`), {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to accept order');
      const data = await response.json();
      setOrder(data.order);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept order');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async () => {
    if (!order || !id) return;
    if (!confirm('Are you sure you want to reject this order?')) return;

    setProcessing('reject');
    try {
      if (COMMERCE_DEMO_MODE) {
        const next = rejectDemoSellerOrder(id, 'Seller rejected the order');
        if (!next) {
          throw new Error('Order not found');
        }
        setOrder(next);
        return;
      }

      const response = await fetch(buildCommerceUrl(`/api/seller/orders/${id}/reject`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Seller rejected the order' }),
      });
      if (!response.ok) throw new Error('Failed to reject order');
      const data = await response.json();
      setOrder(data.order);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject order');
    } finally {
      setProcessing(null);
    }
  };

  const handleDispatch = async () => {
    if (!order || !id) return;
    const trackingId = prompt('Enter tracking ID:');
    if (!trackingId) return;

    setProcessing('dispatch');
    try {
      if (COMMERCE_DEMO_MODE) {
        const next = dispatchDemoSellerOrder(id, trackingId);
        if (!next) {
          throw new Error('Order not found');
        }
        setOrder(next);
        return;
      }

      const response = await fetch(buildCommerceUrl(`/api/seller/orders/${id}/dispatch`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingId, providerName: 'Standard Courier' }),
      });
      if (!response.ok) throw new Error('Failed to dispatch order');
      const data = await response.json();
      setOrder(data.order);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dispatch order');
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return (
      <PageLayout>
        <p style={{ ...TYPOGRAPHY.body, color: DRAMS.textLight }}>Loading order details...</p>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout>
        <PageHeader title="Error" subtitle={error} />
        <button onClick={() => navigate('/orders')} style={BACK_BUTTON_STYLE}>
          Back to Orders
        </button>
      </PageLayout>
    );
  }

  if (!order) {
    return (
      <PageLayout>
        <PageHeader title="Not Found" subtitle="Order not found" />
        <button onClick={() => navigate('/orders')} style={BACK_BUTTON_STYLE}>
          Back to Orders
        </button>
      </PageLayout>
    );
  }

  const timeline = getOrderTimeline(order);
  const statusColor = getStatusColor(order.status);

  return (
    <PageLayout>
      <button onClick={() => navigate('/orders')} style={BACK_BUTTON_STYLE}>
        ← Back to Orders
      </button>

      <div
        style={{
          ...CARD.base,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: SPACING.lg,
          paddingBottom: SPACING.lg,
          borderBottom: `1px solid ${DRAMS.grayTrack}`,
        }}
      >
        <div>
          <h1 style={{ ...TYPOGRAPHY.h2, margin: `0 0 ${SPACING.sm} 0` }}>Order #{order.id}</h1>
          <p style={{ ...TYPOGRAPHY.bodySmall, color: DRAMS.textLight, margin: 0 }}>
            Placed on{' '}
            {new Date(order.createdAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
        <div
          style={{ ...STATUS_BADGE_STYLE, backgroundColor: `${statusColor}15`, color: statusColor }}
        >
          {getStatusLabel(order.status)}
        </div>
      </div>

      <div style={ACTIONS_CARD_STYLE}>
        {canAcceptOrder(order.status) && (
          <button
            onClick={handleAccept}
            disabled={processing === 'accept'}
            style={{
              ...BUTTON.primary,
              opacity: processing === 'accept' ? 0.6 : 1,
              cursor: processing === 'accept' ? 'not-allowed' : 'pointer',
            }}
          >
            {processing === 'accept' ? 'Processing...' : 'Accept Order'}
          </button>
        )}
        {canRejectOrder(order.status) && (
          <button
            onClick={handleReject}
            disabled={processing === 'reject'}
            style={{
              ...BUTTON.danger,
              opacity: processing === 'reject' ? 0.6 : 1,
              cursor: processing === 'reject' ? 'not-allowed' : 'pointer',
            }}
          >
            {processing === 'reject' ? 'Processing...' : 'Reject Order'}
          </button>
        )}
        {canDispatchOrder(order.status) && (
          <button
            onClick={handleDispatch}
            disabled={processing === 'dispatch'}
            style={{
              ...BUTTON.primary,
              opacity: processing === 'dispatch' ? 0.6 : 1,
              cursor: processing === 'dispatch' ? 'not-allowed' : 'pointer',
            }}
          >
            {processing === 'dispatch' ? 'Processing...' : 'Dispatch Order'}
          </button>
        )}
      </div>

      {order.cancellation && (
        <div
          style={{ ...SECTION_CARD_STYLE, backgroundColor: '#fef2f2', border: '1px solid #fecaca' }}
        >
          <p style={{ ...TYPOGRAPHY.label, margin: `0 0 ${SPACING.sm} 0`, color: '#991b1b' }}>
            Order Cancelled
          </p>
          <p style={{ ...TYPOGRAPHY.bodySmall, color: '#7f1d1d', margin: 0 }}>
            Cancelled by: {order.cancellation.cancelledBy}
            {order.cancellation.reason && ` - ${order.cancellation.reason}`}
          </p>
        </div>
      )}

      <div style={SECTION_CARD_STYLE}>
        <h3 style={SECTION_TITLE_STYLE}>Buyer Information</h3>
        <p style={{ ...TYPOGRAPHY.h4, margin: `0 0 ${SPACING.xs} 0` }}>{order.buyer?.name}</p>
        {order.buyer?.contact?.phone && (
          <p style={{ ...TYPOGRAPHY.body, margin: `0 0 ${SPACING.xs} 0`, color: DRAMS.textLight }}>
            Phone: {order.buyer.contact.phone}
          </p>
        )}
        {order.buyer?.contact?.email && (
          <p style={{ ...TYPOGRAPHY.body, color: DRAMS.textLight, margin: 0 }}>
            Email: {order.buyer.contact.email}
          </p>
        )}
      </div>

      <div style={{ marginBottom: SPACING.xl }}>
        <h3 style={SECTION_TITLE_STYLE}>Delivery Address</h3>
        <div style={{ ...TYPOGRAPHY.body, lineHeight: 1.6, color: DRAMS.textDark }}>
          <p style={{ ...TYPOGRAPHY.h4, margin: `0 0 ${SPACING.xs} 0` }}>
            {order.deliveryAddress?.line1}
          </p>
          {order.deliveryAddress?.line2 && (
            <p style={{ margin: `0 0 ${SPACING.xs} 0` }}>{order.deliveryAddress.line2}</p>
          )}
          <p style={{ margin: `0 0 ${SPACING.xs} 0` }}>
            {order.deliveryAddress?.city}, {order.deliveryAddress?.state}{' '}
            {order.deliveryAddress?.postalCode}
          </p>
          <p style={{ margin: 0 }}>{order.deliveryAddress?.country}</p>
        </div>
      </div>

      <div style={{ marginBottom: SPACING.xl }}>
        <h3 style={SECTION_TITLE_STYLE}>Order Items</h3>
        <div>
          {order.items.map((item) => (
            <div key={item.id} style={ITEM_ROW_STYLE}>
              <div>
                <p style={{ ...TYPOGRAPHY.h4, margin: `0 0 ${SPACING.xs} 0` }}>{item.name}</p>
                <p style={{ ...TYPOGRAPHY.bodySmall, color: DRAMS.textLight, margin: 0 }}>
                  Quantity: {item.quantity}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ ...TYPOGRAPHY.h4, margin: 0, color: DRAMS.orange }}>
                  {order.quote?.total?.currency} {item.price.value ?? item.price.amount}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          ...SECTION_CARD_STYLE,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ ...TYPOGRAPHY.h3 }}>Order Total</span>
        <span style={{ ...TYPOGRAPHY.h2, color: DRAMS.orange }}>
          {order.quote?.total?.currency} {order.quote?.total?.value ?? order.quote?.total?.amount}
        </span>
      </div>

      <div style={{ marginBottom: SPACING.xl }}>
        <h3 style={SECTION_TITLE_STYLE}>Order Timeline</h3>
        <div style={TIMELINE_STYLE}>
          <div style={TIMELINE_LINE_STYLE} />
          {timeline.map((event, index) => (
            <div
              key={index}
              style={{
                ...TIMELINE_EVENT_STYLE,
                paddingBottom: index < timeline.length - 1 ? SPACING.xl : 0,
              }}
            >
              <div
                style={{
                  ...TIMELINE_DOT_STYLE,
                  backgroundColor: event.completed ? DRAMS.orange : DRAMS.grayTrack,
                  boxShadow: `0 0 0 2px ${event.completed ? DRAMS.orange : DRAMS.grayTrack}`,
                }}
              />
              <div>
                <p style={{ ...TYPOGRAPHY.h4, margin: `0 0 ${SPACING.xs} 0` }}>{event.label}</p>
                {event.timestamp && (
                  <p style={{ ...TYPOGRAPHY.bodySmall, color: DRAMS.textLight, margin: 0 }}>
                    {new Date(event.timestamp).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {orderNotes.length > 0 ? (
        <div style={SECTION_CARD_STYLE}>
          <h3 style={{ ...TYPOGRAPHY.h4, margin: `0 0 ${SPACING.md} 0` }}>Seller Follow-up Notes</h3>
          <div style={{ display: 'grid', gap: SPACING.md }}>
            {orderNotes.map((note) => (
              <div
                key={note.id}
                style={{
                  border: `1px solid ${DRAMS.grayTrack}`,
                  borderRadius: RADIUS.md,
                  padding: SPACING.md,
                  backgroundColor: 'white',
                }}
              >
                <p style={{ ...TYPOGRAPHY.body, margin: 0 }}>{note.note}</p>
                {note.next_step ? (
                  <p style={{ ...TYPOGRAPHY.bodySmall, color: DRAMS.textLight, margin: `${SPACING.xs} 0 0 0` }}>
                    Next step: {note.next_step}
                  </p>
                ) : null}
                <p style={{ ...TYPOGRAPHY.bodySmall, color: DRAMS.textLight, margin: `${SPACING.xs} 0 0 0` }}>
                  {new Date(note.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {order.fulfillment?.tracking && (
        <div style={SECTION_CARD_STYLE}>
          <h3 style={{ ...TYPOGRAPHY.h4, margin: `0 0 ${SPACING.md} 0` }}>Tracking Information</h3>
          {order.fulfillment.tracking.id && (
            <p
              style={{ ...TYPOGRAPHY.body, margin: `0 0 ${SPACING.xs} 0`, color: DRAMS.textLight }}
            >
              Tracking ID: {order.fulfillment.tracking.id}
            </p>
          )}
          {order.fulfillment.tracking.url && (
            <a
              href={order.fulfillment.tracking.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: DRAMS.orange, textDecoration: 'none', ...TYPOGRAPHY.label }}
            >
              Track Package →
            </a>
          )}
        </div>
      )}
    </PageLayout>
  );
}
