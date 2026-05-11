import type { PortfolioTrustState } from './trust';

export type SellerSensitiveAction =
  | 'catalog_save'
  | 'catalog_delete'
  | 'catalog_patch'
  | 'order_accept'
  | 'order_reject'
  | 'order_dispatch'
  | 'seller_config_save'
  | 'seller_config_generate_keys'
  | 'order_followup_note';

export interface SellerActionContext {
  trustState: PortfolioTrustState;
  walletAddress?: string | null;
  subjectId?: string | null;
  sessionId?: string | null;
  auditSubjectId?: string | null;
  auditReferenceId?: string | null;
}

export interface SellerActionPolicyDecision {
  allowed: boolean;
  requiredTrustState: PortfolioTrustState;
  reason: string;
}

export interface SellerBackendActionPolicy {
  action: SellerSensitiveAction;
  required_trust_state: 'verified';
  wallet_address: string;
  subject_id: string | null;
  session_id: string | null;
  audit_subject_id: string;
  audit_reference_id: string | null;
  client_observed_trust_state: PortfolioTrustState;
  enforcement: 'backend_must_revalidate_trust';
}

const VERIFIED_TRUST_REQUIRED = 'Verified seller trust is required before this seller action can execute.';

export const SELLER_ACTION_POLICY: Record<
  SellerSensitiveAction,
  {
    requiredTrustState: PortfolioTrustState;
    reason: string;
  }
> = {
  catalog_save: {
    requiredTrustState: 'verified',
    reason: 'Catalog creation, edits, publication, and price changes affect buyer-facing listings.',
  },
  catalog_delete: {
    requiredTrustState: 'verified',
    reason: 'Deleting catalog items changes the buyer-facing seller inventory.',
  },
  catalog_patch: {
    requiredTrustState: 'verified',
    reason: 'Agent-originated catalog patches can change buyer-facing listing content or price.',
  },
  order_accept: {
    requiredTrustState: 'verified',
    reason: 'Accepting an order commits the seller to fulfillment.',
  },
  order_reject: {
    requiredTrustState: 'verified',
    reason: 'Rejecting an order affects buyer fulfillment and network trust.',
  },
  order_dispatch: {
    requiredTrustState: 'verified',
    reason: 'Dispatch updates change fulfillment state and buyer-facing tracking.',
  },
  seller_config_save: {
    requiredTrustState: 'verified',
    reason: 'Seller configuration can affect routing, payouts, credentials, and network identity.',
  },
  seller_config_generate_keys: {
    requiredTrustState: 'verified',
    reason: 'Key generation changes the seller credential material used for ONDC operations.',
  },
  order_followup_note: {
    requiredTrustState: 'verified',
    reason: 'Agent-originated order notes write to seller order history.',
  },
};

export function evaluateSellerActionPolicy(
  action: SellerSensitiveAction,
  context: SellerActionContext,
): SellerActionPolicyDecision {
  const policy = SELLER_ACTION_POLICY[action];
  const allowed = context.trustState === policy.requiredTrustState;

  return {
    allowed,
    requiredTrustState: policy.requiredTrustState,
    reason: allowed ? policy.reason : VERIFIED_TRUST_REQUIRED,
  };
}

export function canExecuteSellerAction(
  action: SellerSensitiveAction,
  trustState: PortfolioTrustState,
): boolean {
  return evaluateSellerActionPolicy(action, { trustState }).allowed;
}

export function assertSellerActionAllowed(
  action: SellerSensitiveAction,
  context: SellerActionContext,
): void {
  const decision = evaluateSellerActionPolicy(action, context);
  if (!decision.allowed) {
    throw new Error(decision.reason);
  }
}

export function buildSellerBackendActionPolicy(
  action: SellerSensitiveAction,
  context: SellerActionContext,
): SellerBackendActionPolicy {
  assertSellerActionAllowed(action, context);

  if (!context.walletAddress) {
    throw new Error('Wallet address is required before protected seller actions can be sent.');
  }

  if (!context.auditSubjectId) {
    throw new Error('Audit subject is required before protected seller actions can be sent.');
  }

  return {
    action,
    required_trust_state: 'verified',
    wallet_address: context.walletAddress,
    subject_id: context.subjectId ?? null,
    session_id: context.sessionId ?? null,
    audit_subject_id: context.auditSubjectId,
    audit_reference_id: context.auditReferenceId ?? null,
    client_observed_trust_state: context.trustState,
    enforcement: 'backend_must_revalidate_trust',
  };
}

export function buildSellerActionHeaders(policy: SellerBackendActionPolicy): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-Seller-Protected-Action': policy.action,
    'X-Seller-Required-Trust-State': policy.required_trust_state,
    'X-Seller-Trust-State': policy.client_observed_trust_state,
    'X-Wallet-Address': policy.wallet_address,
    'X-Seller-Audit-Subject': policy.audit_subject_id,
    'X-Seller-Trust-Enforcement': policy.enforcement,
    ...(policy.subject_id ? { 'X-User-Id': policy.subject_id } : {}),
    ...(policy.session_id ? { 'X-Seller-Session-Id': policy.session_id } : {}),
  };
}
