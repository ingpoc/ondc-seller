import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentGuardPage } from './AgentGuardPage';

const agentClient = vi.hoisted(() => ({
  ensureAgentGuard: vi.fn(),
  fetchAgentGuardStatus: vi.fn(),
  compileMandate: vi.fn(),
  confirmMandate: vi.fn(),
  executeProtectedAction: vi.fn(),
  pauseAgent: vi.fn(),
  resumeAgent: vi.fn(),
}));

vi.mock('@/hooks', () => ({
  useSubject: () => ({
    subjectId: 'principal:seller:test',
    principalId: 'principal:seller:test',
    walletAddress: null,
    authLoading: false,
  }),
  useTrustState: () => ({
    state: 'verified',
    loading: false,
    error: null,
    reason: null,
  }),
}));

vi.mock('@/lib/agentGuardClient', () => agentClient);

const activeAgent = {
  agent_id: 'agent_test',
  principal_id: 'principal:seller:test',
  role: 'seller' as const,
  status: 'active' as const,
};

const activeMandate = {
  mandate_id: 'mandate_test',
  principal_id: 'principal:seller:test',
  agent_id: 'agent_test',
  role: 'seller' as const,
  template: 'seller_ops_v1' as const,
  status: 'active' as const,
  version: 1,
  allowed_actions: ['seller.refund.issue'] as const,
  limits: { auto_approve_max_inr: { 'seller.refund.issue': 5000 } },
  created_at: '2026-07-17T00:00:00Z',
  confirmed_at: '2026-07-17T00:00:00Z',
};

describe('AgentGuardPage authority state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    agentClient.ensureAgentGuard.mockResolvedValue({
      agent: activeAgent,
      mandate: activeMandate,
      policy: {},
    });
    agentClient.fetchAgentGuardStatus.mockResolvedValue({
      agent: null,
      mandate: null,
      policy: null,
      receipts: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the ensured active authority when the follow-up status read is empty', async () => {
    render(
      <MemoryRouter initialEntries={['/agentguard']}>
        <AgentGuardPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByTestId('agentguard-status')).toHaveTextContent('active'));
    expect(screen.getByTestId('agentguard-mandate-status')).toHaveTextContent('active');
    expect(screen.getByTestId('agentguard-policy')).toHaveTextContent(
      'it executes immediately',
    );
    expect(screen.getByRole('button', { name: 'Save authority changes' })).toBeEnabled();
    expect(screen.queryByText('template ready')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Current authority' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Samantha memory' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Receipts (PII-free)' })).toBeInTheDocument();
    expect(screen.getByText(/Samantha is your Seller operations assistant/)).toHaveTextContent(
      'AgentGuard checks every action independently',
    );
    expect(screen.getByTestId('agentguard-pause')).toHaveAccessibleDescription(
      /Pausing stops Samantha from executing protected catalog, order, fulfilment, and refund actions/,
    );
    expect(screen.getByTestId('agentguard-pause')).toHaveAccessibleDescription(
      /saved permissions remain/,
    );
  });

  it('withholds authority controls until the current agent and mandate load', () => {
    agentClient.ensureAgentGuard.mockReturnValue(new Promise(() => undefined));
    agentClient.fetchAgentGuardStatus.mockReturnValue(new Promise(() => undefined));

    render(
      <MemoryRouter initialEntries={['/agentguard']}>
        <AgentGuardPage />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('agentguard-loading-state')).toHaveTextContent(
      'Loading current authority',
    );
    expect(screen.getByTestId('agentguard-loading-state')).toHaveTextContent(
      'Protected controls remain unavailable',
    );
    expect(screen.queryByTestId('agentguard-refund-max-input')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activate authority' })).not.toBeInTheDocument();
  });

  it('names memory removal precisely and confirms the scope before clearing all memory', async () => {
    localStorage.setItem(
      'samantha-seller-memory:principal%3Aseller%3Atest',
      JSON.stringify({
        likes: [],
        dislikes: [],
        preferences: ['Use short refund confirmations'],
        notes: [],
        updatedAt: '2026-07-17T00:00:00Z',
      }),
    );
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/agentguard']}>
        <AgentGuardPage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'Remove preferences “Use short refund confirmations” from Samantha memory',
        }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/Saved only for this signed-in seller/)).toHaveTextContent(
      'does not change catalog, orders, or AgentGuard authority',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Clear all Samantha memory' }));
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining('Catalog, orders, and AgentGuard authority will not change.'),
    );
    expect(
      screen.getByRole('button', {
        name: 'Remove preferences “Use short refund confirmations” from Samantha memory',
      }),
    ).toBeInTheDocument();

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Clear all Samantha memory' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('button', {
          name: 'Remove preferences “Use short refund confirmations” from Samantha memory',
        }),
      ).not.toBeInTheDocument(),
    );
  });
});
