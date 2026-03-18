import type { PortfolioTrustState } from '@/lib/trust';

export type SubscriptionStatus = 'inactive' | 'trial' | 'active' | 'past_due' | 'canceled';

export interface UsageSnapshot {
  requests_used: number;
  requests_limit: number;
  period_start: string;
  period_end: string;
  estimated_cost_usd: number;
}

export interface EntitlementSnapshot {
  app_id: 'ondc-seller';
  subscription_status: SubscriptionStatus;
  plan_tier: string;
  agent_access: boolean;
  trust_required_for_write: boolean;
  usage: UsageSnapshot;
  allowed_capabilities: string[];
  blocked_reason: string | null;
}

export interface AgentSessionSummary {
  app_id: 'ondc-seller';
  session_id: string;
  sdk_session_id: string | null;
  subject_id: string;
  trust_state: PortfolioTrustState;
  mode: 'blocked' | 'read_only' | 'full';
  allowed_capabilities: string[];
  created_at: string;
  updated_at: string;
}
