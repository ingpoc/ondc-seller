import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { UCPOrder, UCPOrderStatus } from '@ondc-sdk/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
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

        const response = await fetch(buildCommerceUrl(`/api/seller/orders/${id}`), {
          credentials: 'include',
        });
        if (!response.ok) throw new Error('Order not found');
        const data = await response.json();
        setOrder(data.order);
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
    setProcessing('accept');
    try {
      if (COMMERCE_DEMO_MODE) {
        const next = acceptDemoSellerOrder(id);
        if (!next) throw new Error('Order not found');
        setOrder(next);
        return;
      }

      const response = await fetch(buildCommerceUrl(`/api/seller/orders/${id}/accept`), {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to accept order');
      const data = await response.json();
      setOrder(data.order);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept order');
    } finally {
      setProcessing(null);
    }
  }

  async function handleReject() {
    if (!order || !id) return;
    if (!confirm('Are you sure you want to reject this order?')) return;

    setProcessing('reject');
    try {
      if (COMMERCE_DEMO_MODE) {
        const next = rejectDemoSellerOrder(id, 'Seller rejected the order');
        if (!next) throw new Error('Order not found');
        setOrder(next);
        return;
      }

      const response = await fetch(buildCommerceUrl(`/api/seller/orders/${id}/reject`), {
        method: 'POST',
        credentials: 'include',
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
  }

  async function handleDispatch() {
    if (!order || !id) return;
    const trackingId = prompt('Enter tracking ID:');
    if (!trackingId) return;

    setProcessing('dispatch');
    try {
      if (COMMERCE_DEMO_MODE) {
        const next = dispatchDemoSellerOrder(id, trackingId);
        if (!next) throw new Error('Order not found');
        setOrder(next);
        return;
      }

      const response = await fetch(buildCommerceUrl(`/api/seller/orders/${id}/dispatch`), {
        method: 'POST',
        credentials: 'include',
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
          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-foreground">Order not found</h1>
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

      <div className="flex flex-wrap gap-3">
        {canAcceptOrder(order.status) ? (
          <Button disabled={processing === 'accept'} onClick={() => void handleAccept()}>
            {processing === 'accept' ? 'Processing…' : 'Accept order'}
          </Button>
        ) : null}
        {canRejectOrder(order.status) ? (
          <Button
            variant="destructive"
            disabled={processing === 'reject'}
            onClick={() => void handleReject()}
          >
            {processing === 'reject' ? 'Processing…' : 'Reject order'}
          </Button>
        ) : null}
        {canDispatchOrder(order.status) ? (
          <Button disabled={processing === 'dispatch'} onClick={() => void handleDispatch()}>
            {processing === 'dispatch' ? 'Processing…' : 'Dispatch order'}
          </Button>
        ) : null}
      </div>

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
                    {[order.deliveryAddress?.city, order.deliveryAddress?.state, order.deliveryAddress?.postalCode]
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
                  <p className="text-sm text-foreground">{order.fulfillment?.providerName || 'Pending provider'}</p>
                  <p className="text-sm text-muted-foreground">
                    {order.fulfillment?.tracking?.statusMessage || 'No tracking update yet.'}
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Payment
                  </div>
                  <p className="text-sm text-foreground">{order.payment?.type || 'Unknown payment type'}</p>
                  <p className="text-sm text-muted-foreground">{order.payment?.status || 'Unknown status'}</p>
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
                    {order.quote?.total?.currency || item.price.currency} {item.price.value ?? item.price.amount}
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
                      <p className="mt-2 text-sm text-muted-foreground">Next step: {note.next_step}</p>
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
                  {order.quote?.total?.currency} {order.quote?.total?.value ?? order.quote?.total?.amount}
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
