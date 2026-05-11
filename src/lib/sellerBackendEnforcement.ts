import type { PortfolioTrustState } from './trust';
import type { SellerBackendActionPolicy, SellerSensitiveAction } from './sellerActionPolicy';
import { SELLER_ACTION_POLICY } from './sellerActionPolicy';

export interface SellerBackendTrustSnapshot {
  wallet_address: string;
  trust_state: PortfolioTrustState;
  high_trust_eligible: boolean;
  did?: string | null;
}

export interface SellerBackendSession {
  valid: boolean;
  subject_id: string | null;
  wallet_address: string | null;
}

export interface SellerBackendEnforcementRequest {
  action: SellerSensitiveAction;
  policy: SellerBackendActionPolicy | null;
  session: SellerBackendSession;
  trust: SellerBackendTrustSnapshot | null;
  auditSubjectId: string | null;
}

export interface SellerBackendAuditRecord {
  action: SellerSensitiveAction;
  subject_id: string | null;
  wallet_address: string | null;
  audit_subject_id: string | null;
  audit_reference_id: string | null;
  required_trust_state: 'verified';
  observed_trust_state: PortfolioTrustState | 'unavailable';
  outcome: 'allowed' | 'blocked';
  reason: string;
}

export interface SellerBackendEnforcementDecision {
  allowed: boolean;
  status: 200 | 401 | 403 | 503;
  reason: string;
  audit: SellerBackendAuditRecord;
}

function blockedDecision(
  request: SellerBackendEnforcementRequest,
  status: SellerBackendEnforcementDecision['status'],
  reason: string,
): SellerBackendEnforcementDecision {
  return {
    allowed: false,
    status,
    reason,
    audit: {
      action: request.action,
      subject_id: request.session.subject_id,
      wallet_address: request.session.wallet_address ?? request.policy?.wallet_address ?? null,
      audit_subject_id: request.auditSubjectId ?? request.policy?.audit_subject_id ?? null,
      audit_reference_id: request.policy?.audit_reference_id ?? null,
      required_trust_state: 'verified',
      observed_trust_state: request.trust?.trust_state ?? 'unavailable',
      outcome: 'blocked',
      reason,
    },
  };
}

export function enforceSellerBackendAction(
  request: SellerBackendEnforcementRequest,
): SellerBackendEnforcementDecision {
  const policyDefinition = SELLER_ACTION_POLICY[request.action];

  if (!request.session.valid || !request.session.subject_id) {
    return blockedDecision(request, 401, 'A valid seller session is required.');
  }

  if (!request.policy) {
    return blockedDecision(request, 403, 'A seller backend action policy envelope is required.');
  }

  if (request.policy.enforcement !== 'backend_must_revalidate_trust') {
    return blockedDecision(request, 403, 'Seller trust must be revalidated by the backend.');
  }

  if (request.policy.action !== request.action) {
    return blockedDecision(request, 403, 'Seller action policy does not match the requested operation.');
  }

  if (request.policy.required_trust_state !== policyDefinition.requiredTrustState) {
    return blockedDecision(request, 403, 'Seller action policy requires the wrong trust state.');
  }

  if (!request.session.wallet_address || request.session.wallet_address !== request.policy.wallet_address) {
    return blockedDecision(request, 403, 'Seller session wallet must match the protected action wallet.');
  }

  if (request.policy.subject_id && request.policy.subject_id !== request.session.subject_id) {
    return blockedDecision(request, 403, 'Seller action subject must match the active session.');
  }

  if (!request.auditSubjectId || request.auditSubjectId !== request.policy.audit_subject_id) {
    return blockedDecision(request, 403, 'Seller audit subject must match the protected action target.');
  }

  if (!request.trust) {
    return blockedDecision(request, 503, 'AadhaarChain trust state is unavailable.');
  }

  if (request.trust.wallet_address !== request.session.wallet_address) {
    return blockedDecision(request, 403, 'AadhaarChain trust wallet does not match the active session.');
  }

  if (
    request.trust.trust_state !== policyDefinition.requiredTrustState ||
    !request.trust.high_trust_eligible
  ) {
    return blockedDecision(request, 403, 'Verified AadhaarChain seller trust is required.');
  }

  return {
    allowed: true,
    status: 200,
    reason: policyDefinition.reason,
    audit: {
      action: request.action,
      subject_id: request.session.subject_id,
      wallet_address: request.session.wallet_address,
      audit_subject_id: request.auditSubjectId,
      audit_reference_id: request.policy.audit_reference_id,
      required_trust_state: 'verified',
      observed_trust_state: request.trust.trust_state,
      outcome: 'allowed',
      reason: policyDefinition.reason,
    },
  };
}
