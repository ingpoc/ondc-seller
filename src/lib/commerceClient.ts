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
  item_version: number;
  quantity: number;
  amount_inr: number;
  status: string;
  payment?: {
    status?: string;
    amount_inr?: number;
    reference_id?: string;
  };
  created_at: string;
  updated_at: string;
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

function makeIdempotencyKey(scope: string, id: string) {
  return `${scope}:${id}:${Date.now()}`;
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
    images: [],
    category: {
      name: 'Grocery',
    },
    category_id: 'Grocery',
    quantity: inventory,
  } as BecknItem;
}

export function mapDemoOrderToSellerOrder(order: DemoCommerceOrder): UCPOrder {
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
  return {
    id: order.order_id,
    status,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    items: [
      {
        id: order.item_id,
        name: order.item_id,
        quantity: order.quantity,
        price: { currency: 'INR', value: total.toFixed(2) },
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
      name: order.buyer_id,
      email: '',
      phone: '',
      contact: {},
    },
    deliveryAddress: {
      name: order.buyer_id,
      phone: '',
      line1: 'Simulated ONDC delivery',
      city: 'Demo city',
      state: 'Demo state',
      postalCode: '000000',
      country: 'IND',
    },
    fulfillment: {
      type: 'delivery',
      status: status === 'delivered' ? 'delivered' : status === 'cancelled' ? 'cancelled' : 'pending',
      providerName: 'Simulated ONDC logistics',
      tracking: {
        status,
        statusMessage: `Commerce order ${order.transaction_id}`,
      },
    },
    payment: {
      type: 'upi',
      status: order.payment?.status === 'succeeded' || order.status === 'paid' ? 'PAID' : 'NOT-PAID',
      amount: { currency: 'INR', value: total.toFixed(2) },
      transactionId: order.transaction_id,
    },
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

export async function createAndPublishSellerItem(input: {
  id: string;
  name: string;
  description: string;
  price: string;
  inventory?: number;
  sellerId?: string | null;
}) {
  const priceInr = Math.round(Number(input.price || 0));
  const inventory = Math.max(0, Math.round(Number(input.inventory ?? 10)));
  const idempotencyKey = makeIdempotencyKey('seller-item', input.id);
  const created = await demoFetch<{ item: DemoCommerceItem; inventory: number }>('/api/demo-commerce/seller/items', {
    method: 'POST',
    headers: { 'Idempotency-Key': `${idempotencyKey}:create` },
    body: JSON.stringify({
      idempotency_key: `${idempotencyKey}:create`,
      title: input.name,
      description: input.description,
      price_inr: priceInr,
      inventory,
      seller_id: input.sellerId || 'demo-seller',
    }),
  });
  const published = await demoFetch<{ item: DemoCommerceItem; inventory: number }>(
    `/api/demo-commerce/seller/items/${created.item.item_id}/publish`,
    {
      method: 'POST',
      headers: { 'Idempotency-Key': `${idempotencyKey}:publish` },
      body: JSON.stringify({ idempotency_key: `${idempotencyKey}:publish` }),
    },
  );
  const item = mapDemoItemToCatalogItem(published.item, published.inventory);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('seller-catalog-changed', { detail: { itemId: item.id } }));
  }
  return item;
}

export async function listCommerceSellerOrders(sellerId?: string) {
  const params = new URLSearchParams();
  if (sellerId) params.set('seller_id', sellerId);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const data = await demoFetch<{ orders: DemoCommerceOrder[]; count: number }>(`/api/demo-commerce/seller/orders${suffix}`);
  return data.orders.map(mapDemoOrderToSellerOrder);
}

export async function getCommerceOrder(orderId: string) {
  const data = await demoFetch<{ order: DemoCommerceOrder }>(`/api/demo-commerce/buyer/orders/${orderId}`);
  return mapDemoOrderToSellerOrder(data.order);
}

export async function transitionCommerceSellerOrder(orderId: string, status: 'accepted' | 'rejected') {
  const idempotencyKey = makeIdempotencyKey(`seller-order-${status}`, orderId);
  const data = await demoFetch<{ order: DemoCommerceOrder }>(`/api/demo-commerce/seller/orders/${orderId}/transition`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ idempotency_key: idempotencyKey, status }),
  });
  return mapDemoOrderToSellerOrder(data.order);
}
