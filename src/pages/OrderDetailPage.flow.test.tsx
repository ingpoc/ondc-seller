import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CommerceClientError } from '../lib/commerceClient';
import { OrderDetailPage } from './OrderDetailPage';

const commerce = vi.hoisted(() => ({
  loadSellerOrderByLookup: vi.fn(),
  getCommerceOrder: vi.fn(),
  listCommerceSellerIssues: vi.fn(),
  paymentStatusLabel: (status?: string) => (status === 'paid' ? 'Paid' : String(status || '')),
  isCommerceNotFound: (error: unknown) =>
    error instanceof CommerceClientError &&
    (error.status === 404 || /not found/i.test(error.message)),
}));

const agentGuard = vi.hoisted(() => ({
  executeProtectedAction: vi.fn(),
  verifyReceipt: vi.fn(),
}));

vi.mock('../lib/commerceClient', async () => {
  const actual = await vi.importActual<typeof import('../lib/commerceClient')>(
    '../lib/commerceClient',
  );
  return {
    ...actual,
    loadSellerOrderByLookup: (...args: unknown[]) => commerce.loadSellerOrderByLookup(...args),
    getCommerceOrder: (...args: unknown[]) => commerce.getCommerceOrder(...args),
    listCommerceSellerIssues: (...args: unknown[]) => commerce.listCommerceSellerIssues(...args),
  };
});

vi.mock('../lib/agentGuardClient', () => ({
  executeProtectedAction: (...args: unknown[]) => agentGuard.executeProtectedAction(...args),
  verifyReceipt: (...args: unknown[]) => agentGuard.verifyReceipt(...args),
}));

vi.mock('@/hooks', () => ({
  useSubject: () => ({
    subjectId: 'principal:seller:test',
    principalId: 'principal:seller:test',
    walletAddress: null,
    authLoading: false,
  }),
  useTrustState: () => ({
    state: 'verified',
    loading: false,
    error: null,
    reason: null,
  }),
}));

vi.mock('../lib/localSellerNotes', () => ({
  listSellerOrderNotesForOrder: () => [],
}));

vi.mock('../lib/localSellerAudit', () => ({
  recordSellerActionAuditEvent: vi.fn(),
}));

const liveOrder = {
  id: '7ba6fe24-aaaa-4bbb-8ccc-ddddeeeeffff',
  displayId: '7BA6FE24',
  transactionId: '7ba6fe24-aaaa-4bbb-8ccc-ddddeeeeffff',
  status: 'created' as const,
  createdAt: '2026-08-19T12:00:00Z',
  updatedAt: '2026-08-19T12:00:00Z',
  total: 178,
  refundedAmountInr: 0,
  paymentStatus: 'paid',
  items: [
    {
      id: 'sampoorna-whole-wheat-atta-1kg',
      name: 'Sampoorna Whole Wheat Atta 1kg',
      quantity: 2,
      price: { currency: 'INR', value: '89.00' },
    },
  ],
  quote: {
    price: { currency: 'INR', value: '178.00' },
    total: { currency: 'INR', value: '178.00' },
    subtotal: { currency: 'INR', value: '178.00' },
    breakup: [],
  },
  buyer: { name: 'Ananya Rao', email: '', phone: '', contact: {} },
};

function renderDetail(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/orders/:id" element={<OrderDetailPage />} />
        <Route path="/orders" element={<div>Orders list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('OrderDetailPage live lookup and refund guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commerce.listCommerceSellerIssues.mockResolvedValue([]);
    agentGuard.verifyReceipt.mockResolvedValue({ valid: true });
  });

  it('shows a clean not-found when the seller order lookup misses', async () => {
    commerce.loadSellerOrderByLookup.mockResolvedValueOnce(null);

    renderDetail('/orders/7BA6FE24');

    expect(await screen.findByRole('heading', { name: 'Order not found' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Order error' })).not.toBeInTheDocument();
    expect(screen.queryByText(/'order not found'/i)).not.toBeInTheDocument();
  });

  it('renders the order when a payload exists for a compact buyer reference', async () => {
    commerce.loadSellerOrderByLookup.mockResolvedValueOnce(liveOrder);

    renderDetail('/orders/7BA6FE24');

    expect(await screen.findByRole('heading', { name: /Order reference 7BA6FE24/i })).toBeVisible();
    expect(screen.getByText(/Sampoorna Whole Wheat Atta 1kg/)).toBeVisible();
    expect(screen.getByText(/Transaction 7BA6FE24/)).toBeVisible();
    expect(screen.getByTestId('agentguard-refund-panel')).toBeVisible();
  });

  it('blocks a refund larger than the remaining order total without calling AgentGuard', async () => {
    commerce.loadSellerOrderByLookup.mockResolvedValueOnce(liveOrder);

    renderDetail('/orders/7BA6FE24');
    await screen.findByTestId('refund-amount-input');

    fireEvent.change(screen.getByTestId('refund-amount-input'), { target: { value: '9000' } });
    fireEvent.click(screen.getByTestId('review-refund-amount'));

    expect(await screen.findByTestId('agentguard-message')).toHaveTextContent(
      /exceeds the remaining order total/i,
    );
    expect(agentGuard.executeProtectedAction).not.toHaveBeenCalled();
  });

  it('does not render need_approval as an executed refund', async () => {
    commerce.loadSellerOrderByLookup.mockResolvedValueOnce({
      ...liveOrder,
      refundAuthorization: {
        receiptId: 'receipt_need_approval',
        outcome: 'need_approval',
        amountInr: 178,
      },
    });

    renderDetail('/orders/7BA6FE24');

    const receipt = await screen.findByTestId('agentguard-durable-refund-receipt');
    expect(receipt).toHaveTextContent(/waiting for one-time approval/i);
    expect(receipt).not.toHaveTextContent(/verified/i);
    expect(receipt).not.toHaveTextContent(/approved and executed/i);
  });
});
