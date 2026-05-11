import { describe, expect, it } from 'vitest';
import {
  enforceSellerBackendAction,
  type SellerBackendEnforcementRequest,
} from './sellerBackendEnforcement';
import { buildSellerBackendActionPolicy } from './sellerActionPolicy';

function baseRequest(): SellerBackendEnforcementRequest {
  return {
    action: 'order_accept',
    policy: buildSellerBackendActionPolicy('order_accept', {
      trustState: 'verified',
      walletAddress: 'seller-wallet',
      subjectId: 'seller-subject',
      sessionId: 'seller-session',
      auditSubjectId: 'order-1',
    }),
    session: {
      valid: true,
      subject_id: 'seller-subject',
      wallet_address: 'seller-wallet',
    },
    trust: {
      wallet_address: 'seller-wallet',
      trust_state: 'verified',
      high_trust_eligible: true,
      did: 'did:solana:seller-wallet',
    },
    auditSubjectId: 'order-1',
  };
}

describe('enforceSellerBackendAction', () => {
  it('allows protected seller actions only after backend session, wallet, trust, policy, and audit checks pass', () => {
    expect(enforceSellerBackendAction(baseRequest())).toMatchObject({
      allowed: true,
      status: 200,
      audit: {
        action: 'order_accept',
        subject_id: 'seller-subject',
        wallet_address: 'seller-wallet',
        audit_subject_id: 'order-1',
        required_trust_state: 'verified',
        observed_trust_state: 'verified',
        outcome: 'allowed',
      },
    });
  });

  it('rejects when the seller session is missing or invalid', () => {
    const request = baseRequest();
    request.session = {
      valid: false,
      subject_id: null,
      wallet_address: null,
    };

    expect(enforceSellerBackendAction(request)).toMatchObject({
      allowed: false,
      status: 401,
      reason: 'A valid seller session is required.',
      audit: {
        outcome: 'blocked',
        observed_trust_state: 'verified',
      },
    });
  });

  it('rejects when the backend policy envelope is absent or mismatched', () => {
    const missingPolicy = baseRequest();
    missingPolicy.policy = null;
    expect(enforceSellerBackendAction(missingPolicy)).toMatchObject({
      allowed: false,
      status: 403,
      reason: 'A seller backend action policy envelope is required.',
    });

    const wrongAction = baseRequest();
    wrongAction.action = 'order_reject';
    expect(enforceSellerBackendAction(wrongAction)).toMatchObject({
      allowed: false,
      status: 403,
      reason: 'Seller action policy does not match the requested operation.',
    });
  });

  it('rejects wallet, subject, and audit target mismatches', () => {
    const walletMismatch = baseRequest();
    walletMismatch.session.wallet_address = 'other-wallet';
    expect(enforceSellerBackendAction(walletMismatch)).toMatchObject({
      allowed: false,
      status: 403,
      reason: 'Seller session wallet must match the protected action wallet.',
    });

    const subjectMismatch = baseRequest();
    subjectMismatch.session.subject_id = 'other-subject';
    expect(enforceSellerBackendAction(subjectMismatch)).toMatchObject({
      allowed: false,
      status: 403,
      reason: 'Seller action subject must match the active session.',
    });

    const auditMismatch = baseRequest();
    auditMismatch.auditSubjectId = 'other-order';
    expect(enforceSellerBackendAction(auditMismatch)).toMatchObject({
      allowed: false,
      status: 403,
      reason: 'Seller audit subject must match the protected action target.',
    });
  });

  it('fails closed when AadhaarChain trust is unavailable or not verified', () => {
    const unavailable = baseRequest();
    unavailable.trust = null;
    expect(enforceSellerBackendAction(unavailable)).toMatchObject({
      allowed: false,
      status: 503,
      reason: 'AadhaarChain trust state is unavailable.',
      audit: {
        observed_trust_state: 'unavailable',
      },
    });

    const manualReview = baseRequest();
    manualReview.trust = {
      wallet_address: 'seller-wallet',
      trust_state: 'manual_review',
      high_trust_eligible: false,
    };
    expect(enforceSellerBackendAction(manualReview)).toMatchObject({
      allowed: false,
      status: 403,
      reason: 'Verified AadhaarChain seller trust is required.',
      audit: {
        observed_trust_state: 'manual_review',
      },
    });
  });
});
