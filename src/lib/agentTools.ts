/**
 * Host-agnostic Seller tool runner under AgentGuard.
 *
 * Split: Samantha Realtime = short chainable tools (navigate/publish one/refund one/memory).
 * Long / multi-step ops → delegate_to_runtime_agent (background; Samantha notifies when done).
 */
import { executeProtectedAction } from './agentGuardClient';
import { buildAgentControlPlaneUrl } from './agentControlPlane';
import { createAndPublishSellerItem, listCommerceSellerOrders } from './commerceClient';
import { rememberSamanthaFact } from './samanthaMemory';
import { startSellerRuntimeBackground } from './samanthaRuntimeHandoff';

export type SellerToolName =
  | 'navigate_to'
  | 'catalog_publish'
  | 'refund_issue'
  | 'remember_preference'
  | 'delegate_to_runtime_agent';

export type SellerToolResult = {
  ok: boolean;
  tool: SellerToolName;
  message: string;
  data?: Record<string, unknown>;
  navigateTo?: string;
  decision?: string;
  receiptId?: string;
};

export function sellerToolsForMandate(allowedActions: string[] | null | undefined): SellerToolName[] {
  const tools: SellerToolName[] = ['navigate_to', 'remember_preference', 'delegate_to_runtime_agent'];
  if (!allowedActions || allowedActions.includes('seller.catalog.publish')) {
    tools.push('catalog_publish');
  }
  if (!allowedActions || allowedActions.includes('seller.refund.issue')) {
    tools.push('refund_issue');
  }
  return tools;
}

/** Known Seller app routes Samantha may open. */
export const SELLER_NAV_ALLOWLIST = [
  '/dashboard',
  '/catalog',
  '/catalog/new',
  '/orders',
  '/agentguard',
  '/config',
  '/agent',
] as const;

/** Coerce model tool args (e.g. path="catalog") into an app route — not user-utterance parsing. */
export function coerceSellerNavPath(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let base = (trimmed.startsWith('/') ? trimmed : `/${trimmed}`).split('?')[0];
  if (base.length > 1) base = base.replace(/\/+$/, '');
  if ((SELLER_NAV_ALLOWLIST as readonly string[]).includes(base)) return base;
  if (base.startsWith('/catalog/') || base.startsWith('/orders/')) return base;

  const label = trimmed.toLowerCase().replace(/^the\s+/, '').replace(/\s+page$/, '');
  const soft: Record<string, string> = {
    catalog: '/catalog',
    catalogue: '/catalog',
    'catalog/new': '/catalog/new',
    'new catalog': '/catalog/new',
    orders: '/orders',
    order: '/orders',
    agentguard: '/agentguard',
    mandate: '/agentguard',
    config: '/config',
    settings: '/config',
    dashboard: '/dashboard',
    home: '/dashboard',
    agent: '/agent',
  };
  return soft[label] ?? null;
}

export const SELLER_TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    name: 'navigate_to',
    description:
      'Short tool: navigate Seller UI to an allowlisted path (/catalog, /catalog/new, /orders, /agentguard, /config, /dashboard, /agent).',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'App path starting with /, e.g. /catalog',
          enum: [...SELLER_NAV_ALLOWLIST],
        },
      },
      required: ['path'],
    },
  },
  {
    type: 'function' as const,
    name: 'catalog_publish',
    description: 'Short tool: create and publish one catalog item into the shared demo exchange.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        price_inr: { type: 'number' },
        inventory: { type: 'number' },
        description: { type: 'string' },
      },
      required: ['title', 'price_inr'],
    },
  },
  {
    type: 'function' as const,
    name: 'refund_issue',
    description:
      'Short guarded tool: issue one refund for an order via AgentGuard. Omit order_id to use the latest visible order.',
    parameters: {
      type: 'object',
      properties: {
        order_id: { type: 'string' },
        amount_inr: { type: 'number' },
      },
      required: ['amount_inr'],
    },
  },
  {
    type: 'function' as const,
    name: 'remember_preference',
    description:
      'Short tool: store a compact seller ops preference for Samantha. Refund limits stay in AgentGuard.',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['like', 'dislike', 'preference', 'note'] },
        value: { type: 'string' },
      },
      required: ['kind', 'value'],
    },
  },
  {
    type: 'function' as const,
    name: 'delegate_to_runtime_agent',
    description:
      'Start longer / multi-step / planning ops work in the background while staying as Samantha. Use for bulk catalog work, order triage, multi-step mandate setup, or anything needing an extended loop. Do not use for simple navigate/one publish/one refund. Never send the user to /agent. Never claim the work finished until a later UI/tool update says so.',
    parameters: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Clear brief for the background work.' },
        context: {
          type: 'object',
          description: 'Optional context (current path, order ids, constraints).',
        },
      },
      required: ['task'],
    },
  },
];

const SELLER_SESSION_STORAGE_KEY = `portfolio-agent-session-id:${buildAgentControlPlaneUrl('/api/agent/seller')}`;

function sellerRuntimeSessionId(): string {
  if (typeof window === 'undefined') {
    return `session-${Date.now()}`;
  }
  const existing = window.localStorage.getItem(SELLER_SESSION_STORAGE_KEY);
  if (existing) return existing;
  const created = `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  window.localStorage.setItem(SELLER_SESSION_STORAGE_KEY, created);
  return created;
}

/** Verify FlatWatch control-plane, then start /api/agent/seller in the background (no /agent navigation). */
export async function delegateSellerToRuntimeAgent(
  task: string,
  ctx: {
    subjectId?: string | null;
    walletAddress?: string | null;
    context?: Record<string, unknown>;
  },
): Promise<SellerToolResult> {
  const tool: SellerToolName = 'delegate_to_runtime_agent';
  const brief = task.trim();
  if (!brief) {
    return { ok: false, tool, message: 'I need a bit more detail before I can start that.' };
  }
  if (import.meta.env.VITE_AGENT_RUNTIME_ENABLED === 'false') {
    return {
      ok: false,
      tool,
      message: "I can't take on longer work right now — background help is turned off.",
    };
  }
  const subject = (ctx.subjectId || ctx.walletAddress || '').trim();
  if (!subject) {
    return { ok: false, tool, message: "Sign in first and I'll take care of that for you." };
  }

  let runtime: { agent_access?: boolean; runtime_available?: boolean; blocked_reason?: string | null };
  try {
    const response = await fetch(buildAgentControlPlaneUrl('/api/agent/runtime?app=ondc-seller'), {
      headers: {
        'X-User-Id': subject,
        ...(ctx.walletAddress && !String(ctx.walletAddress).startsWith('principal:')
          ? { 'X-Wallet-Address': String(ctx.walletAddress) }
          : {}),
      },
    });
    const raw = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        tool,
        message: `I couldn't start that right now (service HTTP ${response.status}). Try again in a moment.`,
      };
    }
    if (raw.trimStart().startsWith('<')) {
      return {
        ok: false,
        tool,
        message:
          "Background help isn't reachable from this host yet — I'll stay here for shorter asks.",
      };
    }
    runtime = JSON.parse(raw) as typeof runtime;
  } catch (err) {
    return {
      ok: false,
      tool,
      message: err instanceof Error ? err.message : "I couldn't start that right now.",
    };
  }

  if (!runtime.runtime_available || !runtime.agent_access) {
    return {
      ok: false,
      tool,
      message:
        runtime.blocked_reason ||
        "I couldn't start that right now — longer help isn't available yet.",
    };
  }

  const sessionId = sellerRuntimeSessionId();
  const started = startSellerRuntimeBackground({
    task: brief,
    sessionId,
    subjectId: subject,
    walletAddress: ctx.walletAddress,
    context: {
      response_contract: 'seller_agent_v1',
      agentguard_tools: SELLER_TOOL_DEFINITIONS,
      tool_runner: 'ondcseller/agentTools',
      ...(ctx.context ?? {}),
    },
  });

  return {
    ok: started.ok,
    tool,
    message: started.message,
    data: {
      sessionId: started.sessionId ?? sessionId,
      started: started.started,
      finished: false,
      busy: started.busy ?? false,
      guidance:
        'Acknowledge briefly. Do not claim completion yet. Do not mention another agent or /agent. The UI will notify when done.',
    },
  };
}

export async function runSellerTool(
  name: SellerToolName,
  args: Record<string, unknown>,
  ctx: {
    walletAddress?: string | null;
    subjectId?: string | null;
    allowedActions?: string[] | null;
    sellerId?: string;
  },
): Promise<SellerToolResult> {
  const subject = (ctx.subjectId || ctx.walletAddress || '').trim();
  const wallet = (ctx.walletAddress || '').trim();
  const offered = sellerToolsForMandate(ctx.allowedActions);
  if (!offered.includes(name)) {
    return { ok: false, tool: name, message: 'Tool not permitted by confirmed mandate.' };
  }

  if (name === 'navigate_to') {
    const raw = String(args.path ?? args.page ?? args.destination ?? '').trim();
    const path = coerceSellerNavPath(raw);
    if (!path) {
      return {
        ok: false,
        tool: name,
        message:
          'Unknown Seller path. Use /catalog, /catalog/new, /orders, /agentguard, /config, or /dashboard.',
      };
    }
    return { ok: true, tool: name, message: `Navigating to ${path}.`, navigateTo: path };
  }

  if (name === 'remember_preference') {
    const kind = String(args.kind ?? 'note') as 'like' | 'dislike' | 'preference' | 'note';
    const value = String(args.value ?? '');
    if (!value) {
      return { ok: false, tool: name, message: 'value required.' };
    }
    const safeKind = ['like', 'dislike', 'preference', 'note'].includes(kind) ? kind : 'note';
    rememberSamanthaFact(subject || null, safeKind, value);
    return {
      ok: true,
      tool: name,
      message: `Remembered ${safeKind}: ${value}`,
      data: { kind: safeKind, value },
    };
  }

  if (name === 'delegate_to_runtime_agent') {
    return delegateSellerToRuntimeAgent(String(args.task ?? args.brief ?? ''), {
      subjectId: ctx.subjectId,
      walletAddress: ctx.walletAddress,
      context:
        args.context && typeof args.context === 'object'
          ? (args.context as Record<string, unknown>)
          : undefined,
    });
  }

  if (name === 'catalog_publish') {
    const title = String(args.title ?? '');
    const priceInr = Number(args.price_inr) || 0;
    const inventory = Math.max(0, Math.round(Number(args.inventory ?? 10)));
    const publisher = ctx.sellerId || subject || wallet;
    if (!title || !publisher) {
      return { ok: false, tool: name, message: 'title and signed-in principal required.' };
    }
    try {
      const published = await createAndPublishSellerItem({
        id: `agent-${Date.now()}`,
        name: title,
        description: String(args.description ?? 'Published by seller agent tool.'),
        price: String(priceInr),
        inventory,
        sellerId: publisher,
      });
      return {
        ok: true,
        tool: name,
        message: `Published ${published.name} (${published.id}) with ${inventory} in stock — visible on PreProd ONDC when Buyer searches.`,
        data: { item: published, source: 'demo-commerce-ondc' },
        navigateTo: '/catalog',
      };
    } catch (err) {
      return {
        ok: false,
        tool: name,
        message: err instanceof Error ? err.message : 'Publish failed.',
      };
    }
  }

  // refund_issue
  let orderId = String(args.order_id ?? '').trim();
  const amountInr = Math.round(Number(args.amount_inr) || 0);
  if (amountInr <= 0) {
    return { ok: false, tool: name, message: 'positive amount_inr required.' };
  }
  if (!orderId) {
    try {
      const orders = await listCommerceSellerOrders();
      const latest = [...orders].sort(
        (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
      )[0];
      orderId = latest?.id ?? '';
    } catch (err) {
      return {
        ok: false,
        tool: name,
        message: err instanceof Error ? err.message : 'Could not load Seller orders.',
      };
    }
  }
  if (!orderId) {
    return { ok: false, tool: name, message: 'No visible Seller order is available to refund.' };
  }
  try {
    const executed = await executeProtectedAction({
      walletAddress: wallet || null,
      action: 'seller.refund.issue',
      amountInr,
      resourceId: orderId,
      payload: { order_id: orderId },
    });
    const decision = executed.decision ?? 'allow';
    const receiptId = executed.receipt?.receipt_id;
    const outcomeQuery = new URLSearchParams({ outcome: decision });
    if (receiptId) outcomeQuery.set('receipt', receiptId);
    if (executed.approval?.approval_id) {
      outcomeQuery.set('approval', executed.approval.approval_id);
      outcomeQuery.set('amount', String(amountInr));
      outcomeQuery.set('resource', orderId);
    }
    return {
      ok: decision === 'allow' || Boolean(receiptId),
      tool: name,
      message:
        decision === 'need_approval'
          ? 'Refund requires exact one-time approval.'
          : decision === 'deny'
            ? 'Refund denied by AgentGuard.'
            : `Refund issued${receiptId ? `; receipt ${receiptId}` : ''}.`,
      decision,
      receiptId,
      data: executed as unknown as Record<string, unknown>,
      navigateTo: `/agentguard?${outcomeQuery.toString()}`,
    };
  } catch (err) {
    return {
      ok: false,
      tool: name,
      message: err instanceof Error ? err.message : 'Refund failed.',
    };
  }
}
