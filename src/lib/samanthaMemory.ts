/**
 * Compact Seller Samantha ops prefs (per principal).
 * Tone / habit notes only — refund limits stay in AgentGuard mandate.
 */

export type SamanthaMemory = {
  likes: string[];
  dislikes: string[];
  preferences: string[];
  notes: string[];
  updatedAt: string;
};

const MAX_ITEMS = 8;

function storageKey(principalId: string | null | undefined): string {
  const id = encodeURIComponent((principalId || '').slice(0, 160));
  return `samantha-seller-memory:${id}`;
}

export function emptySamanthaMemory(): SamanthaMemory {
  return {
    likes: [],
    dislikes: [],
    preferences: [],
    notes: [],
    updatedAt: new Date().toISOString(),
  };
}

export function loadSamanthaMemory(principalId?: string | null): SamanthaMemory {
  if (!principalId?.trim()) return emptySamanthaMemory();
  try {
    const raw = localStorage.getItem(storageKey(principalId));
    if (!raw) return emptySamanthaMemory();
    const parsed = JSON.parse(raw) as Partial<SamanthaMemory>;
    return {
      likes: Array.isArray(parsed.likes) ? parsed.likes.slice(0, MAX_ITEMS) : [],
      dislikes: Array.isArray(parsed.dislikes) ? parsed.dislikes.slice(0, MAX_ITEMS) : [],
      preferences: Array.isArray(parsed.preferences) ? parsed.preferences.slice(0, MAX_ITEMS) : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes.slice(0, MAX_ITEMS) : [],
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return emptySamanthaMemory();
  }
}

export function loadSamanthaMemoryMerged(principalId?: string | null): SamanthaMemory {
  return loadSamanthaMemory(principalId);
}

export function saveSamanthaMemory(
  principalId: string | null | undefined,
  memory: SamanthaMemory,
): SamanthaMemory {
  const next: SamanthaMemory = {
    likes: memory.likes.slice(0, MAX_ITEMS),
    dislikes: memory.dislikes.slice(0, MAX_ITEMS),
    preferences: memory.preferences.slice(0, MAX_ITEMS),
    notes: memory.notes.slice(0, MAX_ITEMS),
    updatedAt: new Date().toISOString(),
  };
  if (principalId?.trim()) {
    localStorage.setItem(storageKey(principalId), JSON.stringify(next));
  }
  window.dispatchEvent(new CustomEvent('seller-samantha-memory-changed'));
  return next;
}

function pushUnique(list: string[], value: string): string[] {
  const v = value.trim();
  if (!v) return list;
  const lower = v.toLowerCase();
  const without = list.filter((x) => x.toLowerCase() !== lower);
  return [v, ...without].slice(0, MAX_ITEMS);
}

export function rememberSamanthaFact(
  principalId: string | null | undefined,
  kind: 'like' | 'dislike' | 'preference' | 'note',
  value: string,
): SamanthaMemory {
  const mem = loadSamanthaMemory(principalId);
  if (kind === 'like') mem.likes = pushUnique(mem.likes, value);
  if (kind === 'dislike') mem.dislikes = pushUnique(mem.dislikes, value);
  if (kind === 'preference') mem.preferences = pushUnique(mem.preferences, value);
  if (kind === 'note') mem.notes = pushUnique(mem.notes, value);
  return saveSamanthaMemory(principalId, mem);
}

export function formatMemoryForPrompt(memory: SamanthaMemory): string {
  const lines: string[] = [];
  if (memory.likes.length) lines.push(`Likes: ${memory.likes.join('; ')}`);
  if (memory.dislikes.length) lines.push(`Dislikes: ${memory.dislikes.join('; ')}`);
  if (memory.preferences.length) lines.push(`Preferences: ${memory.preferences.join('; ')}`);
  if (memory.notes.length) lines.push(`Notes: ${memory.notes.join('; ')}`);
  if (!lines.length) return 'No stored preferences yet.';
  return lines.join('\n');
}

export function memoryIsEmpty(memory: SamanthaMemory): boolean {
  return (
    memory.likes.length === 0 &&
    memory.dislikes.length === 0 &&
    memory.preferences.length === 0 &&
    memory.notes.length === 0
  );
}
