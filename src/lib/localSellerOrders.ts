import type { UCPOrder } from '@ondc-sdk/shared';
import type { SellerOrderNote } from '@/types/agent';

const LOCAL_ORDER_STORAGE_KEY = 'ondc-seller-demo-orders';
const LOCAL_ORDER_NOTE_STORAGE_KEY = 'ondc-seller-demo-order-notes';

const DEFAULT_ORDERS: UCPOrder[] = [
  {
    id: 'seller-demo-1001',
    status: 'created',
    createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    items: [
      {
        id: 'demo-basmati-rice',
        name: 'Basmati Rice 5kg',
        quantity: 2,
        price: { currency: 'INR', value: '640.00' },
      },
    ],
    total: 1280,
    quote: {
      price: { currency: 'INR', value: '1280.00' },
      total: { currency: 'INR', value: '1280.00' },
      subtotal: { currency: 'INR', value: '1280.00' },
      breakup: [],
    },
    buyer: {
      name: 'Priya Sharma',
      email: 'priya@example.com',
      phone: '+91-9876543210',
      contact: {
        phone: '+91-9876543210',
        email: 'priya@example.com',
      },
    },
    deliveryAddress: {
      name: 'Priya Sharma',
      phone: '+91-9876543210',
      line1: '42 MG Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560001',
      country: 'IND',
    },
    fulfillment: {
      type: 'delivery',
      status: 'pending',
      providerName: 'Local Demo Logistics',
      tracking: {
        status: 'pending',
        statusMessage: 'Waiting for seller confirmation.',
      },
    },
    payment: {
      type: 'upi',
      status: 'NOT-PAID',
      amount: { currency: 'INR', value: '1280.00' },
    },
  },
  {
    id: 'seller-demo-1002',
    status: 'accepted',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
    items: [
      {
        id: 'demo-cold-pressed-oil',
        name: 'Cold Pressed Mustard Oil 1L',
        quantity: 3,
        price: { currency: 'INR', value: '285.00' },
      },
    ],
    total: 855,
    quote: {
      price: { currency: 'INR', value: '855.00' },
      total: { currency: 'INR', value: '855.00' },
      subtotal: { currency: 'INR', value: '855.00' },
      breakup: [],
    },
    buyer: {
      name: 'Anand Rao',
      email: 'anand@example.com',
      phone: '+91-9988776655',
      contact: {
        phone: '+91-9988776655',
      },
    },
    deliveryAddress: {
      name: 'Anand Rao',
      phone: '+91-9988776655',
      line1: '18 Residency Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560025',
      country: 'IND',
    },
    fulfillment: {
      type: 'delivery',
      status: 'searching_agent',
      providerName: 'Local Demo Logistics',
      tracking: {
        status: 'searching_agent',
        statusMessage: 'Packed and awaiting dispatch.',
      },
    },
    payment: {
      type: 'upi',
      status: 'PAID',
      amount: { currency: 'INR', value: '855.00' },
    },
  },
];

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function cloneDefaultOrders(): UCPOrder[] {
  return DEFAULT_ORDERS.map((order) => ({
    ...order,
    items: order.items.map((item) => ({ ...item, price: { ...item.price } })),
    quote: order.quote ? { ...order.quote, total: { ...order.quote.total }, breakup: [...(order.quote.breakup ?? [])] } : order.quote,
    buyer: order.buyer ? { ...order.buyer, contact: order.buyer.contact ? { ...order.buyer.contact } : order.buyer.contact } : order.buyer,
    deliveryAddress: order.deliveryAddress ? { ...order.deliveryAddress } : order.deliveryAddress,
    fulfillment: order.fulfillment
      ? {
          ...order.fulfillment,
          estimatedTime: order.fulfillment.estimatedTime ? { ...order.fulfillment.estimatedTime } : order.fulfillment.estimatedTime,
          tracking: order.fulfillment.tracking ? { ...order.fulfillment.tracking } : order.fulfillment.tracking,
          agent: order.fulfillment.agent ? { ...order.fulfillment.agent } : order.fulfillment.agent,
        }
      : order.fulfillment,
    payment: order.payment ? { ...order.payment, amount: order.payment.amount ? { ...order.payment.amount } : order.payment.amount } : order.payment,
  }));
}

function readOrders(): UCPOrder[] {
  if (!canUseStorage()) {
    return cloneDefaultOrders();
  }

  const raw = window.localStorage.getItem(LOCAL_ORDER_STORAGE_KEY);
  if (!raw) {
    const defaults = cloneDefaultOrders();
    window.localStorage.setItem(LOCAL_ORDER_STORAGE_KEY, JSON.stringify(defaults));
    return defaults;
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as UCPOrder[]) : cloneDefaultOrders();
  } catch {
    return cloneDefaultOrders();
  }
}

function writeOrders(orders: UCPOrder[]) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(LOCAL_ORDER_STORAGE_KEY, JSON.stringify(orders));
}

function readNotes(): Record<string, SellerOrderNote[]> {
  if (!canUseStorage()) {
    return {};
  }

  const raw = window.localStorage.getItem(LOCAL_ORDER_NOTE_STORAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, SellerOrderNote[]>) : {};
  } catch {
    return {};
  }
}

function writeNotes(notes: Record<string, SellerOrderNote[]>) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(LOCAL_ORDER_NOTE_STORAGE_KEY, JSON.stringify(notes));
}

export function listDemoSellerOrders(): UCPOrder[] {
  return readOrders()
    .slice()
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function getDemoSellerOrder(orderId: string): UCPOrder | null {
  return readOrders().find((order) => order.id === orderId) ?? null;
}

export function listSellerOrderNotes() {
  return readNotes();
}

export function listSellerOrderNotesForOrder(orderId: string) {
  return readNotes()[orderId] ?? [];
}

export function addSellerOrderNote(orderId: string, note: string, nextStep?: string) {
  const notes = readNotes();
  const entry: SellerOrderNote = {
    id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    order_id: orderId,
    note,
    next_step: nextStep,
    created_at: new Date().toISOString(),
  };

  notes[orderId] = [entry, ...(notes[orderId] ?? [])];
  writeNotes(notes);
  return entry;
}

function updateOrder(orderId: string, mutate: (order: UCPOrder) => UCPOrder) {
  const orders = readOrders();
  const index = orders.findIndex((order) => order.id === orderId);
  if (index === -1) {
    return null;
  }

  const updated = mutate(orders[index]);
  orders[index] = updated;
  writeOrders(orders);
  return updated;
}

export function acceptDemoSellerOrder(orderId: string) {
  return updateOrder(orderId, (order) => ({
    ...order,
    status: 'accepted',
    updatedAt: new Date().toISOString(),
    fulfillment: order.fulfillment
      ? {
          ...order.fulfillment,
          status: 'searching_agent',
          tracking: {
            ...order.fulfillment.tracking,
            status: 'searching_agent',
            statusMessage: 'Seller accepted the order and started packing.',
          },
        }
      : order.fulfillment,
  }));
}

export function rejectDemoSellerOrder(orderId: string, reason: string) {
  return updateOrder(orderId, (order) => ({
    ...order,
    status: 'cancelled',
    updatedAt: new Date().toISOString(),
    cancellation: {
      cancelledAt: new Date().toISOString(),
      cancelledBy: 'seller',
      reason,
    },
    fulfillment: order.fulfillment
      ? {
          ...order.fulfillment,
          status: 'cancelled',
          tracking: {
            ...order.fulfillment.tracking,
            status: 'cancelled',
            statusMessage: reason,
          },
        }
      : order.fulfillment,
  }));
}

export function dispatchDemoSellerOrder(orderId: string, trackingId: string) {
  return updateOrder(orderId, (order) => ({
    ...order,
    status: 'shipped',
    updatedAt: new Date().toISOString(),
    fulfillment: order.fulfillment
      ? {
          ...order.fulfillment,
          status: 'in_transit',
          tracking: {
            ...order.fulfillment.tracking,
            id: trackingId,
            status: 'in_transit',
            statusMessage: 'Shipment dispatched through the local demo courier network.',
          },
        }
      : order.fulfillment,
  }));
}
