import { LEGACY_ACTION_ALIASES } from '@aadharchain/agentguard-contract';
import { TRUST_API_URL } from './identityUrls';

export interface AgentGuardAgent {
  agent_id: string;
  wallet_address: string;
  name: string;
  status: 'active' | 'paused';
  policy_id?: string | null;
}

export interface AgentGuardPolicy {
  policy_id: string;
  wallet_address: string;
  agent_id: string;
  template: string;
  refund_auto_max_inr: number;
}

export interface AgentGuardMandate {
  mandate_id: string;
  agent_id?: string | null;
  principal_id?: string;
  role?: 'buyer' | 'seller';
  status?: string;
  template?: string;
  limits?: Record<string, unknown>;
  allowed_actions?: string[];
  confirmed_at?: string | null;
}

export interface AgentGuardApproval {
  approval_id: string;
  wallet_address: string;
  agent_id: string;
  policy_id: string;
  action: string;
  amount_inr: number;
  resource_id: string;
  status: string;
  nonce: string;
}

export interface AgentGuardReceipt {
  receipt_id: string;
  wallet_address: string;
  agent_id: string;
  policy_id: string;
  action: string;
  amount_inr: number;
  resource_id: string;
  outcome: string;
  approval_id?: string | null;
  created_at: string;
}

export interface EvaluateResult {
  decision: 'allow' | 'need_approval' | 'deny';
  reason: string;
  agent: AgentGuardAgent;
  policy: AgentGuardPolicy;
  receipt: AgentGuardReceipt | null;
  approval: AgentGuardApproval | null;
}


/** Legacy wallet body only — social/demo sessions rely on cookie principal. */
function walletField(walletAddress?: string | null): Record<string, string> {
  if (!walletAddress || walletAddress.startsWith('principal:')) return {};
  return { wallet_address: walletAddress };
}

async function parseApi<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok || body.success === false) {
    throw new Error(body.detail || body.message || body.error?.message || 'AgentGuard request failed');
  }
  return body.data as T;
}

export async function ensureAgentGuard(walletAddress?: string | null) {
  const response = await fetch(`${TRUST_API_URL}/api/agentguard/agents/ensure`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...walletField(walletAddress), role: 'seller' }),
  });
  return parseApi<{ agent: AgentGuardAgent; policy: AgentGuardPolicy; mandate?: AgentGuardMandate | null }>(response);
}

export async function fetchAgentGuardStatus(walletAddress?: string | null) {
  // Demo/Google principal: cookie-bound current agent (no wallet URL).
  if (!walletAddress || walletAddress.startsWith('principal:')) {
    const response = await fetch(
      `${TRUST_API_URL}/api/agentguard/agents/current?role=seller`,
      { credentials: 'include' },
    );
    return parseApi<{
      agent: AgentGuardAgent | null;
      policy: AgentGuardPolicy | null;
      mandate?: AgentGuardMandate | null;
      receipts: AgentGuardReceipt[];
    }>(response);
  }
  const response = await fetch(`${TRUST_API_URL}/api/agentguard/wallets/${walletAddress}`, {
    credentials: 'include',
  });
  return parseApi<{
    agent: AgentGuardAgent | null;
    policy: AgentGuardPolicy | null;
    mandate?: AgentGuardMandate | null;
    receipts: AgentGuardReceipt[];
  }>(response);
}

export async function evaluateRefund(params: {
  walletAddress?: string | null;
  amountInr: number;
  resourceId: string;
}) {
  const response = await fetch(`${TRUST_API_URL}/api/agentguard/actions/evaluate`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...walletField(params.walletAddress),
      action: LEGACY_ACTION_ALIASES.refund,
      amount_inr: params.amountInr,
      resource_id: params.resourceId,
    }),
  });
  return parseApi<EvaluateResult>(response);
}

export async function consumeApproval(params: {
  walletAddress?: string | null;
  approvalId: string;
}) {
  const response = await fetch(`${TRUST_API_URL}/api/agentguard/approvals/consume`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...walletField(params.walletAddress),
      approval_id: params.approvalId,
    }),
  });
  if (response.status === 409) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || 'Approval already consumed (replay rejected).');
  }
  return parseApi<{ approval: AgentGuardApproval; receipt: AgentGuardReceipt }>(response);
}

export async function pauseAgent(params: { walletAddress?: string | null; agentId: string }) {
  const response = await fetch(
    `${TRUST_API_URL}/api/agentguard/agents/${params.agentId}/pause`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...walletField(params.walletAddress) }),
    },
  );
  return parseApi<{ agent: AgentGuardAgent }>(response);
}

export async function resumeAgent(params: { walletAddress?: string | null; agentId: string }) {
  const response = await fetch(
    `${TRUST_API_URL}/api/agentguard/agents/${params.agentId}/resume`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...walletField(params.walletAddress) }),
    },
  );
  return parseApi<{ agent: AgentGuardAgent }>(response);
}

export async function compileMandate(params: {
  walletAddress?: string | null;
  agentId?: string;
  refundAutoMaxInr?: number;
  allowedActions?: string[];
}) {
  const refundMax = params.refundAutoMaxInr ?? 5000;
  const response = await fetch(`${TRUST_API_URL}/api/agentguard/mandates/compile`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...walletField(params.walletAddress),
      role: 'seller',
      template: 'seller_ops_v1',
      agent_id: params.agentId,
      allowed_actions: params.allowedActions,
      limits: {
        auto_approve_max_inr: {
          'seller.refund.issue': refundMax,
        },
        simulated_payment: true,
      },
    }),
  });
  return parseApi<{ mandate: AgentGuardMandate }>(response);
}

export async function confirmMandate(params: { walletAddress?: string | null; mandateId: string }) {
  const response = await fetch(`${TRUST_API_URL}/api/agentguard/mandates/${params.mandateId}/confirm`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...walletField(params.walletAddress) }),
  });
  return parseApi<{ mandate: AgentGuardMandate }>(response);
}

/** Preferred mutation boundary: evaluate/consume + commerce executor on the gateway. */
export async function executeProtectedAction(params: {
  walletAddress?: string | null;
  action: string;
  amountInr: number;
  resourceId: string;
  approvalId?: string;
  idempotencyKey?: string;
  payload?: Record<string, unknown>;
}) {
  const response = await fetch(`${TRUST_API_URL}/api/agentguard/actions/execute`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...walletField(params.walletAddress),
      action: params.action,
      amount_inr: params.amountInr,
      resource_id: params.resourceId,
      approval_id: params.approvalId,
      idempotency_key: params.idempotencyKey,
      payload: params.payload ?? {},
    }),
  });
  if (response.status === 409) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || 'Protected action conflict (replay or state).');
  }
  return parseApi<{
    decision?: string;
    receipt?: AgentGuardReceipt;
    execution?: Record<string, unknown>;
    approval?: AgentGuardApproval | null;
  }>(response);
}

export async function verifyReceipt(params: {
  receiptId?: string;
  receipt?: AgentGuardReceipt;
}) {
  const response = await fetch(`${TRUST_API_URL}/api/agentguard/receipts/verify`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      receipt_id: params.receiptId,
      receipt: params.receipt,
    }),
  });
  return parseApi<{ valid: boolean; reason?: string; receipt?: AgentGuardReceipt }>(response);
}
