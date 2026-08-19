import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

function renderBusinessPage() {
  return render(
    <MemoryRouter initialEntries={['/business']}>
      <BusinessPage />
    </MemoryRouter>,
  );
}

async function waitForSetupForm() {
  await waitFor(() => expect(screen.getByTestId('seller-store-setup')).toBeInTheDocument());
  expect(screen.getByLabelText('Store name')).toBeEnabled();
}

describe('BusinessPage missing store setup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps store setup editable when the store record is not found', async () => {
    storeClient.getSellerStore.mockResolvedValue({ store: null, setup_required: true });

    renderBusinessPage();

    await waitForSetupForm();
    expect(screen.getByRole('button', { name: 'Complete store setup' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled();
    expect(screen.queryByText('Store setup unavailable')).not.toBeInTheDocument();
    expect(screen.queryByText(/Not Found/i)).not.toBeInTheDocument();
  });

  it('does not treat a 404 from the store API as a fatal setup block', async () => {
    storeClient.getSellerStore.mockRejectedValue(new CommerceClientError('Not Found', 404));

    renderBusinessPage();

    await waitFor(() => expect(screen.getByLabelText('Store name')).toBeEnabled());
    expect(screen.getByTestId('seller-store-setup')).toBeInTheDocument();
    expect(screen.queryByText('Store setup unavailable')).not.toBeInTheDocument();
    expect(screen.queryByText(/Not Found/i)).not.toBeInTheDocument();
  });

  it('treats Store setup unavailable as an empty draft form', async () => {
    storeClient.getSellerStore.mockRejectedValue(
      new CommerceClientError('Store setup unavailable', 200),
    );

    renderBusinessPage();

    await waitForSetupForm();
    expect(screen.queryByText('Store setup unavailable')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled();
  });

  it('calls saveSellerStore for a draft and does not block on a first-time 404', async () => {
    storeClient.getSellerStore.mockResolvedValue({ store: null, setup_required: true });
    storeClient.saveSellerStore.mockRejectedValue(new CommerceClientError('Not Found', 404));

    renderBusinessPage();
    await waitForSetupForm();

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() =>
      expect(storeClient.saveSellerStore).toHaveBeenCalledWith(
        expect.objectContaining({ complete: false }),
      ),
    );
    expect(screen.getByTestId('seller-store-setup')).toBeInTheDocument();
    expect(screen.queryByText('Store setup unavailable')).not.toBeInTheDocument();
    expect(screen.queryByText(/Not Found/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Could not complete setup')).not.toBeInTheDocument();
  });

  it('calls saveSellerStore to complete setup and only shows real save failures', async () => {
    storeClient.getSellerStore.mockResolvedValue({ store: null, setup_required: true });
    storeClient.saveSellerStore.mockRejectedValue(
      new CommerceClientError('Internal Server Error', 500),
    );

    renderBusinessPage();
    await waitForSetupForm();

    fireEvent.change(screen.getByLabelText('Store name'), { target: { value: 'Pune Kirana' } });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Pune' } });
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'MH' } });
    fireEvent.change(screen.getByLabelText('PIN code'), { target: { value: '411001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Complete store setup' }));

    await waitFor(() =>
      expect(storeClient.saveSellerStore).toHaveBeenCalledWith(
        expect.objectContaining({
          complete: true,
          store_name: 'Pune Kirana',
          city: 'Pune',
          pin: '411001',
        }),
      ),
    );
    expect(screen.getByText('Could not complete setup')).toBeInTheDocument();
    expect(
      screen.getByText('The store service failed. Try again in a moment.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Store setup unavailable')).not.toBeInTheDocument();
    expect(screen.getByTestId('seller-store-setup')).toBeInTheDocument();
  });

  it('shows a sign-in error when store save is unauthorized', async () => {
    storeClient.getSellerStore.mockResolvedValue({ store: null, setup_required: true });
    storeClient.saveSellerStore.mockRejectedValue(new CommerceClientError('Unauthorized', 401));

    renderBusinessPage();
    await waitForSetupForm();

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() =>
      expect(screen.getByText('Sign in again to save store setup.')).toBeInTheDocument(),
    );
    expect(screen.getByText('Could not complete setup')).toBeInTheDocument();
    expect(screen.queryByText('Unauthorized')).not.toBeInTheDocument();
  });
});
