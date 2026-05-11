import { describe, expect, it } from 'vitest';
import type { PortfolioTrustState } from './trust';
import {
  SELLER_ACTION_POLICY,
  buildSellerActionHeaders,
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

  it('builds trust/session headers for commerce API enforcement boundaries', () => {
    expect(
      buildSellerActionHeaders({
        trustState: 'verified',
        walletAddress: 'seller-wallet',
        subjectId: 'seller-subject',
        sessionId: 'seller-session',
      }),
    ).toEqual({
      'Content-Type': 'application/json',
      'X-Seller-Trust-State': 'verified',
      'X-Wallet-Address': 'seller-wallet',
      'X-User-Id': 'seller-subject',
      'X-Seller-Session-Id': 'seller-session',
    });
  });
});
