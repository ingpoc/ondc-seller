import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RequireSellerSession } from './App';
import { SellerLandingPage, safeReturnPath } from './pages/SellerLandingPage';

const mockUseAuthContext = vi.fn();

vi.mock('./contexts/AuthContext', () => ({
  useAuthContext: () => mockUseAuthContext(),
}));

function authState(overrides: Record<string, unknown> = {}) {
  return {
    isAuthenticated: false,
    loading: false,
    login: vi.fn(),
    ...overrides,
  };
}

describe('Seller signed-out boundary', () => {
  beforeEach(() => {
    mockUseAuthContext.mockReturnValue(authState());
  });

  it('redirects a signed-out deep link before protected content mounts', async () => {
    render(
      <MemoryRouter initialEntries={['/orders/private-order']}>
        <Routes>
          <Route path="/" element={<div>Public seller home</div>} />
          <Route
            path="/orders/:id"
            element={
              <RequireSellerSession>
                <div>Private customer order</div>
              </RequireSellerSession>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Public seller home')).toBeVisible();
    expect(screen.queryByText('Private customer order')).not.toBeInTheDocument();
  });

  it('mounts protected content only for an authenticated seller', () => {
    mockUseAuthContext.mockReturnValue(authState({ isAuthenticated: true }));

    render(
      <MemoryRouter initialEntries={['/orders/private-order']}>
        <Routes>
          <Route
            path="/orders/:id"
            element={
              <RequireSellerSession>
                <div>Private customer order</div>
              </RequireSellerSession>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Private customer order')).toBeVisible();
  });

  it('keeps protected content hidden while session validation is pending', () => {
    mockUseAuthContext.mockReturnValue(authState({ loading: true }));

    render(
      <MemoryRouter>
        <RequireSellerSession>
          <div>Private settings</div>
        </RequireSellerSession>
      </MemoryRouter>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Checking sign-in');
    expect(screen.queryByText('Private settings')).not.toBeInTheDocument();
  });

  it('shows a public home page with one clear sign-in action and no seller data', () => {
    const login = vi.fn();
    mockUseAuthContext.mockReturnValue(authState({ login }));

    render(
      <MemoryRouter initialEntries={[{ pathname: '/', state: { returnTo: '/orders' } }]}>
        <SellerLandingPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Run your store with clear control' })).toBeVisible();
    expect(screen.getByText(/Your store data stays private until you sign in/i)).toBeVisible();
    expect(screen.queryByText(/customer name|private key|refund reference/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to Seller workspace' }));
    expect(login).toHaveBeenCalledWith('/orders');
  });

  it('rejects unsafe return locations', () => {
    expect(safeReturnPath('/orders/123')).toBe('/orders/123');
    expect(safeReturnPath('//malicious.example')).toBe('/dashboard');
    expect(safeReturnPath('https://malicious.example')).toBe('/dashboard');
  });
});
