import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTrustState } from './useTrustState';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useTrustState', () => {
  it('fails closed to no_identity when the trust service is unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({}),
    } as Response);

    const { result } = renderHook(() => useTrustState('seller-wallet-fixture'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.state).toBe('no_identity');
    expect(result.current.eligible).toBe(false);
    expect(result.current.trust).toBeNull();
    expect(result.current.error).toBe('Trust API request failed: 503');
  });
});
