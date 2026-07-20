import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  coerceSellerNavPath,
  findSellerCatalogMatch,
  runSellerTool,
  sellerToolsForMandate,
} from './agentTools';

vi.mock('./commerceClient', () => ({
  listCommerceSellerOrders: vi.fn(),
  listCommerceSellerItems: vi.fn(async () => []),
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
    expect(coerceSellerNavPath('agent')).toBeNull();
    expect(coerceSellerNavPath('/agent')).toBeNull();
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

  it('catalog_publish executes the mutation through AgentGuard', async () => {
    const { executeProtectedAction } = await import('./agentGuardClient');
    vi.mocked(executeProtectedAction).mockResolvedValueOnce({
      decision: 'allow',
      receipt: { receipt_id: 'rcpt_catalog' } as never,
      execution: { item: { item_id: 'item-1', title: 'Ragi Flour' } },
    });

    const result = await runSellerTool(
      'catalog_publish',
      { title: 'Ragi Flour', price_inr: 120, inventory: 5 },
      { subjectId: 'principal:demo:s' },
    );

    expect(result.ok).toBe(true);
    expect(result.receiptId).toBe('rcpt_catalog');
    expect(result.data?.updated_existing).toBe(false);
    expect(executeProtectedAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'seller.catalog.publish',
        amountInr: 0,
        payload: expect.objectContaining({ title: 'Ragi Flour', inventory: 5 }),
      }),
    );
  });

  it('catalog_publish updates an existing same-title SKU instead of duplicating', async () => {
    const { listCommerceSellerItems } = await import('./commerceClient');
    const { executeProtectedAction } = await import('./agentGuardClient');
    vi.mocked(listCommerceSellerItems).mockResolvedValueOnce([
      {
        item_id: 'item_rice_1',
        version: 1,
        status: 'published',
        seller_id: 'principal:demo:s',
        title: 'Rice 10 kg',
        description: 'old',
        price_inr: 200,
        inventory: 10,
        created_at: '2026-07-20T00:00:00Z',
        updated_at: '2026-07-20T00:00:00Z',
      },
    ]);
    vi.mocked(executeProtectedAction).mockResolvedValueOnce({
      decision: 'allow',
      receipt: { receipt_id: 'rcpt_update' } as never,
      execution: { item: { item_id: 'item_rice_1', title: 'Rice 10 kg', price_inr: 100 } },
    });

    const result = await runSellerTool(
      'catalog_publish',
      { title: 'Rice 10 kg', price_inr: 100, inventory: 10 },
      { subjectId: 'principal:demo:s' },
    );

    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/Updated/i);
    expect(result.data?.updated_existing).toBe(true);
    expect(executeProtectedAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'seller.catalog.publish',
        resourceId: 'item_rice_1',
        payload: expect.objectContaining({
          item_id: 'item_rice_1',
          title: 'Rice 10 kg',
          price_inr: 100,
        }),
      }),
    );
  });

  it('findSellerCatalogMatch prefers exact live title', () => {
    const match = findSellerCatalogMatch(
      [
        {
          item_id: 'a',
          version: 1,
          status: 'published',
          seller_id: 's',
          title: 'Rice 10 kg',
          description: '',
          price_inr: 200,
          created_at: '2026-07-20T00:00:00Z',
          updated_at: '2026-07-20T00:00:00Z',
        },
        {
          item_id: 'b',
          version: 1,
          status: 'archived',
          seller_id: 's',
          title: 'Rice 10 kg',
          description: '',
          price_inr: 90,
          created_at: '2026-07-20T00:00:00Z',
          updated_at: '2026-07-20T01:00:00Z',
        },
      ],
      'rice 10 kg',
    );
    expect(match?.item_id).toBe('a');
  });

  it('list_pending_orders summarizes accept and fulfill queues', async () => {
    const { listCommerceSellerOrders } = await import('./commerceClient');
    vi.mocked(listCommerceSellerOrders).mockResolvedValueOnce([
      {
        id: 'ord-paid',
        status: 'created',
        createdAt: '2026-07-20T00:00:00Z',
        updatedAt: '2026-07-20T01:00:00Z',
        total: 100,
        items: [{ id: 'i1', name: 'Rice 10 kg', quantity: 1, price: { currency: 'INR', value: '100.00' } }],
      },
      {
        id: 'ord-accepted',
        status: 'accepted',
        createdAt: '2026-07-20T00:00:00Z',
        updatedAt: '2026-07-20T02:00:00Z',
        total: 200,
        items: [{ id: 'i2', name: 'Atta', quantity: 2, price: { currency: 'INR', value: '100.00' } }],
      },
    ] as never);

    const result = await runSellerTool('list_pending_orders', {}, { subjectId: 'principal:demo:s' });
    expect(result.ok).toBe(true);
    expect(result.navigateTo).toBe('/orders');
    expect(result.data?.awaiting_accept).toBe(1);
    expect(result.data?.awaiting_fulfill).toBe(1);
    expect(result.message).toMatch(/2 pending/i);
  });

  it('offers order tools only for their canonical AgentGuard actions', () => {
    expect(
      sellerToolsForMandate([
        'seller.order.accept',
        'seller.order.reject',
        'seller.fulfilment.commit',
      ]),
    ).toEqual(
      expect.arrayContaining(['accept_order', 'reject_order', 'mark_order_fulfilled']),
    );
    expect(sellerToolsForMandate(['seller.fulfillment.commit'])).not.toContain(
      'mark_order_fulfilled',
    );
  });

  it('accept_order resolves the newest paid order and executes through AgentGuard', async () => {
    const { listCommerceSellerOrders } = await import('./commerceClient');
    const { executeProtectedAction } = await import('./agentGuardClient');
    vi.mocked(listCommerceSellerOrders).mockResolvedValueOnce([
      { id: 'older-paid', status: 'created', updatedAt: '2026-07-12T10:00:00Z' },
      { id: 'newer-paid', status: 'created', updatedAt: '2026-07-14T10:00:00Z' },
      { id: 'already-accepted', status: 'accepted', updatedAt: '2026-07-15T10:00:00Z' },
    ] as never);
    vi.mocked(executeProtectedAction).mockResolvedValueOnce({
      decision: 'allow',
      receipt: { receipt_id: 'rcpt_accept' } as never,
    });

    const result = await runSellerTool('accept_order', {}, { subjectId: 'principal:demo:s' });

    expect(result.ok).toBe(true);
    expect(result.navigateTo).toBe('/orders/newer-paid');
    expect(executeProtectedAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'seller.order.accept',
        resourceId: 'newer-paid',
        payload: { order_id: 'newer-paid' },
      }),
    );
  });

  it('reject_order uses an explicit order id and reports AgentGuard denial honestly', async () => {
    const { executeProtectedAction } = await import('./agentGuardClient');
    vi.mocked(executeProtectedAction).mockResolvedValueOnce({
      decision: 'deny',
      receipt: undefined,
    });

    const result = await runSellerTool(
      'reject_order',
      { order_id: 'paid-2' },
      { subjectId: 'principal:demo:s' },
    );

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/denied by AgentGuard/i);
    expect(executeProtectedAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'seller.order.reject', resourceId: 'paid-2' }),
    );
  });

  it('mark_order_fulfilled resolves the newest accepted order', async () => {
    const { listCommerceSellerOrders } = await import('./commerceClient');
    const { executeProtectedAction } = await import('./agentGuardClient');
    vi.mocked(listCommerceSellerOrders).mockResolvedValueOnce([
      { id: 'paid', status: 'created', updatedAt: '2026-07-15T12:00:00Z' },
      { id: 'accepted', status: 'accepted', updatedAt: '2026-07-15T11:00:00Z' },
    ] as never);
    vi.mocked(executeProtectedAction).mockResolvedValueOnce({
      decision: 'allow',
      receipt: { receipt_id: 'rcpt_fulfilled' } as never,
    });

    const result = await runSellerTool(
      'mark_order_fulfilled',
      {},
      { subjectId: 'principal:demo:s' },
    );

    expect(result.ok).toBe(true);
    expect(result.navigateTo).toBe('/orders/accepted');
    expect(executeProtectedAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'seller.fulfilment.commit',
        resourceId: 'accepted',
      }),
    );
  });

  it('order actions fail clearly when no eligible order exists', async () => {
    const { listCommerceSellerOrders } = await import('./commerceClient');
    vi.mocked(listCommerceSellerOrders).mockResolvedValueOnce([
      { id: 'already-done', status: 'delivered', updatedAt: '2026-07-15T10:00:00Z' },
    ] as never);

    const result = await runSellerTool(
      'mark_order_fulfilled',
      {},
      { subjectId: 'principal:demo:s' },
    );

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/no accepted seller order/i);
    expect(result.navigateTo).toBe('/orders');
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
