import { describe, expect, it, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import { ProductEditPage } from './ProductEditPage';

const mockUseTrustState = vi.fn();
const mockUseApi = vi.fn();
const mockExecuteProtectedAction = vi.fn();

vi.mock('../hooks/useTrustState', () => ({
  useTrustState: (...args: unknown[]) => mockUseTrustState(...args),
}));

vi.mock('../hooks/useSubject', () => ({
  useSubject: () => ({
    subjectId: 'seller-subject-test',
    walletAddress: 'wallet-test-123',
    authLoading: false,
  }),
}));

vi.mock('../hooks/useApi', () => ({
  useApi: (...args: unknown[]) => mockUseApi(...args),
}));

vi.mock('../lib/agentGuardClient', () => ({
  executeProtectedAction: (...args: unknown[]) => mockExecuteProtectedAction(...args),
}));

vi.mock('../lib/localSellerAudit', () => ({
  recordSellerActionAuditEvent: vi.fn(),
}));

vi.mock('../lib/agentSellerState', () => ({
  clearConsumedSellerDraft: vi.fn(),
  getDraftFormDataForRoute: vi.fn(() => null),
}));

vi.mock('../components', () => ({
  ProductForm: ({ onSubmit }: { onSubmit: (data: Record<string, string>) => Promise<void> }) => (
    <button
      type="button"
      onClick={() =>
        void onSubmit({
          id: 'basmati-rice-5kg',
          name: 'Basmati Rice 5kg',
          description: 'Premium aged rice',
          price: '640.00',
          currency: 'INR',
          categoryId: 'Grocery',
          inventory: '12',
        })
      }
    >
      product form
    </button>
  ),
}));

function CatalogDestination() {
  const location = useLocation();
  const notice = (location.state as { catalogNotice?: string } | null)?.catalogNotice;
  return <div>{notice ?? 'catalog destination'}</div>;
}

function renderPage(route = '/catalog/basmati-rice-5kg') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/catalog/new" element={<ProductEditPage />} />
        <Route path="/catalog/:id" element={<ProductEditPage />} />
        <Route path="/catalog" element={<CatalogDestination />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProductEditPage AgentGuard ownership', () => {
  beforeEach(() => {
    mockExecuteProtectedAction.mockReset();
    mockUseApi.mockReturnValue({
      data: null,
      execute: vi.fn(),
    });
  });

  it('leaves authorization to the server-side AgentGuard executor', () => {
    mockUseTrustState.mockReturnValue({
      state: 'no_identity',
      loading: false,
      error: null,
      reason: 'Sign in before continuing.',
    });

    renderPage();

    expect(screen.getByText('product form')).toBeInTheDocument();
    expect(screen.queryByText('Seller catalog writes stay blocked until you sign in or trust is verified.')).not.toBeInTheDocument();
  });

  it('also renders the form when the informational trust state is verified', () => {
    mockUseTrustState.mockReturnValue({
      state: 'verified',
      loading: false,
      error: null,
      reason: null,
    });

    renderPage();

    expect(screen.getByText('product form')).toBeInTheDocument();
    expect(screen.queryByText('Back to catalog')).not.toBeInTheDocument();
  });

  it('binds catalog content in the payload without treating list price as money movement', async () => {
    mockUseTrustState.mockReturnValue({
      state: 'verified',
      loading: false,
      error: null,
      reason: null,
    });
    mockExecuteProtectedAction.mockResolvedValue({
      decision: 'allow',
      execution: { item: { item_id: 'basmati-rice-5kg' } },
      receipt: { receipt_id: 'receipt-catalog' },
    });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'product form' }));

    await waitFor(() => {
      expect(mockExecuteProtectedAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'seller.catalog.publish',
          amountInr: 0,
          resourceId: 'basmati-rice-5kg',
          payload: expect.objectContaining({
            item_id: 'basmati-rice-5kg',
            title: 'Basmati Rice 5kg',
            price_inr: 640,
            inventory: 12,
            category_id: 'Grocery',
          }),
        }),
      );
    });
    expect(await screen.findByText('Basmati Rice 5kg was updated.')).toBeInTheDocument();
  });
});
