import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  ChatLayout,
  PageLayout,
  PageHeader,
  Textarea,
} from '@/components/seller-ui';
import { ArrowRight, Loader2 } from 'lucide-react';
import type { BecknItem, UCPOrder } from '@ondc-sdk/shared';
import { useAgentRuntime, useSubject, useTrustState } from '@/hooks';
import { TrustNotice } from '@/components/TrustStatus';
import {
  applySellerAgentEnvelope,
  buildSellerAgentSnapshot,
  extractSellerAgentEnvelope,
} from '@/lib/agentSellerState';
import type { SellerAgentAction, SellerAgentSnapshot } from '@/types/agent';
import { COMMERCE_DEMO_MODE, buildCommerceUrl } from '@/lib/commerceConfig';
import { getDemoCatalogItems } from '@/lib/mockCatalog';
import { listDemoSellerOrders } from '@/lib/localSellerOrders';

interface SellerChatMessage {
  role: 'user' | 'assistant' | 'system' | 'error';
  content: string;
  timestamp: number;
}

const SESSION_STORAGE_KEY = 'portfolio-agent-session-id:/api/agent/seller';
const SELLER_AGENT_UI_STATE_KEY = 'ondc-seller-agent-ui-state';

interface PersistedSellerAgentUiState {
  messages: SellerChatMessage[];
  latestSummary: string;
  latestActions: SellerAgentAction[];
  trustBlockReason: string | null;
}

function readPersistedUiState(): PersistedSellerAgentUiState {
  if (typeof window === 'undefined') {
    return {
      messages: [],
      latestSummary: '',
      latestActions: [],
      trustBlockReason: null,
    };
  }

  try {
    const raw = window.localStorage.getItem(SELLER_AGENT_UI_STATE_KEY);
    if (!raw) {
      return {
        messages: [],
        latestSummary: '',
        latestActions: [],
        trustBlockReason: null,
      };
    }

    const parsed = JSON.parse(raw) as Partial<PersistedSellerAgentUiState> | null;
    return {
      messages: Array.isArray(parsed?.messages) ? parsed.messages : [],
      latestSummary: typeof parsed?.latestSummary === 'string' ? parsed.latestSummary : '',
      latestActions: Array.isArray(parsed?.latestActions) ? (parsed.latestActions as SellerAgentAction[]) : [],
      trustBlockReason: typeof parsed?.trustBlockReason === 'string' ? parsed.trustBlockReason : null,
    };
  } catch {
    return {
      messages: [],
      latestSummary: '',
      latestActions: [],
      trustBlockReason: null,
    };
  }
}

function persistUiState(state: PersistedSellerAgentUiState) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(SELLER_AGENT_UI_STATE_KEY, JSON.stringify(state));
}

function getSessionId() {
  if (typeof window === 'undefined') {
    return 'session-ondc-seller';
  }

  const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const next = `session-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(SESSION_STORAGE_KEY, next);
  return next;
}

function describeAction(action: SellerAgentAction) {
  switch (action.type) {
    case 'catalog_patch':
      return `Catalog patch for ${action.target_item_id}`;
    case 'draft_listing_create':
      return `Draft listing created: ${action.draft.name || action.draft.id}`;
    case 'draft_listing_update':
      return `Draft update prepared for ${action.target_item_id ?? action.draft.id}`;
    case 'listing_quality_flag':
      return `${action.severity.toUpperCase()}: ${action.issue}`;
    case 'order_followup_note':
      return `Follow-up note added to ${action.order_id}`;
    case 'navigate':
      return `Navigate to ${action.path}`;
    case 'trust_required':
      return `Trust required: ${action.operation}`;
    case 'unsupported':
      return action.reason;
    default:
      return 'Agent action';
  }
}

function toneForAction(action: SellerAgentAction) {
  if (action.type === 'trust_required') return 'warning' as const;
  if (action.type === 'unsupported') return 'error' as const;
  if (action.type === 'listing_quality_flag') {
    return action.severity === 'critical' ? 'error' : action.severity === 'warning' ? 'warning' : 'info';
  }
  return 'info' as const;
}

async function processSellerStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  handlers: {
    onDelta: () => void;
    onResult: (content: string) => void;
    onError: (error: string) => void;
    onDone: () => void;
  },
) {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      handlers.onDone();
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data:')) {
        continue;
      }

      const data = line.replace(/^data:\s*/, '').trim();
      if (!data || data === '[DONE]') {
        continue;
      }

      try {
        const event = JSON.parse(data) as { type?: string; content?: string; error?: string };
        if (event.type === 'assistant_delta') {
          handlers.onDelta();
        } else if (event.type === 'result' && typeof event.content === 'string') {
          handlers.onResult(event.content);
        } else if (event.type === 'error' && typeof event.error === 'string') {
          handlers.onError(event.error);
        }
      } catch (error) {
        handlers.onError(error instanceof Error ? error.message : 'Failed to parse seller agent stream.');
      }
    }
  }
}

function SnapshotCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <Card className="space-y-2">
      <div className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--ui-text-muted)]">{label}</div>
      <div className="text-3xl font-bold tracking-[-0.04em] text-[var(--ui-text)]">{value}</div>
      <div className="text-sm text-[var(--ui-text-secondary)]">{helper}</div>
    </Card>
  );
}

function SnapshotPanel({ snapshot }: { snapshot: SellerAgentSnapshot }) {
  return (
    <div className="grid gap-4 lg:grid-cols-4">
      <SnapshotCard
        label="Catalog"
        value={String(snapshot.catalog.total_items)}
        helper={`${snapshot.diagnostics.length} listing diagnostics pending`}
      />
      <SnapshotCard
        label="Orders"
        value={String(snapshot.orders.total)}
        helper={`${snapshot.orders.pending} pending, ${snapshot.orders.accepted} accepted`}
      />
      <SnapshotCard
        label="Trust"
        value={snapshot.trust.write_enabled ? 'Verified' : 'Read-only'}
        helper={snapshot.trust.write_enabled ? 'Publish/edit actions enabled' : 'Drafting only until trust is verified'}
      />
      <SnapshotCard
        label="Config"
        value={snapshot.config.configured ? 'Ready' : 'Missing'}
        helper={snapshot.config.subscriber_id ?? 'Set seller subscriber details in Config'}
      />
    </div>
  );
}

export function AgentChatPage(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const { walletAddress, subjectId, authLoading } = useSubject();
  const trust = useTrustState(walletAddress);
  const runtime = useAgentRuntime(subjectId, walletAddress);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [messages, setMessages] = useState<SellerChatMessage[]>(() => readPersistedUiState().messages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [latestSummary, setLatestSummary] = useState(() => readPersistedUiState().latestSummary);
  const [latestActions, setLatestActions] = useState<SellerAgentAction[]>(() => readPersistedUiState().latestActions);
  const [trustBlockReason, setTrustBlockReason] = useState<string | null>(() => readPersistedUiState().trustBlockReason);
  const [catalogItems, setCatalogItems] = useState<BecknItem[] | null>(null);
  const [orderItems, setOrderItems] = useState<UCPOrder[] | null>(null);
  const sessionIdRef = useRef(getSessionId());
  const messagesRef = useRef(messages);
  const latestSummaryRef = useRef(latestSummary);
  const latestActionsRef = useRef(latestActions);
  const trustBlockReasonRef = useRef(trustBlockReason);

  const usageLabel =
    runtime.usage.requests_limit > 0
      ? `Usage ${runtime.usage.requests_used}/${runtime.usage.requests_limit}`
      : `${runtime.usage.requests_used} requests this period`;

  const snapshot = buildSellerAgentSnapshot({
    pathname: location.pathname,
    search: location.search,
    trustState: trust.state,
    catalogItems,
    orderItems,
  });

  const showAgent = Boolean(subjectId) && runtime.agent_access;

  const commitUiState = (next: PersistedSellerAgentUiState) => {
    messagesRef.current = next.messages;
    latestSummaryRef.current = next.latestSummary;
    latestActionsRef.current = next.latestActions;
    trustBlockReasonRef.current = next.trustBlockReason;
    setMessages(next.messages);
    setLatestSummary(next.latestSummary);
    setLatestActions(next.latestActions);
    setTrustBlockReason(next.trustBlockReason);
    persistUiState(next);
  };

  const sendMessage = async () => {
    const prompt = input.trim();
    if (!prompt || isLoading || !subjectId) {
      return;
    }

    const nextUserMessages: SellerChatMessage[] = [
      ...messagesRef.current,
      {
        role: 'user',
        content: prompt,
        timestamp: Date.now(),
      },
    ];
    commitUiState({
      messages: nextUserMessages,
      latestSummary: latestSummaryRef.current,
      latestActions: latestActionsRef.current,
      trustBlockReason: null,
    });
    setInput('');
    setIsLoading(true);
    setStreaming(false);
    setTrustBlockReason(null);

    try {
      const response = await fetch('/api/agent/seller', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': subjectId,
          ...(walletAddress ? { 'X-Wallet-Address': walletAddress } : {}),
        },
        body: JSON.stringify({
          prompt,
          sessionId: sessionIdRef.current,
          context: {
            seller_snapshot: snapshot,
            response_contract: 'seller_agent_v1',
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body returned by the seller agent.');
      }

      await processSellerStream(reader, {
        onDelta: () => setStreaming(true),
        onResult: (content) => {
          const envelope = extractSellerAgentEnvelope(content);
          if (!envelope) {
            commitUiState({
              messages: [
                ...messagesRef.current,
                {
                  role: 'assistant',
                  content,
                  timestamp: Date.now(),
                },
              ] as SellerChatMessage[],
              latestSummary: content,
              latestActions: [],
              trustBlockReason: null,
            });
            return;
          }

          const result = applySellerAgentEnvelope(envelope, trust.state);
          commitUiState({
            messages: [
              ...messagesRef.current,
              {
                role: 'assistant',
                content: result.summary,
                timestamp: Date.now(),
              },
            ] as SellerChatMessage[],
            latestSummary: result.summary,
            latestActions: result.actions,
            trustBlockReason: result.trustBlockReason,
          });
          setRefreshNonce((value) => value + 1);
          if (result.navigateTo) {
            navigate(result.navigateTo);
          }
        },
        onError: (error) => {
          commitUiState({
            messages: [
              ...messagesRef.current,
              {
                role: 'error',
                content: error,
                timestamp: Date.now(),
              },
            ] as SellerChatMessage[],
            latestSummary: latestSummaryRef.current,
            latestActions: latestActionsRef.current,
            trustBlockReason: trustBlockReasonRef.current,
          });
        },
        onDone: () => {
          setStreaming(false);
          setIsLoading(false);
        },
      });
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: 'error',
          content: error instanceof Error ? error.message : 'Seller agent request failed.',
          timestamp: Date.now(),
        },
      ]);
      setStreaming(false);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoading) {
      return;
    }

    const timer = globalThis.setTimeout(() => setStreaming(true), 300);
    return () => globalThis.clearTimeout(timer);
  }, [isLoading]);

  useEffect(() => {
    messagesRef.current = messages;
    latestSummaryRef.current = latestSummary;
    latestActionsRef.current = latestActions;
    trustBlockReasonRef.current = trustBlockReason;
    const existing = readPersistedUiState();
    persistUiState({
      messages: messages.length >= existing.messages.length ? messages : existing.messages,
      latestSummary: latestSummary || existing.latestSummary,
      latestActions: latestActions.length > 0 ? latestActions : existing.latestActions,
      trustBlockReason: trustBlockReason ?? existing.trustBlockReason,
    });
  }, [latestActions, latestSummary, messages, trustBlockReason]);

  useEffect(() => {
    let cancelled = false;

    const loadSnapshotSources = async () => {
      if (COMMERCE_DEMO_MODE) {
        if (!cancelled) {
          setCatalogItems(getDemoCatalogItems());
          setOrderItems(listDemoSellerOrders());
        }
        return;
      }

      try {
        const [catalogResponse, ordersResponse] = await Promise.all([
          fetch(buildCommerceUrl('/api/catalog'), { credentials: 'include' }),
          fetch(buildCommerceUrl('/api/seller/orders'), { credentials: 'include' }),
        ]);

        if (!cancelled) {
          if (catalogResponse.ok) {
            const catalogPayload = await catalogResponse.json();
            const nextCatalog = ((catalogPayload?.['bpp/providers']?.[0]?.items ?? []) as BecknItem[]);
            setCatalogItems(nextCatalog);
          } else {
            setCatalogItems(getDemoCatalogItems());
          }

          if (ordersResponse.ok) {
            const ordersPayload = await ordersResponse.json();
            setOrderItems((ordersPayload?.orders ?? []) as UCPOrder[]);
          } else {
            setOrderItems(listDemoSellerOrders());
          }
        }
      } catch {
        if (!cancelled) {
          setCatalogItems(getDemoCatalogItems());
          setOrderItems(listDemoSellerOrders());
        }
      }
    };

    void loadSnapshotSources();
    return () => {
      cancelled = true;
    };
  }, [refreshNonce]);

  return (
    <PageLayout>
      <PageHeader
        title="Seller Agent Operations Cockpit"
        subtitle="Run catalog review, draft listing updates, and seller ops triage from a trust-aware Claude control surface."
      />
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <Badge tone={runtime.runtime_available ? 'success' : 'warning'}>
            Runtime {runtime.auth_mode}
          </Badge>
          <Badge tone={trust.state === 'verified' ? 'success' : 'warning'}>
            {trust.state === 'verified' ? 'Verified seller writes enabled' : 'Read-only seller guidance'}
          </Badge>
          <Badge tone="info">{runtime.model}</Badge>
          <Badge tone="info">{usageLabel}</Badge>
        </div>

        {!subjectId && !authLoading ? (
          <Alert
            tone="warning"
            title="Authentication required"
            description="Sign in to AadhaarChain or connect a verified seller wallet before starting the seller agent."
          />
        ) : null}

        {subjectId && !runtime.runtime_available ? (
          <Alert
            tone="warning"
            title="Claude runtime unavailable"
            description={
              runtime.blocked_reason ??
              'Configure supported Claude Agent SDK auth or use the local Claude CLI dev adapter on localhost.'
            }
          />
        ) : null}

        {subjectId && runtime.agent_access && trust.state !== 'verified' ? (
          <TrustNotice
            state={trust.state}
            loading={trust.loading}
            error={trust.error}
            reason={trust.reason}
            actionLabel="Resolve trust in AadhaarChain"
          />
        ) : null}

        <SnapshotPanel snapshot={snapshot} />

        {showAgent ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(20rem,0.9fr)]">
            <ChatLayout
              title="Seller Agent"
              actions={<Badge tone="info">Session {sessionIdRef.current.slice(0, 8)}</Badge>}
              footer={
                <div className="space-y-2">
                  <div className="flex items-end gap-3">
                    <Textarea
                      value={input}
                      aria-label="Seller agent prompt"
                      name="seller-agent-prompt"
                      onChange={(event) => setInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          void sendMessage();
                        }
                      }}
                      placeholder="e.g., tighten the rice listing, queue a draft edit, and tell me what trust still blocks publishing"
                      className="min-h-[92px]"
                    />
                    <Button
                      type="button"
                      size="icon"
                      className="h-12 w-12 shrink-0"
                      onClick={() => void sendMessage()}
                      disabled={!input.trim() || isLoading}
                      aria-label={isLoading ? 'Seller agent is responding' : 'Send seller agent prompt'}
                    >
                      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              }
            >
              <div className="space-y-3">
                {messages.length === 0 ? (
                  <Card className="bg-secondary/60">
                    <div className="text-sm text-[var(--ui-text-secondary)]">
                      Start with a concrete seller task such as improving a listing, drafting a new catalog entry, or adding a follow-up note to an order.
                    </div>
                  </Card>
                ) : null}

                {messages.map((message, index) => (
                  <Card
                    key={`${message.timestamp}-${index}`}
                    className={
                      message.role === 'user'
                        ? 'ml-auto max-w-[80%] bg-primary/10'
                        : message.role === 'error'
                          ? 'border-destructive/20 bg-destructive/5'
                          : 'max-w-[88%]'
                    }
                  >
                    <div className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--ui-text-muted)]">
                      {message.role === 'user' ? 'You' : message.role === 'error' ? 'Error' : 'Seller agent'}
                    </div>
                    <div className="whitespace-pre-wrap text-sm text-[var(--ui-text)]">{message.content}</div>
                  </Card>
                ))}

                {streaming ? (
                  <Card className="max-w-[88%]">
                    <div className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--ui-text-muted)]">
                      Seller agent
                    </div>
                    <div className="flex items-center gap-2 text-sm text-[var(--ui-text-secondary)]">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Reasoning across catalog, trust, orders, and config state...
                    </div>
                  </Card>
                ) : null}
              </div>
            </ChatLayout>

            <div className="space-y-4">
              {trustBlockReason ? (
                <Alert
                  tone="warning"
                  title="Trust still blocks execution"
                  description={trustBlockReason}
                />
              ) : null}

              <Card className="space-y-3">
                <div className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--ui-text-muted)]">
                  Latest agent brief
                </div>
                <div className="text-sm text-[var(--ui-text)]">
                  {latestSummary || 'The seller agent summary will appear here after the first action run.'}
                </div>
              </Card>

              <Card className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--ui-text-muted)]">
                    Pending actions
                  </div>
                  <Badge tone="info">{latestActions.length}</Badge>
                </div>
                {latestActions.length === 0 ? (
                  <div className="text-sm text-[var(--ui-text-secondary)]">
                    No structured seller actions have been returned yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {latestActions.map((action, index) => (
                      <div
                        key={`${action.type}-${index}`}
                        className="rounded-[var(--ui-radius-md)] border border-[var(--ui-border)] p-4"
                      >
                        <div className="mb-2 flex flex-wrap gap-2">
                          <Badge tone={toneForAction(action)}>{action.type}</Badge>
                        </div>
                        <div className="text-sm text-[var(--ui-text)]">{describeAction(action)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card className="space-y-3">
                <div className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--ui-text-muted)]">
                  Listing diagnostics
                </div>
                <div className="space-y-3">
                  {snapshot.diagnostics.slice(0, 4).map((diagnostic) => (
                    <div key={`${diagnostic.item_id}-${diagnostic.title}`} className="rounded-[var(--ui-radius-md)] border border-[var(--ui-border)] p-4">
                      <div className="mb-2 flex flex-wrap gap-2">
                        <Badge tone={diagnostic.severity === 'critical' ? 'error' : diagnostic.severity === 'warning' ? 'warning' : 'info'}>
                          {diagnostic.severity}
                        </Badge>
                        <Badge tone="info">{diagnostic.item_id}</Badge>
                      </div>
                      <div className="text-sm font-semibold text-[var(--ui-text)]">{diagnostic.title}</div>
                      <div className="mt-1 text-sm text-[var(--ui-text-secondary)]">{diagnostic.detail}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        ) : null}
      </div>
    </PageLayout>
  );
}
