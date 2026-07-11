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

async function parseApi<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok || body.success === false) {
    throw new Error(body.detail || body.message || body.error?.message || 'AgentGuard request failed');
  }
  return body.data as T;
}

export async function ensureAgentGuard(walletAddress: string) {
  const response = await fetch(`${TRUST_API_URL}/api/agentguard/agents/ensure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet_address: walletAddress }),
  });
  return parseApi<{ agent: AgentGuardAgent; policy: AgentGuardPolicy }>(response);
}

export async function fetchAgentGuardStatus(walletAddress: string) {
  const response = await fetch(`${TRUST_API_URL}/api/agentguard/wallets/${walletAddress}`);
  return parseApi<{
    agent: AgentGuardAgent | null;
    policy: AgentGuardPolicy | null;
    receipts: AgentGuardReceipt[];
  }>(response);
}

export async function evaluateRefund(params: {
  walletAddress: string;
  amountInr: number;
  resourceId: string;
}) {
  const response = await fetch(`${TRUST_API_URL}/api/agentguard/actions/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wallet_address: params.walletAddress,
      action: 'refund',
      amount_inr: params.amountInr,
      resource_id: params.resourceId,
    }),
  });
  return parseApi<EvaluateResult>(response);
}

export async function consumeApproval(params: {
  walletAddress: string;
  approvalId: string;
}) {
  const response = await fetch(`${TRUST_API_URL}/api/agentguard/approvals/consume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wallet_address: params.walletAddress,
      approval_id: params.approvalId,
    }),
  });
  if (response.status === 409) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || 'Approval already consumed (replay rejected).');
  }
  return parseApi<{ approval: AgentGuardApproval; receipt: AgentGuardReceipt }>(response);
}

export async function pauseAgent(params: { walletAddress: string; agentId: string }) {
  const response = await fetch(
    `${TRUST_API_URL}/api/agentguard/agents/${params.agentId}/pause`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet_address: params.walletAddress }),
    },
  );
  return parseApi<{ agent: AgentGuardAgent }>(response);
}

export async function resumeAgent(params: { walletAddress: string; agentId: string }) {
  const response = await fetch(
    `${TRUST_API_URL}/api/agentguard/agents/${params.agentId}/resume`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet_address: params.walletAddress }),
    },
  );
  return parseApi<{ agent: AgentGuardAgent }>(response);
}
