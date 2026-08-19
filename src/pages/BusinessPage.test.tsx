import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CommerceClientError } from '../lib/commerceClient';
import { BusinessPage } from './BusinessPage';

const storeClient = vi.hoisted(() => ({
  getSellerStore: vi.fn(),
  saveSellerStore: vi.fn(),
}));

vi.mock('../lib/commerceClient', async () => {
  const actual = await vi.importActual<typeof import('../lib/commerceClient')>(
    '../lib/commerceClient',
  );
  return {
    ...actual,
    getSellerStore: (...args: unknown[]) => storeClient.getSellerStore(...args),
    saveSellerStore: (...args: unknown[]) => storeClient.saveSellerStore(...args),
  };
});

describe('BusinessPage missing store setup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps store setup editable when the store record is not found', async () => {
    storeClient.getSellerStore.mockResolvedValue({ store: null, setup_required: true });

    render(
      <MemoryRouter initialEntries={['/business']}>
        <BusinessPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByTestId('seller-store-setup')).toBeInTheDocument());
    expect(screen.getByLabelText('Store name')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Complete store setup' })).toBeEnabled();
    expect(screen.queryByText('Store setup unavailable')).not.toBeInTheDocument();
    expect(screen.queryByText(/Not Found/i)).not.toBeInTheDocument();
  });

  it('does not treat a 404 from the store API as a fatal setup block', async () => {
    storeClient.getSellerStore.mockRejectedValue(new CommerceClientError('Not Found', 404));

    render(
      <MemoryRouter initialEntries={['/business']}>
        <BusinessPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByLabelText('Store name')).toBeEnabled());
    expect(screen.getByTestId('seller-store-setup')).toBeInTheDocument();
    expect(screen.queryByText('Store setup unavailable')).not.toBeInTheDocument();
  });
});
