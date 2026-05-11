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
}

export interface SellerActionPolicyDecision {
  allowed: boolean;
  requiredTrustState: PortfolioTrustState;
  reason: string;
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

export function buildSellerActionHeaders(context: SellerActionContext): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-Seller-Trust-State': context.trustState,
    ...(context.walletAddress ? { 'X-Wallet-Address': context.walletAddress } : {}),
    ...(context.subjectId ? { 'X-User-Id': context.subjectId } : {}),
    ...(context.sessionId ? { 'X-Seller-Session-Id': context.sessionId } : {}),
  };
}
