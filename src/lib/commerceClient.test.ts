import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getCommerceOrder,
  getSellerCatalogProduct,
  listCommerceSellerOrders,
  listSellerCatalogResponse,
  mapDemoItemToCatalogItem,
  mapDemoOrderToSellerOrder,
  paymentStatusLabel,
  type DemoCommerceOrder,
} from './commerceClient';

afterEach(() => vi.unstubAllGlobals());

describe('paymentStatusLabel', () => {
  it('uses explicit customer-facing payment labels', () => {
    expect(paymentStatusLabel('paid')).toBe('Paid');
    expect(paymentStatusLabel('pending')).toBe('Payment pending');
    expect(paymentStatusLabel(undefined)).toBe('Payment status unavailable');
  });
});

describe('mapDemoItemToCatalogItem', () => {
  it('preserves the seller-provided product image', () => {
    const mapped = mapDemoItemToCatalogItem({
      item_id: 'item-1',
      version: 1,
      status: 'published',
      seller_id: 'seller-1',
      title: 'Fresh Farm Toor Dal 1kg',
      description: 'Unpolished dal',
      price_inr: 149,
      inventory: 7,
      category_id: 'Grocery',
      image_url: '/products/toor-dal-lentils.jpg',
      image_caption: 'Ingredient photo; packaging may vary',
      delivery_areas: ['Pune', '411001'],
      created_at: '2026-07-17T00:00:00Z',
      updated_at: '2026-07-17T00:00:00Z',
    });

    expect(mapped.images).toEqual([{ url: '/products/toor-dal-lentils.jpg' }]);
    expect(mapped.imageCaption).toBe('Ingredient photo; packaging may vary');
    expect(mapped.deliveryAreas).toEqual(['Pune', '411001']);
  });
});

describe('mapDemoOrderToSellerOrder', () => {
  it('maps every gateway fulfilment vocabulary to the Seller lifecycle', () => {
    const base = {
      order_id: 'order-state',
      transaction_id: 'txn-state',
      message_id: 'msg-state',
      buyer_id: 'buyer-1',
      seller_id: 'seller-1',
      item_id: 'item-1',
      item_version: 1,
      quantity: 1,
      amount_inr: 50,
      created_at: '2026-07-23T00:00:00Z',
      updated_at: '2026-07-23T00:00:00Z',
    };

    expect(mapDemoOrderToSellerOrder({ ...base, status: 'confirmed' }).status).toBe('accepted');
    expect(mapDemoOrderToSellerOrder({ ...base, status: 'preparing' }).status).toBe('in_progress');
    expect(mapDemoOrderToSellerOrder({ ...base, status: 'shipped' }).status).toBe('shipped');
    expect(mapDemoOrderToSellerOrder({ ...base, status: 'delivered' }).status).toBe('delivered');
    expect(mapDemoOrderToSellerOrder({ ...base, status: 'payment_failed' }).status).toBe('cancelled');
  });

  it('shows the product and supplied delivery address without invented placeholders', () => {
    const mapped = mapDemoOrderToSellerOrder({
      order_id: 'order-1',
      transaction_id: 'txn-1',
      message_id: 'msg-1',
      buyer_id: 'buyer-1',
      seller_id: 'seller-1',
      item_id: 'item-1',
      item_title: 'Whole Wheat Atta 1kg',
      item_version: 1,
      quantity: 2,
      amount_inr: 178,
      status: 'paid',
      refunded_amount_inr: 50,
      refund_status: 'partially_refunded',
      payment: { status: 'succeeded' },
      delivery_address: {
        name: 'Asha Rao',
        phone: '+919876543210',
        line1: '12 Market Road',
        city: 'Pune',
        state: 'Maharashtra',
        postalCode: '411001',
        country: 'IND',
      },
      created_at: '2026-07-16T12:00:00Z',
      updated_at: '2026-07-16T12:00:00Z',
    } satisfies DemoCommerceOrder);

    expect(mapped.items[0]).toMatchObject({
      name: 'Whole Wheat Atta 1kg',
      price: { currency: 'INR', value: '89.00' },
    });
    expect(mapped.deliveryAddress).toMatchObject({
      line1: '12 Market Road',
      city: 'Pune',
      postalCode: '411001',
    });
    expect(mapped.buyer).toMatchObject({
      name: 'Asha Rao',
      email: '',
      phone: '+919876543210',
    });
    expect(mapped.refundedAmountInr).toBe(50);
    expect(mapped.refundStatus).toBe('partially_refunded');
    expect(mapped.paymentStatus).toBe('partially_refunded');
    expect(paymentStatusLabel(mapped.paymentStatus)).toBe('Partially refunded');
    expect(mapped.fulfillment?.providerName).toBeUndefined();
    expect(mapped.payment).toBeUndefined();
  });

  it('projects a succeeded full refund as a terminal cancelled and refunded order', () => {
    const mapped = mapDemoOrderToSellerOrder({
      order_id: 'order-refunded',
      transaction_id: 'txn-refunded',
      message_id: 'msg-refunded',
      buyer_id: 'buyer-1',
      seller_id: 'seller-1',
      item_id: 'item-1',
      item_title: 'Whole Wheat Atta 1kg',
      item_version: 1,
      quantity: 1,
      amount_inr: 89,
      status: 'paid',
      refunded_amount_inr: 89,
      refund_status: 'succeeded',
      payment: { status: 'succeeded' },
      created_at: '2026-07-16T12:00:00Z',
      updated_at: '2026-07-16T12:00:00Z',
    });

    expect(mapped.status).toBe('cancelled');
    expect(mapped.fulfillment?.status).toBe('cancelled');
    expect(mapped.refundedAmountInr).toBe(89);
    expect(mapped.refundStatus).toBe('refunded');
    expect(paymentStatusLabel(mapped.paymentStatus)).toBe('Refunded');
  });
});

describe('Seller commerce read boundary', () => {
  it('uses Seller-scoped catalog routes and preserves category and stock', async () => {
    const item = {
      item_id: 'item-1',
      version: 1,
      status: 'published',
      seller_id: 'seller-1',
      title: 'Whole Wheat Atta',
      description: 'Stone-ground flour',
      price_inr: 89,
      inventory: 25,
      category_id: 'Grocery',
      created_at: '2026-07-16T12:00:00Z',
      updated_at: '2026-07-16T12:00:00Z',
    };
    const archived = {
      ...item,
      item_id: 'item-archived',
      status: 'archived',
      title: 'Archived Rice',
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { items: [item, archived], count: 2 } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { item, inventory: 25 } }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const list = await listSellerCatalogResponse();
    const detail = await getSellerCatalogProduct('item-1');

    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/api\/demo-commerce\/seller\/items$/);
    expect(fetchMock.mock.calls[1]?.[0]).toMatch(/\/api\/demo-commerce\/seller\/items\/item-1$/);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ credentials: 'include' }));
    expect(list['bpp/providers'][0].items).toHaveLength(1);
    expect(list['bpp/providers'][0].items[0]).toMatchObject({ category_id: 'Grocery', quantity: 25 });
    expect(detail).toMatchObject({ category_id: 'Grocery', quantity: 25 });
  });

  it('uses Seller session-scoped list and detail routes', async () => {
    const order = {
      order_id: 'order-1', transaction_id: 'txn-1', message_id: 'msg-1', buyer_id: 'buyer-1',
      seller_id: 'seller-1', item_id: 'item-1', item_version: 1, quantity: 1, amount_inr: 50,
      status: 'paid', created_at: '2026-07-16T12:00:00Z', updated_at: '2026-07-16T12:00:00Z',
    } satisfies DemoCommerceOrder;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { orders: [], count: 0 } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { order } }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await listCommerceSellerOrders();
    await getCommerceOrder('order-1');

    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/api\/demo-commerce\/seller\/orders$/);
    expect(fetchMock.mock.calls[1]?.[0]).toMatch(/\/api\/demo-commerce\/seller\/orders\/order-1$/);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ credentials: 'include' }));
  });
});
