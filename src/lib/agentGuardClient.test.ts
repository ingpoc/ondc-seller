import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeProtectedAction } from './agentGuardClient';

afterEach(() => vi.unstubAllGlobals());

describe('Seller AgentGuard protected-write contract', () => {
  it('sends stable idempotency and correlation identifiers together', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { decision: 'allow' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await executeProtectedAction({
      action: 'seller.refund.issue',
      amountInr: 89,
      resourceId: 'order-1',
      decisionId: 'decision-1',
      idempotencyKey: 'refund:order-1:attempt-1',
      correlationId: 'refund-flow-1',
      payload: { order_id: 'order-1' },
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({
      'Idempotency-Key': 'refund:order-1:attempt-1',
      'X-Correlation-ID': 'refund-flow-1',
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      idempotency_key: 'refund:order-1:attempt-1',
      action: 'seller.refund.issue',
      decision_id: 'decision-1',
    });
  });

  it('derives one replay-safe contract when an older caller omits a key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { decision: 'allow' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await executeProtectedAction({
      action: 'seller.refund.issue',
      amountInr: 89,
      resourceId: 'order-1',
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({
      'Idempotency-Key': 'seller-action:seller.refund.issue:order-1:89',
      'X-Correlation-ID': 'seller-protected:seller-action:seller.refund.issue:order-1:89',
    });
  });
});
