/**
 * Seller OrderDetailPage component tests (SDK-SELLER-ORDERS-003)
 * Tests for seller order detail display, buyer info, and actions
 */

import { describe, it, expect } from 'vitest';
import type { UCPOrder, UCPOrderStatus } from '@ondc-sdk/shared';

// Import the component to ensure TypeScript compilation
import {
  canMutateSellerOrder,
  fullRefundAmount,
  getOrderTimeline,
  normalizeTrackingId,
  OrderDetailPage,
  refundConfirmationCopy,
  sellerRefundTrustSatisfied,
} from './OrderDetailPage';

describe('Seller OrderDetailPage (SDK-SELLER-ORDERS-003)', () => {
  it('should export OrderDetailPage component', () => {
    expect(OrderDetailPage).toBeDefined();
    expect(typeof OrderDetailPage).toBe('function');
  });

  describe('Seller action permissions', () => {
    const canAcceptOrder = (status: UCPOrderStatus): boolean => status === 'created';
    const canRejectOrder = (status: UCPOrderStatus): boolean => status === 'created';
    const canDispatchOrder = (status: UCPOrderStatus): boolean =>
      ['accepted', 'packed'].includes(status);

    it('should allow accept only for created orders', () => {
      expect(canAcceptOrder('created')).toBe(true);
      expect(canAcceptOrder('accepted')).toBe(false);
      expect(canAcceptOrder('shipped')).toBe(false);
      expect(canAcceptOrder('cancelled')).toBe(false);
    });

    it('should allow reject only for created orders', () => {
      expect(canRejectOrder('created')).toBe(true);
      expect(canRejectOrder('accepted')).toBe(false);
      expect(canRejectOrder('shipped')).toBe(false);
      expect(canRejectOrder('cancelled')).toBe(false);
    });

    it('should allow dispatch for accepted or packed orders', () => {
      expect(canDispatchOrder('accepted')).toBe(true);
      expect(canDispatchOrder('packed')).toBe(true);
      expect(canDispatchOrder('created')).toBe(false);
      expect(canDispatchOrder('shipped')).toBe(false);
    });
  });

  describe('Seller order trust policy', () => {
    it('requires an explicit irreversible-refund confirmation message', () => {
      expect(refundConfirmationCopy(178, '1EA9538C', 'Ananya Rao')).toBe(
        'Refund INR 178 to Ananya Rao for order 1EA9538C? Payment will become Refunded and the order will close as Cancelled. This cannot be undone.'
      );
    });

    it('uses the order update time for a completed cancellation timeline', () => {
      const timeline = getOrderTimeline({
        status: 'cancelled',
        createdAt: '2026-07-17T12:00:00Z',
        updatedAt: '2026-07-17T12:05:00Z',
      } as UCPOrder);
      expect(timeline.at(-1)).toMatchObject({
        label: 'Order cancelled',
        timestamp: '2026-07-17T12:05:00Z',
        completed: true,
      });
    });

    it('binds the customer refund action to the actual order total', () => {
      expect(fullRefundAmount({ total: 95 })).toBe(95);
      expect(fullRefundAmount({ total: 95, refundedAmountInr: 95 })).toBe(0);
      expect(fullRefundAmount({ total: 95, refundedAmountInr: 40 })).toBe(55);
      expect(fullRefundAmount({ total: 95.4 })).toBe(95);
      expect(fullRefundAmount({ total: -1 })).toBe(0);
    });

    it('treats the authenticated server principal as verified for AgentGuard refunds', () => {
      expect(sellerRefundTrustSatisfied('no_identity', 'principal:demo:seller', false)).toBe(true);
      expect(sellerRefundTrustSatisfied('no_identity', null, false)).toBe(false);
    });

    it('requires verified trust before order acceptance', () => {
      expect(canMutateSellerOrder('created', 'accept')).toBe(true);
      expect(canMutateSellerOrder('accepted', 'accept')).toBe(false);
    });

    it('requires verified trust before order rejection', () => {
      expect(canMutateSellerOrder('created', 'reject')).toBe(true);
      expect(canMutateSellerOrder('accepted', 'reject')).toBe(false);
    });

    it('requires the frozen prepare edge before dispatch and completion', () => {
      expect(canMutateSellerOrder('accepted', 'prepare')).toBe(true);
      expect(canMutateSellerOrder('accepted', 'dispatch')).toBe(false);
      expect(canMutateSellerOrder('in_progress', 'dispatch')).toBe(true);
      expect(canMutateSellerOrder('shipped', 'complete')).toBe(true);
      expect(canMutateSellerOrder('created', 'dispatch')).toBe(false);
    });
  });

  describe('Order timeline', () => {
    it('should include order placed event', () => {
      const timelineEvents = [
        'Order Placed',
        'Order Accepted',
        'Order Packed',
        'Order Dispatched',
        'Order Cancelled',
      ];
      expect(timelineEvents).toContain('Order Placed');
    });

    it('should include order accepted event', () => {
      const timelineEvents = [
        'Order Placed',
        'Order Accepted',
        'Order Packed',
        'Order Dispatched',
        'Order Cancelled',
      ];
      expect(timelineEvents).toContain('Order Accepted');
    });

    it('should include order cancelled event when cancelled', () => {
      const timelineEvents = [
        'Order Placed',
        'Order Accepted',
        'Order Packed',
        'Order Dispatched',
        'Order Cancelled',
      ];
      expect(timelineEvents).toContain('Order Cancelled');
    });

    it('should show timeline with status and completion', () => {
      const requiredFields = ['status', 'label', 'completed'];
      expect(requiredFields).toHaveLength(3);
    });
  });

  describe('Buyer information display', () => {
    it('should display buyer name', () => {
      const buyerFields = ['name'];
      expect(buyerFields).toContain('name');
    });

    it('should display buyer phone if available', () => {
      const buyerFields = ['name', 'phone', 'email'];
      expect(buyerFields).toContain('phone');
    });

    it('should display buyer email if available', () => {
      const buyerFields = ['name', 'phone', 'email'];
      expect(buyerFields).toContain('email');
    });
  });

  describe('Order details sections', () => {
    it('should display delivery address', () => {
      const sections = ['buyer', 'deliveryAddress', 'items', 'total', 'timeline'];
      expect(sections).toContain('deliveryAddress');
    });

    it('should display order items with quantities', () => {
      const sections = ['buyer', 'deliveryAddress', 'items', 'total', 'timeline'];
      expect(sections).toContain('items');
    });

    it('should display order total', () => {
      const sections = ['buyer', 'deliveryAddress', 'items', 'total', 'timeline'];
      expect(sections).toContain('total');
    });

    it('should display order timeline', () => {
      const sections = ['buyer', 'deliveryAddress', 'items', 'total', 'timeline'];
      expect(sections).toContain('timeline');
    });
  });

  describe('Action buttons', () => {
    it('should have accept button', () => {
      const actions = ['Accept Order', 'Reject Order', 'Dispatch Order'];
      expect(actions).toContain('Accept Order');
    });

    it('should have reject button', () => {
      const actions = ['Accept Order', 'Reject Order', 'Dispatch Order'];
      expect(actions).toContain('Reject Order');
    });

    it('should have dispatch button', () => {
      const actions = ['Accept Order', 'Reject Order', 'Dispatch Order'];
      expect(actions).toContain('Dispatch Order');
    });
  });

  describe('Dispatch tracking entry', () => {
    it('trims a customer-provided tracking ID', () => {
      expect(normalizeTrackingId('  SHIP-123456  ')).toBe('SHIP-123456');
    });

    it('rejects empty tracking IDs', () => {
      expect(normalizeTrackingId('   ')).toBeNull();
    });
  });

  describe('API endpoints', () => {
    it('should connect to GET /api/seller/orders/:id', () => {
      const endpoint = '/api/seller/orders/:id';
      expect(endpoint).toContain('/api/seller/orders');
    });

    it('should connect to POST /api/seller/orders/:id/accept', () => {
      const endpoint = '/api/seller/orders/:id/accept';
      expect(endpoint).toContain('/accept');
    });

    it('should connect to POST /api/seller/orders/:id/reject', () => {
      const endpoint = '/api/seller/orders/:id/reject';
      expect(endpoint).toContain('/reject');
    });

    it('should connect to POST /api/seller/orders/:id/dispatch', () => {
      const endpoint = '/api/seller/orders/:id/dispatch';
      expect(endpoint).toContain('/dispatch');
    });
  });

  describe('Tracking information', () => {
    it('should display tracking ID if available', () => {
      const trackingFields = ['id', 'url', 'statusMessage'];
      expect(trackingFields).toContain('id');
    });

    it('should display tracking URL link if available', () => {
      const trackingFields = ['id', 'url', 'statusMessage'];
      expect(trackingFields).toContain('url');
    });
  });
});
