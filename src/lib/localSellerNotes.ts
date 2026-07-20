import type { SellerOrderNote } from '@/types/agent';

const LOCAL_ORDER_NOTE_STORAGE_KEY = 'ondc-seller-ui-order-notes';

function readNotes(): Record<string, SellerOrderNote[]> {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return {};
  const raw = window.localStorage.getItem(LOCAL_ORDER_NOTE_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, SellerOrderNote[]>) : {};
  } catch {
    return {};
  }
}

function writeNotes(notes: Record<string, SellerOrderNote[]>) {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  window.localStorage.setItem(LOCAL_ORDER_NOTE_STORAGE_KEY, JSON.stringify(notes));
}

export function listSellerOrderNotes() {
  return readNotes();
}

export function listSellerOrderNotesForOrder(orderId: string) {
  return readNotes()[orderId] ?? [];
}

export function addSellerOrderNote(orderId: string, note: string, nextStep?: string) {
  const notes = readNotes();
  const entry: SellerOrderNote = {
    id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    order_id: orderId,
    note,
    next_step: nextStep,
    created_at: new Date().toISOString(),
  };
  notes[orderId] = [entry, ...(notes[orderId] ?? [])];
  writeNotes(notes);
  return entry;
}
