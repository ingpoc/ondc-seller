import type { ProductFormData } from '@/components/ProductForm';

const LOCAL_DRAFT_STORAGE_KEY = 'ondc-seller-agent-draft';

export interface SellerAgentDraftRecord {
  targetItemId: string | null;
  draft: ProductFormData;
  createdAt: string;
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function readSellerAgentDraft(): SellerAgentDraftRecord | null {
  if (!canUseStorage()) {
    return null;
  }

  const raw = window.localStorage.getItem(LOCAL_DRAFT_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as SellerAgentDraftRecord;
  } catch {
    return null;
  }
}

export function saveSellerAgentDraft(record: SellerAgentDraftRecord) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(LOCAL_DRAFT_STORAGE_KEY, JSON.stringify(record));
}

export function clearSellerAgentDraft() {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(LOCAL_DRAFT_STORAGE_KEY);
}
