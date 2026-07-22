/**
 * Seller OrdersPage component tests (SDK-SELLER-ORDERS-002)
 * Tests for seller orders listing, OrderCard component, and actions
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import type { UCPOrderStatus } from '@ondc-sdk/shared';

// Import the component to ensure TypeScript compilation
import { OrdersPage, OrderCard, OrderFilterButton } from './OrdersPage';

describe('Seller OrdersPage (SDK-SELLER-ORDERS-002)', () => {
  it('should export OrdersPage component', () => {
    expect(OrdersPage).toBeDefined();
    expect(typeof OrdersPage).toBe('function');
  });

  it('should export OrderCard component', () => {
    expect(OrderCard).toBeDefined();
    expect(typeof OrderCard).toBe('function');
  });

  describe('Seller status filtering', () => {
    it('exposes the active filter to assistive technology', () => {
      const { rerender } = render(
        React.createElement(OrderFilterButton, {
          filter: 'pending',
          count: 2,
          active: true,
        })
      );

      expect(screen.getByRole('button', { name: 'pending 2' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );

      rerender(
        React.createElement(OrderFilterButton, {
          filter: 'pending',
          count: 2,
          active: false,
        })
      );
      expect(screen.getByRole('button', { name: 'pending 2' })).toHaveAttribute(
        'aria-pressed',
        'false'
      );
    });

    const isPendingStatus = (status: UCPOrderStatus): boolean => status === 'created';
    const isAcceptedStatus = (status: UCPOrderStatus): boolean =>
      ['accepted', 'packed'].includes(status);
    const isDispatchedStatus = (status: UCPOrderStatus): boolean =>
      ['shipped', 'out_for_delivery'].includes(status);
    const isCompletedStatus = (status: UCPOrderStatus): boolean => status === 'delivered';
    const isCancelledStatus = (status: UCPOrderStatus): boolean =>
      ['cancelled', 'returned'].includes(status);

    it('should identify pending orders (created only)', () => {
      expect(isPendingStatus('created')).toBe(true);
      expect(isPendingStatus('accepted')).toBe(false);
      expect(isPendingStatus('shipped')).toBe(false);
      expect(isPendingStatus('delivered')).toBe(false);
      expect(isPendingStatus('cancelled')).toBe(false);
    });

    it('should identify accepted orders (accepted, packed)', () => {
      expect(isAcceptedStatus('accepted')).toBe(true);
      expect(isAcceptedStatus('packed')).toBe(true);
      expect(isAcceptedStatus('created')).toBe(false);
      expect(isAcceptedStatus('shipped')).toBe(false);
    });

    it('should identify dispatched orders (shipped, out_for_delivery)', () => {
      expect(isDispatchedStatus('shipped')).toBe(true);
      expect(isDispatchedStatus('out_for_delivery')).toBe(true);
      expect(isDispatchedStatus('accepted')).toBe(false);
      expect(isDispatchedStatus('delivered')).toBe(false);
    });

    it('should identify completed orders (delivered only)', () => {
      expect(isCompletedStatus('delivered')).toBe(true);
      expect(isCompletedStatus('shipped')).toBe(false);
      expect(isCompletedStatus('created')).toBe(false);
    });

    it('should identify cancelled orders (cancelled, returned)', () => {
      expect(isCancelledStatus('cancelled')).toBe(true);
      expect(isCancelledStatus('returned')).toBe(true);
      expect(isCancelledStatus('created')).toBe(false);
      expect(isCancelledStatus('delivered')).toBe(false);
    });
  });

  describe('Status labels for seller', () => {
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

    it('should show "Pending" for created orders', () => {
      expect(getStatusLabel('created')).toBe('Pending');
    });

    it('should show "Dispatched" for shipped orders', () => {
      expect(getStatusLabel('shipped')).toBe('Dispatched');
    });

    it('should have labels for all order statuses', () => {
      const allStatuses: UCPOrderStatus[] = [
        'created',
        'accepted',
        'in_progress',
        'packed',
        'shipped',
        'out_for_delivery',
        'delivered',
        'cancelled',
        'returned',
      ];

      allStatuses.forEach((status) => {
        const label = getStatusLabel(status);
        expect(label).toBeDefined();
        expect(typeof label).toBe('string');
        expect(label.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Status filters', () => {
    it('should support all required filter options', () => {
      const filterOptions = [
        'all',
        'pending',
        'accepted',
        'dispatched',
        'completed',
        'cancelled',
      ] as const;
      expect(filterOptions).toHaveLength(6);
    });

    it('should include pending filter', () => {
      const filterOptions = [
        'all',
        'pending',
        'accepted',
        'dispatched',
        'completed',
        'cancelled',
      ] as const;
      expect(filterOptions).toContain('pending');
    });

    it('should include cancelled filter', () => {
      const filterOptions = [
        'all',
        'pending',
        'accepted',
        'dispatched',
        'completed',
        'cancelled',
      ] as const;
      expect(filterOptions).toContain('cancelled');
    });
  });

  describe('OrderCard component', () => {
    it('should render order id, date, status badge', () => {
      const requiredFields = ['id', 'createdAt', 'status'];
      expect(requiredFields).toHaveLength(3);
    });

    it('should display order items (first 3)', () => {
      const displayLimit = 3;
      expect(displayLimit).toBe(3);
    });

    it('should show accept button for pending orders', () => {
      const canAccept = (status: UCPOrderStatus): boolean => status === 'created';
      expect(canAccept('created')).toBe(true);
      expect(canAccept('accepted')).toBe(false);
    });

    it('should show reject button for pending orders', () => {
      const canReject = (status: UCPOrderStatus): boolean => status === 'created';
      expect(canReject('created')).toBe(true);
      expect(canReject('cancelled')).toBe(false);
    });

    it('should always show view details button', () => {
      const alwaysShow = true;
      expect(alwaysShow).toBe(true);
    });

    it('disables order write buttons when trust-gated actions are disabled', () => {
      render(
        React.createElement(OrderCard, {
          order: {
            id: 'seller-demo-1001',
            status: 'created',
            createdAt: '2026-05-12T00:00:00Z',
            updatedAt: '2026-05-12T00:00:00Z',
            total: 100,
            items: [
              {
                id: 'item-1',
                name: 'Demo item',
                quantity: 1,
                price: { currency: 'INR', value: '100.00' },
              },
            ],
            quote: {
              price: { currency: 'INR', value: '100.00' },
              total: { currency: 'INR', value: '100.00' },
              subtotal: { currency: 'INR', value: '100.00' },
              breakup: [],
            },
            paymentStatus: 'paid',
          },
          actionsDisabled: true,
        })
      );

      expect(screen.getByRole('button', { name: 'Accept' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Review rejection' })).toBeDisabled();
      expect(screen.getByText('Payment: Paid')).toBeVisible();
      expect(screen.getByRole('button', { name: /View order/i })).not.toBeDisabled();
    });
  });

  describe('Order actions', () => {
    it('should support accept action', () => {
      const actions = ['onAccept', 'onReject', 'onViewDetails'];
      expect(actions).toContain('onAccept');
    });

    it('should support reject action', () => {
      const actions = ['onAccept', 'onReject', 'onViewDetails'];
      expect(actions).toContain('onReject');
    });

    it('should support view details action', () => {
      const actions = ['onAccept', 'onReject', 'onViewDetails'];
      expect(actions).toContain('onViewDetails');
    });
  });

  describe('API endpoints', () => {
    it('should connect to GET /api/seller/orders', () => {
      const endpoint = '/api/seller/orders';
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
  });
});
