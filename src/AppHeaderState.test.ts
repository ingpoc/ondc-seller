import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createElement } from 'react';

import {
  getHeaderTrustMeta,
  getRuntimeMeta,
  headerRuntimeIsHealthy,
  headerTrustIsHealthy,
  NavigationLink,
} from './App';

describe('Seller header access state', () => {
  it('shows an authenticated principal as verified without requiring wallet trust', () => {
    expect(getHeaderTrustMeta('no_identity', false, 'principal:demo:seller').label).toBe(
      'Verified',
    );
  });

  it('keeps an anonymous no-identity session signed out', () => {
    expect(getHeaderTrustMeta('no_identity', false, null).label).toBe('Sign in required');
  });

  it('does not expose the assistant credential mechanism in merchant copy', () => {
    const runtime = getRuntimeMeta({
      runtime_available: true,
      auth_mode: 'api_key',
    });

    expect(runtime.label).toBe('Ready');
    expect(`${runtime.label} ${runtime.detail}`).not.toMatch(/api[_ -]?key/i);
  });

  it('treats Verified and Ready as healthy (not header-interruptive)', () => {
    expect(headerTrustIsHealthy('Verified')).toBe(true);
    expect(headerTrustIsHealthy('Unverified')).toBe(false);
    expect(headerRuntimeIsHealthy('Ready')).toBe(true);
    expect(headerRuntimeIsHealthy('Unavailable')).toBe(false);
  });

  it('marks the active primary nav item from the current route', () => {
    render(
      createElement(
        MemoryRouter,
        { initialEntries: ['/orders'] },
        createElement(
          'nav',
          null,
          createElement(NavigationLink, { href: '/dashboard', label: 'Dashboard' }),
          createElement(NavigationLink, { href: '/orders', label: 'Orders' }),
          createElement(NavigationLink, { href: '/config', label: 'Settings' }),
        ),
      ),
    );

    expect(screen.getByRole('link', { name: 'Orders' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Settings' })).not.toHaveAttribute('aria-current');
  });
});
