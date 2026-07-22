import {
  type AgentRef,
  type AgentGuardAction,
  type Approval,
  type IntentReceipt,
  type Mandate,
} from '@aadharchain/agentguard-contract';
import { TRUST_API_URL } from './identityUrls';

/** Current caller: legacy wallet status payload. Delete after 2026-08-01. */
type LegacyPolicyRecord = {
  policy_id: string;
  wallet_address?: string | null;
  agent_id: string;
  template: string;
  refund_auto_max_inr: number;
};

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
  return parseApi<{ agent: AgentRef; policy: LegacyPolicyRecord; mandate?: Mandate | null }>(response);
}

export async function fetchAgentGuardStatus(walletAddress?: string | null) {
  // Demo/Google principal: cookie-bound current agent (no wallet URL).
  if (!walletAddress || walletAddress.startsWith('principal:')) {
    const response = await fetch(
      `${TRUST_API_URL}/api/agentguard/agents/current?role=seller`,
      { credentials: 'include' },
    );
    return parseApi<{
      agent: AgentRef | null;
      policy: LegacyPolicyRecord | null;
      mandate?: Mandate | null;
      receipts: IntentReceipt[];
    }>(response);
  }
  const response = await fetch(`${TRUST_API_URL}/api/agentguard/wallets/${walletAddress}`, {
    credentials: 'include',
  });
  return parseApi<{
    agent: AgentRef | null;
    policy: LegacyPolicyRecord | null;
    mandate?: Mandate | null;
    receipts: IntentReceipt[];
  }>(response);
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
  return parseApi<{ agent: AgentRef }>(response);
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
  return parseApi<{ agent: AgentRef }>(response);
}

export async function compileMandate(params: {
  walletAddress?: string | null;
  agentId?: string;
  refundAutoMaxInr?: number;
  allowedActions?: AgentGuardAction[];
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
  return parseApi<{ mandate: Mandate }>(response);
}

export async function confirmMandate(params: { walletAddress?: string | null; mandateId: string }) {
  const response = await fetch(`${TRUST_API_URL}/api/agentguard/mandates/${params.mandateId}/confirm`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...walletField(params.walletAddress) }),
  });
  return parseApi<{ mandate: Mandate }>(response);
}

/** Preferred mutation boundary: evaluate/consume + commerce executor on the gateway. */
export async function executeProtectedAction(params: {
  walletAddress?: string | null;
  action: AgentGuardAction;
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
  const data = await parseApi<{
    decision?: string;
    receipt?: IntentReceipt;
    result?: Record<string, unknown>;
    execution?: Record<string, unknown>;
    approval?: Approval | null;
  }>(response);
  const execution = data.execution ?? data.result;
  return execution ? { ...data, execution } : data;
}

export async function verifyReceipt(params: {
  receiptId?: string;
  receipt?: IntentReceipt;
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
  return parseApi<{ valid: boolean; reason?: string; receipt?: IntentReceipt }>(response);
}
