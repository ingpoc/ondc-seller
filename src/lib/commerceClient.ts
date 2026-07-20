import type { UCPOrder, UCPOrderStatus } from '@ondc-sdk/shared';
import type { BecknItem } from '../types';
import { TRUST_API_URL } from './identityUrls';
import { isLocalBrowserHost } from './loopback';

export interface DemoCommerceItem {
  item_id: string;
  version: number;
  status: string;
  seller_id: string;
  title: string;
  description: string;
  price_inr: number;
  inventory?: number;
  category_id?: string;
  image_url?: string;
  image_caption?: string;
  delivery_areas?: string[];
  created_at: string;
  updated_at: string;
}

export interface DemoCommerceOrder {
  order_id: string;
  transaction_id: string;
  message_id: string;
  buyer_id: string;
  seller_id: string;
  item_id: string;
  item_title?: string;
  item_version: number;
  quantity: number;
  amount_inr: number;
  status: string;
  refunded_amount_inr?: number;
  refund_status?: string;
  payment?: {
    status?: string;
    amount_inr?: number;
    reference_id?: string;
  };
  delivery_address?: UCPOrder['deliveryAddress'];
  created_at: string;
  updated_at: string;
}

export type SellerCommerceOrder = UCPOrder & {
  refundedAmountInr?: number;
  refundStatus?: string;
  paymentStatus?: string;
};

export function paymentStatusLabel(status?: string): string {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'paid' || normalized === 'succeeded') return 'Paid';
  if (normalized === 'partially_refunded') return 'Partially refunded';
  if (normalized === 'refunded') return 'Refunded';
  if (normalized === 'failed') return 'Payment failed';
  if (normalized === 'pending') return 'Payment pending';
  return 'Payment status unavailable';
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  detail?: string;
  message?: string;
}

async function demoFetch<T>(endpoint: string, init: RequestInit = {}): Promise<T> {
  const base = isLocalBrowserHost() ? TRUST_API_URL : '';
  const response = await fetch(`${base}${endpoint}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as Partial<ApiEnvelope<T>>;
  if (!response.ok || body.success === false) {
    throw new Error(body.detail || body.message || `Commerce request failed (${response.status})`);
  }
  return body.data as T;
}

export function mapDemoItemToCatalogItem(
  item: DemoCommerceItem,
  inventory = item.inventory ?? 0,
): BecknItem {
  return {
    id: item.item_id,
    name: item.title,
    description: item.description,
    descriptor: {
      name: item.title,
      short_desc: item.description,
    },
    price: {
      currency: 'INR',
      value: item.price_inr.toFixed(2),
    },
    images: item.image_url ? [{ url: item.image_url }] : [],
    imageCaption: item.image_caption,
    deliveryAreas: item.delivery_areas,
    category: {
      name: item.category_id || 'Grocery',
    },
    category_id: item.category_id || 'Grocery',
    quantity: inventory,
  } as BecknItem;
}

export function mapDemoOrderToSellerOrder(order: DemoCommerceOrder): SellerCommerceOrder {
  const statusByCommerceStatus: Record<string, UCPOrderStatus> = {
    paid: 'created',
    accepted: 'accepted',
    fulfilled: 'delivered',
    closed: 'delivered',
    rejected: 'cancelled',
    cancelled: 'cancelled',
    unknown: 'created',
  };
  const status = statusByCommerceStatus[order.status] ?? 'created';
  const total = order.amount_inr;
  const unitPrice = total / Math.max(order.quantity, 1);
  const delivery = order.delivery_address;
  return {
    id: order.order_id,
    status,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    items: [
      {
        id: order.item_id,
        name: order.item_title || order.item_id,
        quantity: order.quantity,
        price: { currency: 'INR', value: unitPrice.toFixed(2) },
      },
    ],
    total,
    quote: {
      price: { currency: 'INR', value: total.toFixed(2) },
      total: { currency: 'INR', value: total.toFixed(2) },
      subtotal: { currency: 'INR', value: total.toFixed(2) },
      breakup: [],
    },
    buyer: {
      name: delivery?.name || `Customer ${order.buyer_id.replace(/[^a-z0-9]/gi, '').slice(-8).toUpperCase()}`,
      email: delivery?.email || '',
      phone: delivery?.phone || '',
      contact: {},
    },
    deliveryAddress: delivery,
    fulfillment: {
      type: 'delivery',
      status: status === 'delivered' ? 'delivered' : status === 'cancelled' ? 'cancelled' : 'pending',
      tracking: {
        status,
        statusMessage: 'Order received through the commerce exchange.',
      },
    },
    refundedAmountInr: order.refunded_amount_inr ?? 0,
    refundStatus: order.refund_status,
    paymentStatus:
      order.refund_status ||
      (order.payment?.status === 'succeeded' || order.status === 'paid'
        ? 'paid'
        : order.payment?.status),
  };
}

export async function listPublishedCatalogResponse(query?: string) {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const data = await demoFetch<{ items: DemoCommerceItem[]; count: number }>(`/api/demo-commerce/buyer/search${suffix}`);
  return {
    'bpp/providers': [
      {
        items: data.items.map((item) => mapDemoItemToCatalogItem(item)),
      },
    ],
    __source: 'api',
  } as const;
}

export async function getPublishedCatalogProduct(itemId: string) {
  const data = await demoFetch<{ item: DemoCommerceItem; inventory: number }>(`/api/demo-commerce/buyer/items/${itemId}`);
  return mapDemoItemToCatalogItem(data.item, data.inventory);
}

export async function listCommerceSellerItems() {
  const data = await demoFetch<{ items: DemoCommerceItem[]; count: number }>(
    '/api/demo-commerce/seller/items',
  );
  return data.items ?? [];
}

export async function listSellerCatalogResponse() {
  const items = await listCommerceSellerItems();
  // Archive is soft-delete: gateway still returns the row; active catalog must hide it.
  const live = items.filter((item) => String(item.status || '').toLowerCase() !== 'archived');
  return {
    'bpp/providers': [
      {
        items: live.map((item) => mapDemoItemToCatalogItem(item)),
      },
    ],
    __source: 'api',
  } as const;
}

export async function getSellerCatalogProduct(itemId: string) {
  const data = await demoFetch<{ item: DemoCommerceItem; inventory: number }>(
    `/api/demo-commerce/seller/items/${encodeURIComponent(itemId)}`,
  );
  return mapDemoItemToCatalogItem(data.item, data.inventory);
}

export async function listCommerceSellerOrders() {
  const data = await demoFetch<{ orders: DemoCommerceOrder[]; count: number }>('/api/demo-commerce/seller/orders');
  return data.orders.map(mapDemoOrderToSellerOrder);
}

export async function getCommerceOrder(orderId: string) {
  const data = await demoFetch<{ order: DemoCommerceOrder }>(`/api/demo-commerce/seller/orders/${orderId}`);
  return mapDemoOrderToSellerOrder(data.order);
}
