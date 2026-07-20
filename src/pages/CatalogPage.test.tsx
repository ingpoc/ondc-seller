import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { CatalogPage } from './CatalogPage';

const mockUseTrustState = vi.fn();
const mockUseApi = vi.fn();

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

const catalogResponse = {
  'bpp/providers': [
    {
      items: [
        {
          id: 'basmati-rice-5kg',
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

function renderPage(initialEntry: string | { pathname: string; state?: unknown } = '/catalog') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <CatalogPage />
    </MemoryRouter>
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
      reason: 'Sign in before continuing.',
    });

    renderPage();

    expect(screen.getByRole('button', { name: 'Add product' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Edit featured listing Basmati Rice 5kg' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Edit product details for Basmati Rice 5kg' })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Archive Basmati Rice 5kg' })).toBeDisabled();
  });

  it('shows the persisted save acknowledgement returned by the edit flow', () => {
    mockUseTrustState.mockReturnValue({
      state: 'verified',
      loading: false,
      error: null,
      reason: null,
    });

    renderPage({
      pathname: '/catalog',
      state: { catalogNotice: 'Basmati Rice 5kg was updated.' },
    });

    expect(screen.getByRole('status')).toHaveTextContent('Catalog saved');
    expect(screen.getByRole('status')).toHaveTextContent('Basmati Rice 5kg was updated.');
  });
});
