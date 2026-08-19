import type { UCPOrder, UCPOrderStatus } from '@ondc-sdk/shared';
import type { BecknItem } from '../types';
import { customerReference } from './displayText';
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
  display_id?: string;
  transaction_id: string;
  message_id: string;
  buyer_id?: string;
  seller_id: string;
  item_id: string;
  item_title?: string;
  item_version: number;
  quantity: number;
  amount_inr: number;
  status: string;
  version?: number;
  fulfilment?: {
    status?: string;
    tracking_id?: string;
    tracking_url?: string;
    provider_name?: string;
    status_message?: string;
    history?: Array<{
      status: string;
      recorded_at: string;
      tracking_id?: string;
      status_message?: string;
    }>;
  };
  refunded_amount_inr?: number;
  refund_status?: string;
  refund_authorization?: {
    receipt_id: string;
    outcome?: string;
    amount_inr?: number;
    recorded_at?: string;
  };
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
  displayId?: string;
  transactionId?: string;
  refundedAmountInr?: number;
  refundStatus?: string;
  paymentStatus?: string;
  refundAuthorization?: {
    receiptId: string;
    outcome: string;
    amountInr: number;
    recordedAt?: string;
  };
};

/** Same-origin seller order contract expected from the gateway. */
export const SELLER_ORDERS_LIST_PATH = '/api/demo-commerce/seller/orders';

export function sellerOrderDetailPath(orderId: string): string {
  return `${SELLER_ORDERS_LIST_PATH}/${encodeURIComponent(String(orderId || '').trim())}`;
}

export function compactOrderLookup(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/-/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase();
}

export function orderMatchesSellerLookup(
  order: Pick<SellerCommerceOrder, 'id'> & {
    displayId?: string;
    transactionId?: string;
  },
  raw: string,
): boolean {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return false;
  const compact = customerReference(trimmed);
  const hex = compactOrderLookup(trimmed);
  return [order.id, order.displayId, order.transactionId].some((candidate) => {
    const value = String(candidate || '');
    if (!value) return false;
    return (
      value === trimmed ||
      customerReference(value) === compact ||
      compactOrderLookup(value) === hex
    );
  });
}

export function sellerOrdersFromPayload(data: unknown): DemoCommerceOrder[] {
  if (Array.isArray(data)) return data as DemoCommerceOrder[];
  if (!data || typeof data !== 'object') return [];
  const record = data as { orders?: unknown; order?: unknown };
  if (Array.isArray(record.orders)) return record.orders as DemoCommerceOrder[];
  if (record.order && typeof record.order === 'object') {
    return [record.order as DemoCommerceOrder];
  }
  return [];
}

export interface SellerCommerceIssue {
  issue_id: string;
  order_id: string;
  status: string;
  version: number;
  reason: string;
  description: string;
  response?: string;
  remedy?: {
    type?: string;
    amount_inr?: number;
    message?: string;
  };
  created_at: string;
  updated_at: string;
}

export interface SellerStore {
  store_id?: string;
  store_name: string;
  city: string;
  state: string;
  pin: string;
  serviceability?: string;
  serviceability_tokens: string[];
  fulfilment_sla_hours: number | null;
  return_window_days: number | null;
  support_hours: string;
  status: string;
}

export interface SellerStoreWrite {
  store_name: string;
  city: string;
  state: string;
  pin: string;
  serviceability: string;
  fulfilment_sla_hours: number | null;
  return_window_days: number | null;
  support_hours: string;
  complete?: boolean;
}

export interface SellerStoreSnapshot {
  store: SellerStore | null;
  setup_required: boolean;
}

export class CommerceClientError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'CommerceClientError';
    this.status = status;
  }
}

export function commerceErrorStatus(error: unknown): number {
  if (error instanceof CommerceClientError) return error.status;
  if (typeof error === 'object' && error && 'status' in error) {
    return Number((error as { status?: number }).status);
  }
  return NaN;
}

export function commerceErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? '');
}

export function isCommerceAuthError(error: unknown): boolean {
  const status = commerceErrorStatus(error);
  return status === 401 || status === 403;
}

export function isCommerceServerError(error: unknown): boolean {
  const status = commerceErrorStatus(error);
  return status >= 500 && status < 600;
}

export function isSellerStoreMissingMessage(message: string | null | undefined): boolean {
  const text = String(message ?? '').trim();
  if (!text) return false;
  return /\b404\b|not found|store setup unavailable|setup unavailable/i.test(text);
}

export function isCommerceNotFound(error: unknown): boolean {
  if (commerceErrorStatus(error) === 404) return true;
  return isSellerStoreMissingMessage(commerceErrorMessage(error));
}

/** Missing store row / first-time setup — not a fatal auth or server failure. */
export function isSellerStoreMissing(error: unknown): boolean {
  if (isCommerceAuthError(error) || isCommerceServerError(error)) return false;
  if (isCommerceNotFound(error)) return true;
  return isSellerStoreMissingMessage(commerceErrorMessage(error));
}

/** Null means first-time setup (404 / no store row) — keep the form, do not block. */
export function sellerStoreSaveErrorMessage(error: unknown): string | null {
  if (isCommerceAuthError(error)) return 'Sign in again to save store setup.';
  if (isCommerceServerError(error)) return 'The store service failed. Try again in a moment.';
  if (isSellerStoreMissing(error)) return null;
  const message = commerceErrorMessage(error).trim();
  return message || 'Could not save store setup.';
}

export function isSellerStoreReady(store: SellerStore | null | undefined): boolean {
  return (store?.status || '').trim().toLowerCase() === 'ready';
}

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
    throw new CommerceClientError(
      body.detail || body.message || `Commerce request failed (${response.status})`,
      response.status,
    );
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
  const refundStatus = String(order.refund_status || '').trim().toLowerCase();
  const fullyRefunded =
    (refundStatus === 'succeeded' || refundStatus === 'refunded') &&
    Number(order.refunded_amount_inr || 0) >= Number(order.amount_inr || 0);
  const statusByCommerceStatus: Record<string, UCPOrderStatus> = {
    prepared: 'created',
    payment_pending: 'created',
    payment_unknown: 'created',
    paid: 'created',
    confirmed: 'accepted',
    accepted: 'accepted',
    preparing: 'in_progress',
    shipped: 'shipped',
    fulfilled: 'delivered',
    delivered: 'delivered',
    closed: 'delivered',
    payment_failed: 'cancelled',
    rejected: 'cancelled',
    cancelled: 'cancelled',
    unknown: 'created',
  };
  const commerceStatus = String(order.status || '').trim().toLowerCase();
  const status = fullyRefunded
    ? 'cancelled'
    : statusByCommerceStatus[commerceStatus] ?? 'created';
  const total = Number(order.amount_inr) || 0;
  const quantity = Math.max(Number(order.quantity) || 0, 1);
  const unitPrice = total / quantity;
  const delivery = order.delivery_address;
  const buyerId = String(order.buyer_id || '');
  const buyerFallback = buyerId
    ? `Customer ${buyerId.replace(/[^a-z0-9]/gi, '').slice(-8).toUpperCase() || 'PENDING'}`
    : 'Unknown buyer';
  const refundOutcome = String(order.refund_authorization?.outcome || '').trim();
  return {
    id: order.order_id,
    displayId: order.display_id || customerReference(order.order_id),
    transactionId: order.transaction_id || order.order_id,
    status,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    items: [
      {
        id: order.item_id,
        name: order.item_title || order.item_id,
        quantity: Number(order.quantity) || 0,
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
      name: delivery?.name || buyerFallback,
      email: delivery?.email || '',
      phone: delivery?.phone || '',
      contact: {},
    },
    deliveryAddress: delivery,
    fulfillment: {
      type: 'delivery',
      providerName: order.fulfilment?.provider_name,
      status:
        status === 'delivered'
          ? 'delivered'
          : status === 'cancelled'
            ? 'cancelled'
            : status === 'shipped'
              ? 'in_transit'
              : status === 'in_progress'
                ? 'pending'
                : 'pending',
      tracking: {
        id: order.fulfilment?.tracking_id,
        url: order.fulfilment?.tracking_url?.startsWith('https://')
          ? order.fulfilment.tracking_url
          : undefined,
        status: order.fulfilment?.status || status,
        statusMessage:
          order.fulfilment?.status_message || 'Order received through the commerce exchange.',
      },
      history: order.fulfilment?.history?.map((event) => ({
        status: event.status,
        recordedAt: event.recorded_at,
        trackingId: event.tracking_id,
        statusMessage: event.status_message,
      })),
    },
    refundedAmountInr: order.refunded_amount_inr ?? 0,
    refundStatus: fullyRefunded ? 'refunded' : order.refund_status,
    refundAuthorization: order.refund_authorization
      ? {
          receiptId: order.refund_authorization.receipt_id,
          outcome: refundOutcome,
          amountInr: Number(order.refund_authorization.amount_inr || 0),
          recordedAt: order.refund_authorization.recorded_at,
        }
      : undefined,
    paymentStatus:
      (fullyRefunded ? 'refunded' : order.refund_status) ||
      (order.payment?.status === 'succeeded' || commerceStatus === 'paid'
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
  try {
    const data = await demoFetch<{ items: DemoCommerceItem[]; count: number }>(
      '/api/demo-commerce/seller/items',
    );
    return data.items ?? [];
  } catch (error) {
    if (isSellerStoreMissing(error)) return [];
    throw error;
  }
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
  const data = await demoFetch<{ orders?: DemoCommerceOrder[]; count?: number } | DemoCommerceOrder[]>(
    SELLER_ORDERS_LIST_PATH,
  );
  return sellerOrdersFromPayload(data).map(mapDemoOrderToSellerOrder);
}

export async function getCommerceOrder(orderId: string) {
  const data = await demoFetch<{ order: DemoCommerceOrder }>(sellerOrderDetailPath(orderId));
  return mapDemoOrderToSellerOrder(data.order);
}

export async function loadSellerOrderByLookup(raw: string): Promise<SellerCommerceOrder | null> {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  try {
    const order = await getCommerceOrder(trimmed);
    if (order?.id) return order;
  } catch (error) {
    if (!isCommerceNotFound(error)) throw error;
  }
  const orders = await listCommerceSellerOrders();
  return orders.find((order) => orderMatchesSellerLookup(order, trimmed)) ?? null;
}

export async function resolveSellerOrderId(raw: string): Promise<string | null> {
  const order = await loadSellerOrderByLookup(raw);
  return order?.id ?? null;
}

export async function getSellerStore(): Promise<SellerStoreSnapshot> {
  try {
    const data = await demoFetch<SellerStoreSnapshot>('/api/demo-commerce/seller/store');
    const store = data?.store ?? null;
    return {
      store,
      setup_required: Boolean(data?.setup_required) || !isSellerStoreReady(store),
    };
  } catch (error) {
    if (isSellerStoreMissing(error)) {
      return { store: null, setup_required: true };
    }
    throw error;
  }
}

export async function saveSellerStore(input: SellerStoreWrite): Promise<SellerStoreSnapshot> {
  const data = await demoFetch<SellerStoreSnapshot>('/api/demo-commerce/seller/store', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  const store = data?.store ?? null;
  return {
    store,
    setup_required: Boolean(data?.setup_required) || !isSellerStoreReady(store),
  };
}

export async function listCommerceSellerIssues(orderId?: string) {
  const data = await demoFetch<{ issues: SellerCommerceIssue[]; count: number }>(
    '/api/demo-commerce/seller/issues',
  );
  return orderId
    ? data.issues.filter((issue) => issue.order_id === orderId)
    : data.issues;
}
