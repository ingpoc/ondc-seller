export interface SellerApiRoutePolicy {
  action:
    | 'catalog_save'
    | 'catalog_delete'
    | 'order_accept'
    | 'order_reject'
    | 'order_dispatch'
    | 'seller_config_save'
    | 'seller_config_generate_keys';
  auditSubject?: string;
  auditSubjectFrom?: 'body_id' | 'body_subscriber_id';
}

export interface SellerApiSession {
  valid: boolean;
  subject_id: string | null;
  wallet_address: string | null;
}

export interface SellerApiTrust {
  wallet_address: string;
  trust_state: string;
  high_trust_eligible: boolean;
}

export function inferProtectedSellerAction(
  method: string,
  pathname: string,
): SellerApiRoutePolicy | null;

export function evaluateProtectedSellerRequest(input: {
  routePolicy: SellerApiRoutePolicy | null;
  headers: Record<string, string | string[] | undefined>;
  body: Record<string, unknown>;
  session: SellerApiSession;
  trust: SellerApiTrust | null;
}): {
  allowed: boolean;
  status: number;
  reason: string;
  audit?: Record<string, unknown>;
};
