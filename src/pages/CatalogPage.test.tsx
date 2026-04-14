import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { CatalogPage } from './CatalogPage';

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

vi.mock('../hooks/useApi', () => ({
  useApi: (...args: unknown[]) => mockUseApi(...args),
}));

const catalogResponse = {
  'bpp/providers': [
    {
      items: [
        {
          id: 'demo-basmati-rice',
          descriptor: {
            name: 'Basmati Rice 5kg',
            short_desc: 'Premium rice listing used for local seller-flow fallback.',
          },
          price: {
            currency: 'INR',
            value: '640.00',
          },
          category_id: 'grocery',
          images: [],
        },
      ],
    },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <CatalogPage />
    </MemoryRouter>,
  );
}

describe('CatalogPage trust gating', () => {
  beforeEach(() => {
    mockUseApi.mockReturnValue({
      data: catalogResponse,
      loading: false,
      error: null,
      execute: vi.fn(),
    });
  });

  it('disables visible catalog write actions when trust is not verified', () => {
    mockUseTrustState.mockReturnValue({
      state: 'no_identity',
      loading: false,
      error: null,
      reason: 'Create an identity anchor in AadhaarChain before continuing.',
    });

    renderPage();

    expect(screen.getByRole('button', { name: 'Add product' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Edit' }).every((button) => button.hasAttribute('disabled'))).toBe(true);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });
});
