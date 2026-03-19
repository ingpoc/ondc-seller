import { beforeEach, describe, expect, it } from 'vitest';
import {
  acceptDemoSellerOrder,
  dispatchDemoSellerOrder,
  getDemoSellerOrder,
  listDemoSellerOrders,
  rejectDemoSellerOrder,
} from './localSellerOrders';

describe('localSellerOrders', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('seeds demo seller orders for local agent-first flows', () => {
    const orders = listDemoSellerOrders();
    expect(orders.length).toBeGreaterThan(0);
    expect(orders[0]?.id).toContain('seller-demo');
  });

  it('updates demo order status transitions locally', () => {
    const pendingOrder = listDemoSellerOrders().find((order) => order.status === 'created');
    expect(pendingOrder).toBeDefined();

    const accepted = acceptDemoSellerOrder(pendingOrder!.id);
    expect(accepted?.status).toBe('accepted');

    const dispatched = dispatchDemoSellerOrder(pendingOrder!.id, 'TRACK-1001');
    expect(dispatched?.status).toBe('shipped');
    expect(dispatched?.fulfillment?.tracking?.id).toBe('TRACK-1001');

    const rejected = rejectDemoSellerOrder('seller-demo-1002', 'Inventory mismatch');
    expect(rejected?.status).toBe('cancelled');
    expect(getDemoSellerOrder('seller-demo-1002')?.cancellation?.reason).toBe('Inventory mismatch');
  });
});
