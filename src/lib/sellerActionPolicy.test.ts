import { describe, expect, it } from 'vitest';
import type { PortfolioTrustState } from './trust';
import {
  SELLER_ACTION_POLICY,
  buildSellerActionHeaders,
  buildSellerBackendActionPolicy,
  canExecuteSellerAction,
  evaluateSellerActionPolicy,
  type SellerSensitiveAction,
} from './sellerActionPolicy';

const TRUST_STATES: PortfolioTrustState[] = [
  'no_identity',
  'identity_present_unverified',
  'verified',
  'manual_review',
  'revoked_or_blocked',
];

describe('sellerActionPolicy', () => {
  it.each(Object.keys(SELLER_ACTION_POLICY) as SellerSensitiveAction[])(
    'requires verified trust before %s',
    (action) => {
      const matrix = Object.fromEntries(
        TRUST_STATES.map((state) => [state, canExecuteSellerAction(action, state)]),
      );

      expect(matrix).toEqual({
        no_identity: false,
        identity_present_unverified: false,
        verified: true,
        manual_review: false,
        revoked_or_blocked: false,
      });
    },
  );

  it('returns an explicit fail-closed reason for insufficient trust', () => {
    const decision = evaluateSellerActionPolicy('order_accept', {
      trustState: 'manual_review',
      walletAddress: 'seller-wallet',
      subjectId: 'seller-subject',
    });

    expect(decision).toMatchObject({
      allowed: false,
      requiredTrustState: 'verified',
      reason: 'Verified seller trust is required before this seller action can execute.',
    });
  });

  it('builds a backend policy envelope that requires server trust revalidation', () => {
    const policy = buildSellerBackendActionPolicy('order_dispatch', {
      trustState: 'verified',
      walletAddress: 'seller-wallet',
      subjectId: 'seller-subject',
      sessionId: 'seller-session',
      auditSubjectId: 'order-1',
      auditReferenceId: 'tracking-1',
    });

    expect(policy).toEqual({
      action: 'order_dispatch',
      required_trust_state: 'verified',
      wallet_address: 'seller-wallet',
      subject_id: 'seller-subject',
      session_id: 'seller-session',
      audit_subject_id: 'order-1',
      audit_reference_id: 'tracking-1',
      client_observed_trust_state: 'verified',
      enforcement: 'backend_must_revalidate_trust',
    });
    expect(buildSellerActionHeaders(policy)).toEqual({
      'Content-Type': 'application/json',
      'X-Seller-Protected-Action': 'order_dispatch',
      'X-Seller-Required-Trust-State': 'verified',
      'X-Seller-Trust-State': 'verified',
      'X-Wallet-Address': 'seller-wallet',
      'X-Seller-Audit-Subject': 'order-1',
      'X-Seller-Trust-Enforcement': 'backend_must_revalidate_trust',
      'X-User-Id': 'seller-subject',
      'X-Seller-Session-Id': 'seller-session',
    });
  });

  it('does not build a backend policy envelope without verified trust', () => {
    expect(() =>
      buildSellerBackendActionPolicy('catalog_save', {
        trustState: 'manual_review',
        walletAddress: 'seller-wallet',
        auditSubjectId: 'item-1',
      }),
    ).toThrow('Verified seller trust is required before this seller action can execute.');
  });

  it('requires wallet and audit subject before protected seller actions are sent', () => {
    expect(() =>
      buildSellerBackendActionPolicy('catalog_save', {
        trustState: 'verified',
        walletAddress: null,
        auditSubjectId: 'item-1',
      }),
    ).toThrow('Wallet address is required before protected seller actions can be sent.');

    expect(() =>
      buildSellerBackendActionPolicy('catalog_save', {
        trustState: 'verified',
        walletAddress: 'seller-wallet',
      }),
    ).toThrow('Audit subject is required before protected seller actions can be sent.');
  });
});
