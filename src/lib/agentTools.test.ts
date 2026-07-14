import { beforeEach, describe, expect, it, vi } from 'vitest';
import { coerceSellerNavPath, runSellerTool } from './agentTools';

vi.mock('./commerceClient', () => ({
  createAndPublishSellerItem: vi.fn(async (input: { name: string; id: string }) => ({
    ...input,
    price: '100',
  })),
  listCommerceSellerOrders: vi.fn(),
}));

vi.mock('./agentGuardClient', () => ({
  executeProtectedAction: vi.fn(),
}));

vi.mock('./samanthaMemory', () => ({
  rememberSamanthaFact: vi.fn(),
}));

describe('seller agent tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('coerceSellerNavPath normalizes catalog tool args', () => {
    expect(coerceSellerNavPath('catalog')).toBe('/catalog');
    expect(coerceSellerNavPath('/catalog')).toBe('/catalog');
    expect(coerceSellerNavPath('orders')).toBe('/orders');
  });

  it('navigate_to coerces bare catalog to /catalog', async () => {
    const result = await runSellerTool(
      'navigate_to',
      { path: 'catalog' },
      { subjectId: 'principal:demo:s' },
    );
    expect(result.ok).toBe(true);
    expect(result.navigateTo).toBe('/catalog');
  });

  it('navigate_to accepts agentguard and orders', async () => {
    for (const path of ['/agentguard', '/orders', '/catalog']) {
      const result = await runSellerTool('navigate_to', { path }, { subjectId: 'principal:demo:s' });
      expect(result.ok).toBe(true);
      expect(result.navigateTo).toBe(path);
    }
  });

  it('remember_preference keys by subjectId', async () => {
    const { rememberSamanthaFact } = await import('./samanthaMemory');
    const result = await runSellerTool(
      'remember_preference',
      { kind: 'preference', value: 'brief refund confirmations' },
      { subjectId: 'principal:demo:s', walletAddress: 'wallet-ignore' },
    );
    expect(result.ok).toBe(true);
    expect(rememberSamanthaFact).toHaveBeenCalledWith(
      'principal:demo:s',
      'preference',
      'brief refund confirmations',
    );
  });

  it('refund_issue reports AgentGuard need_approval', async () => {
    const { executeProtectedAction } = await import('./agentGuardClient');
    vi.mocked(executeProtectedAction).mockResolvedValueOnce({
      decision: 'need_approval',
      approval: { approval_id: 'a1' } as never,
      receipt: undefined,
    });
    const result = await runSellerTool(
      'refund_issue',
      { order_id: 'seller-demo-1002', amount_inr: 9000 },
      { subjectId: 'principal:demo:s' },
    );
    expect(result.decision).toBe('need_approval');
    expect(result.message).toMatch(/approval/i);
  });

  it('refund_issue resolves the latest visible order when order_id is omitted', async () => {
    const { listCommerceSellerOrders } = await import('./commerceClient');
    const { executeProtectedAction } = await import('./agentGuardClient');
    vi.mocked(listCommerceSellerOrders).mockResolvedValueOnce([
      { id: 'older', createdAt: '2026-07-12T10:00:00Z' },
      { id: 'latest', createdAt: '2026-07-14T10:00:00Z' },
    ] as never);
    vi.mocked(executeProtectedAction).mockResolvedValueOnce({
      decision: 'allow',
      receipt: { receipt_id: 'rcpt_latest' } as never,
    });

    const result = await runSellerTool(
      'refund_issue',
      { amount_inr: 50 },
      { subjectId: 'principal:demo:s' },
    );

    expect(result.ok).toBe(true);
    expect(executeProtectedAction).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: 'latest', amountInr: 50 }),
    );
  });

  it('refund_issue reports when no visible order can be resolved', async () => {
    const { listCommerceSellerOrders } = await import('./commerceClient');
    vi.mocked(listCommerceSellerOrders).mockResolvedValueOnce([]);

    const result = await runSellerTool(
      'refund_issue',
      { amount_inr: 50 },
      { subjectId: 'principal:demo:s' },
    );

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/no visible seller order/i);
  });

  it('delegate_to_runtime_agent fails clearly when runtime check fails', async () => {
    vi.stubEnv('VITE_AGENT_RUNTIME_ENABLED', 'true');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 503,
        text: async () => '{}',
      })),
    );
    const result = await runSellerTool(
      'delegate_to_runtime_agent',
      { task: 'triage overdue refunds and draft replies' },
      { subjectId: 'principal:demo:s' },
    );
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/couldn't start|HTTP 503/i);
  });

  it('delegate_to_runtime_agent starts background work without navigateTo /agent', async () => {
    vi.stubEnv('VITE_AGENT_RUNTIME_ENABLED', 'true');
    const setItem = vi.fn();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => null,
        setItem,
      },
      sessionStorage: {
        setItem,
        getItem: () => null,
        removeItem: vi.fn(),
      },
    });
    const emptyReader = {
      read: vi.fn(async () => ({ done: true, value: undefined })),
      cancel: vi.fn(async () => undefined),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/agent/runtime')) {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                runtime_available: true,
                agent_access: true,
                blocked_reason: null,
              }),
          };
        }
        return {
          ok: true,
          status: 200,
          body: { getReader: () => emptyReader },
        };
      }),
    );
    const result = await runSellerTool(
      'delegate_to_runtime_agent',
      { task: 'bulk update inventory for dairy SKUs' },
      { subjectId: 'principal:demo:s' },
    );
    expect(result.ok).toBe(true);
    expect(result.navigateTo).toBeUndefined();
    expect(result.data?.started).toBe(true);
    expect(result.data?.finished).toBe(false);
    expect(result.message).toMatch(/started that|let you know/i);
    expect(setItem).toHaveBeenCalled();
    await vi.waitFor(() => expect(emptyReader.read).toHaveBeenCalled());
  });
});
