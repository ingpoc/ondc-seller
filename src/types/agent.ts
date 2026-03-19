import type { PortfolioTrustState } from '@/lib/trust';
import type { BecknItem, UCPOrder } from '@ondc-sdk/shared';
import type { ProductFormData } from '@/components/ProductForm';

export type AgentAuthMode = 'api_key' | 'local_cli' | 'bedrock' | 'vertex' | 'azure' | 'unavailable';

export interface UsageSnapshot {
  requests_used: number;
  requests_limit: number;
  period_start: string;
  period_end: string;
  estimated_cost_usd: number;
}

export interface AgentRuntimeSnapshot {
  app_id: 'ondc-seller';
  auth_mode: AgentAuthMode;
  model: string;
  runtime_available: boolean;
  agent_access: boolean;
  trust_state: PortfolioTrustState;
  trust_required_for_write: boolean;
  mode: 'blocked' | 'read_only' | 'full';
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

export type SellerAgentActionType =
  | 'catalog_patch'
  | 'draft_listing_create'
  | 'draft_listing_update'
  | 'listing_quality_flag'
  | 'order_followup_note'
  | 'navigate'
  | 'trust_required'
  | 'unsupported';

export interface SellerCatalogDiagnostic {
  item_id: string;
  title: string;
  severity: 'info' | 'warning' | 'critical';
  detail: string;
}

export interface SellerOrderSummary {
  total: number;
  pending: number;
  accepted: number;
  dispatched: number;
  completed: number;
  cancelled: number;
  items: Array<{
    id: string;
    status: UCPOrder['status'];
    buyer_name: string;
    total: string;
    note_count: number;
  }>;
}

export interface SellerAgentSnapshot {
  route: {
    path: string;
    search: string;
  };
  trust: {
    state: PortfolioTrustState;
    write_enabled: boolean;
  };
  catalog: {
    total_items: number;
    items: Array<{
      id: string;
      name: string;
      description: string;
      category: string;
      price: string;
      has_image: boolean;
    }>;
  };
  diagnostics: SellerCatalogDiagnostic[];
  orders: SellerOrderSummary;
  config: {
    configured: boolean;
    subscriber_id: string | null;
    base_url: string | null;
  };
  pending_draft: ProductFormData | null;
}

export interface SellerCatalogPatchAction {
  type: 'catalog_patch';
  target_item_id: string;
  reason: string;
  patch: Partial<{
    name: string;
    description: string;
    price: string;
    currency: string;
    category_id: string;
    image_url: string;
  }>;
}

export interface SellerDraftListingAction {
  type: 'draft_listing_create' | 'draft_listing_update';
  reason: string;
  target_item_id?: string;
  draft: ProductFormData;
}

export interface SellerListingQualityFlagAction {
  type: 'listing_quality_flag';
  item_id: string;
  severity: 'info' | 'warning' | 'critical';
  issue: string;
  recommendation: string;
}

export interface SellerOrderFollowupNoteAction {
  type: 'order_followup_note';
  order_id: string;
  note: string;
  next_step?: string;
}

export interface SellerNavigateAction {
  type: 'navigate';
  path: string;
  reason: string;
}

export interface SellerTrustRequiredAction {
  type: 'trust_required';
  operation: string;
  reason: string;
  suggested_path?: string;
}

export interface SellerUnsupportedAction {
  type: 'unsupported';
  reason: string;
}

export type SellerAgentAction =
  | SellerCatalogPatchAction
  | SellerDraftListingAction
  | SellerListingQualityFlagAction
  | SellerOrderFollowupNoteAction
  | SellerNavigateAction
  | SellerTrustRequiredAction
  | SellerUnsupportedAction;

export interface SellerAgentResponseEnvelope {
  summary: string;
  actions: SellerAgentAction[];
}

export interface SellerOrderNote {
  id: string;
  order_id: string;
  note: string;
  next_step?: string;
  created_at: string;
}

export interface SellerAgentPatchResult {
  summary: string;
  actions: SellerAgentAction[];
  catalog: BecknItem[];
  diagnostics: SellerCatalogDiagnostic[];
  pendingDraft: ProductFormData | null;
  orderNotes: Record<string, SellerOrderNote[]>;
  navigateTo: string | null;
  trustBlockReason: string | null;
}
