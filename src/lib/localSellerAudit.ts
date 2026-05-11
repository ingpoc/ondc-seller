import type { PortfolioTrustState } from './trust';
import type { SellerActionAuditEvent } from '@/types/agent';

const LOCAL_SELLER_AUDIT_STORAGE_KEY = 'ondc-seller-action-audit';

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readAuditEvents(): SellerActionAuditEvent[] {
  if (!canUseStorage()) {
    return [];
  }

  const raw = window.localStorage.getItem(LOCAL_SELLER_AUDIT_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SellerActionAuditEvent[]) : [];
  } catch {
    return [];
  }
}

function writeAuditEvents(events: SellerActionAuditEvent[]) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(LOCAL_SELLER_AUDIT_STORAGE_KEY, JSON.stringify(events));
}

export function listSellerActionAuditEvents() {
  return readAuditEvents();
}

export function clearSellerActionAuditEvents() {
  writeAuditEvents([]);
}

export function recordSellerActionAuditEvent({
  action,
  targetId,
  walletAddress,
  subjectId,
  sessionId,
  trustState,
  outcome,
  reason,
}: {
  action: SellerActionAuditEvent['action'];
  targetId: string;
  walletAddress?: string | null;
  subjectId?: string | null;
  sessionId?: string | null;
  trustState: PortfolioTrustState;
  outcome: SellerActionAuditEvent['outcome'];
  reason: string;
}) {
  const event: SellerActionAuditEvent = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action,
    target_id: targetId,
    wallet_address: walletAddress ?? null,
    subject_id: subjectId ?? null,
    session_id: sessionId ?? null,
    trust_state: trustState,
    outcome,
    reason,
    created_at: new Date().toISOString(),
  };

  writeAuditEvents([event, ...readAuditEvents()]);
  return event;
}
