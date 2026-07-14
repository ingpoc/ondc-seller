import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { ProductEditPage } from './ProductEditPage';

const mockUseTrustState = vi.fn();
const mockUseApi = vi.fn();

vi.mock('@solana/wallet-adapter-react', () => ({
  useWallet: () => ({
    publicKey: {
      toBase58: () => 'wallet-test-123',
    },
  }),
}));

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

vi.mock('../components', () => ({
  ProductForm: () => <div>product form</div>,
}));

function renderPage(route = '/catalog/basmati-rice-5kg') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/catalog/new" element={<ProductEditPage />} />
        <Route path="/catalog/:id" element={<ProductEditPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProductEditPage trust gating', () => {
  beforeEach(() => {
    mockUseApi.mockReturnValue({
      data: null,
      execute: vi.fn(),
    });
  });

  it('blocks direct product editing until seller trust is verified', () => {
    mockUseTrustState.mockReturnValue({
      state: 'no_identity',
      loading: false,
      error: null,
      reason: 'Sign in before continuing.',
    });

    renderPage();

    expect(screen.getByText('Seller catalog writes stay blocked until you sign in or trust is verified.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to catalog' })).toBeInTheDocument();
    expect(screen.queryByText('product form')).not.toBeInTheDocument();
  });

  it('renders the editable product form only when seller trust is verified', () => {
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
});
