import { describe, expect, it } from 'vitest';
import {
  evaluateProtectedSellerRequest,
  inferProtectedSellerAction,
} from './sellerApiRuntime.js';

const verifiedSession = {
  valid: true,
  subject_id: 'seller-subject',
  wallet_address: 'seller-wallet',
};

const verifiedTrust = {
  wallet_address: 'seller-wallet',
  trust_state: 'verified',
  high_trust_eligible: true,
};

const protectedHeaders = {
  'x-seller-protected-action': 'order_accept',
  'x-seller-required-trust-state': 'verified',
  'x-wallet-address': 'seller-wallet',
  'x-user-id': 'seller-subject',
  'x-seller-audit-subject': 'order-1',
  'x-seller-trust-enforcement': 'backend_must_revalidate_trust',
};

describe('sellerApiRuntime', () => {
  it('classifies protected seller API mutations', () => {
    expect(inferProtectedSellerAction('POST', '/api/catalog/products')).toEqual({
      action: 'catalog_save',
      auditSubjectFrom: 'body_id',
    });
    expect(inferProtectedSellerAction('DELETE', '/api/catalog/products/item-1')).toEqual({
      action: 'catalog_delete',
      auditSubject: 'item-1',
    });
    expect(inferProtectedSellerAction('POST', '/api/seller/orders/order-1/accept')).toEqual({
      action: 'order_accept',
      auditSubject: 'order-1',
    });
    expect(inferProtectedSellerAction('GET', '/api/seller/orders/order-1')).toBeNull();
  });

  it('allows protected seller mutations only after server-side session and trust validation', () => {
    expect(
      evaluateProtectedSellerRequest({
        routePolicy: inferProtectedSellerAction('POST', '/api/seller/orders/order-1/accept'),
        headers: protectedHeaders,
        body: {},
        session: verifiedSession,
        trust: verifiedTrust,
      }),
    ).toMatchObject({
      allowed: true,
      status: 200,
      audit: {
        action: 'order_accept',
        wallet_address: 'seller-wallet',
        subject_id: 'seller-subject',
        audit_subject_id: 'order-1',
        trust_state: 'verified',
      },
    });
  });

  it('rejects missing or mismatched backend trust-policy headers', () => {
    expect(
      evaluateProtectedSellerRequest({
        routePolicy: inferProtectedSellerAction('POST', '/api/seller/orders/order-1/accept'),
        headers: {
          ...protectedHeaders,
          'x-seller-protected-action': 'order_reject',
        },
        body: {},
        session: verifiedSession,
        trust: verifiedTrust,
      }),
    ).toMatchObject({
      allowed: false,
      status: 403,
      reason: 'Seller protected action header does not match route.',
      audit: {
        action: 'order_accept',
        audit_subject_id: 'order-1',
        outcome: 'blocked',
      },
    });
  });

  it('rejects invalid sessions, wallet mismatches, unavailable trust, and unverified trust', () => {
    const routePolicy = inferProtectedSellerAction('POST', '/api/seller/orders/order-1/accept');

    expect(
      evaluateProtectedSellerRequest({
        routePolicy,
        headers: protectedHeaders,
        body: {},
        session: { valid: false, subject_id: null, wallet_address: null },
        trust: verifiedTrust,
      }),
    ).toMatchObject({ allowed: false, status: 401 });

    expect(
      evaluateProtectedSellerRequest({
        routePolicy,
        headers: protectedHeaders,
        body: {},
        session: { ...verifiedSession, wallet_address: 'other-wallet' },
        trust: verifiedTrust,
      }),
    ).toMatchObject({ allowed: false, status: 403 });

    expect(
      evaluateProtectedSellerRequest({
        routePolicy,
        headers: protectedHeaders,
        body: {},
        session: verifiedSession,
        trust: null,
      }),
    ).toMatchObject({ allowed: false, status: 503 });

    expect(
      evaluateProtectedSellerRequest({
        routePolicy,
        headers: protectedHeaders,
        body: {},
        session: verifiedSession,
        trust: {
          wallet_address: 'seller-wallet',
          trust_state: 'manual_review',
          high_trust_eligible: false,
        },
      }),
    ).toMatchObject({ allowed: false, status: 403 });
  });
});
