import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { categoryCountHint, DashboardPage } from './DashboardPage';

const mockUseApi = vi.fn();

vi.mock('../hooks/useApi', () => ({
  useApi: (...args: unknown[]) => mockUseApi(...args),
}));

vi.mock('../hooks/useSubject', () => ({
  useSubject: () => ({
    walletAddress: null,
    principalId: 'principal:seller:test',
  }),
}));

vi.mock('../hooks/useTrustState', () => ({
  useTrustState: () => ({
    state: 'verified',
    loading: false,
    error: null,
    reason: null,
  }),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuthContext: () => ({ isAuthenticated: true }),
}));

describe('Dashboard category summary', () => {
  it('does not describe an empty catalog as a single category', () => {
    expect(categoryCountHint(0)).toBe('No categories yet');
    expect(categoryCountHint(1)).toBe('One category so far');
    expect(categoryCountHint(2)).toBe('Multiple demand lanes');
  });
});

describe('Dashboard overview route', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockUseApi.mockReturnValue({
      data: { 'bpp/providers': [{ items: [] }] },
      loading: false,
      error: null,
      execute: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays on /dashboard instead of auto-redirecting to store setup', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/business" element={<div>Store setup page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Seller dashboard' })).toBeVisible();
    await vi.advanceTimersByTimeAsync(5000);
    expect(screen.getByRole('heading', { name: 'Seller dashboard' })).toBeVisible();
    expect(screen.queryByText('Store setup page')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Store setup' })).toBeInTheDocument();
  });

  it('does not treat a missing-store 404 as Catalog unavailable', () => {
    mockUseApi.mockReturnValue({
      data: null,
      loading: false,
      error: 'Store setup unavailable',
      execute: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText('Catalog unavailable')).not.toBeInTheDocument();
    expect(screen.queryByText('Store setup unavailable')).not.toBeInTheDocument();
    expect(screen.getByText('No products yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Store setup' })).toBeInTheDocument();
  });
});
