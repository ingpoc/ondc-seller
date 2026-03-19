import type { BecknItem, UCPOrder } from '@ondc-sdk/shared';
import type { ProductFormData } from '@/components/ProductForm';
import { getDemoCatalogItems, upsertDemoCatalogItem } from './mockCatalog';
import { getLocalSellerConfigSummary } from './localSellerConfig';
import { clearSellerAgentDraft, readSellerAgentDraft, saveSellerAgentDraft } from './localSellerDraft';
import {
  addSellerOrderNote,
  listDemoSellerOrders,
  listSellerOrderNotes,
} from './localSellerOrders';
import type {
  SellerAgentAction,
  SellerAgentPatchResult,
  SellerAgentResponseEnvelope,
  SellerAgentSnapshot,
  SellerCatalogDiagnostic,
  SellerOrderSummary,
} from '@/types/agent';
import type { PortfolioTrustState } from './trust';

function safeString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function safeRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function optionalString(value: unknown) {
  const normalized = safeString(value);
  return normalized || undefined;
}

function parsePriceNumber(value: string | undefined) {
  const numeric = Number.parseFloat(value ?? '0');
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatAmount(currency: string | undefined, value: string | undefined) {
  const normalizedCurrency = currency || 'INR';
  return `${normalizedCurrency} ${parsePriceNumber(value).toFixed(2)}`;
}

function parseCurrencyAndValue(raw: unknown, fallbackCurrency = 'INR', fallbackValue = '0.00') {
  if (typeof raw !== 'string') {
    return { currency: fallbackCurrency, value: fallbackValue };
  }

  const match = raw.trim().match(/^([A-Z]{3})\s+([0-9]+(?:\.[0-9]+)?)$/);
  if (!match) {
    return { currency: fallbackCurrency, value: fallbackValue };
  }

  return {
    currency: match[1],
    value: match[2],
  };
}

export function buildSellerDiagnostics(items: BecknItem[]): SellerCatalogDiagnostic[] {
  return items.flatMap((item) => {
    const diagnostics: SellerCatalogDiagnostic[] = [];
    const name = item.descriptor?.name ?? item.name ?? item.id;
    const description = safeString(item.descriptor?.short_desc ?? item.description);
    const hasImage = Boolean(item.images?.[0]?.url);
    const priceValue = parsePriceNumber(item.price?.value);

    if (!description) {
      diagnostics.push({
        item_id: item.id,
        title: `${name} is missing a short description`,
        severity: 'warning',
        detail: 'Add a concise benefit-led summary so verified buyers can compare the listing quickly.',
      });
    }

    if (!hasImage) {
      diagnostics.push({
        item_id: item.id,
        title: `${name} has no hero image`,
        severity: 'warning',
        detail: 'Catalog cards perform better when they have at least one product image.',
      });
    }

    if (priceValue <= 0) {
      diagnostics.push({
        item_id: item.id,
        title: `${name} has an invalid price`,
        severity: 'critical',
        detail: 'Set a positive price before the listing is ready for publication.',
      });
    }

    return diagnostics;
  });
}

function summarizeOrders(orders: UCPOrder[]): SellerOrderSummary {
  const notes = listSellerOrderNotes();

  return {
    total: orders.length,
    pending: orders.filter((order) => order.status === 'created').length,
    accepted: orders.filter((order) => ['accepted', 'packed', 'in_progress'].includes(order.status)).length,
    dispatched: orders.filter((order) => ['shipped', 'out_for_delivery'].includes(order.status)).length,
    completed: orders.filter((order) => order.status === 'delivered').length,
    cancelled: orders.filter((order) => ['cancelled', 'returned'].includes(order.status)).length,
    items: orders.map((order) => ({
      id: order.id,
      status: order.status,
      buyer_name: order.buyer?.name ?? 'Unknown buyer',
      total: formatAmount(order.quote?.total?.currency, order.quote?.total?.value),
      note_count: (notes[order.id] ?? []).length,
    })),
  };
}

export function buildSellerAgentSnapshot({
  pathname,
  search,
  trustState,
  catalogItems,
  orderItems,
}: {
  pathname: string;
  search: string;
  trustState: PortfolioTrustState;
  catalogItems?: BecknItem[] | null;
  orderItems?: UCPOrder[] | null;
}): SellerAgentSnapshot {
  const catalog = catalogItems ?? getDemoCatalogItems();
  const pendingDraft = readSellerAgentDraft()?.draft ?? null;
  const orders = orderItems ?? listDemoSellerOrders();

  return {
    route: {
      path: pathname,
      search,
    },
    trust: {
      state: trustState,
      write_enabled: trustState === 'verified',
    },
    catalog: {
      total_items: catalog.length,
      items: catalog.map((item) => ({
        id: item.id,
        name: item.descriptor?.name ?? item.name ?? item.id,
        description: safeString(item.descriptor?.short_desc ?? item.description, 'No short description'),
        category: safeString(item.category_id ?? item.category?.name, 'General'),
        price: formatAmount(item.price?.currency, item.price?.value),
        has_image: Boolean(item.images?.[0]?.url),
      })),
    },
    diagnostics: buildSellerDiagnostics(catalog),
    orders: summarizeOrders(orders),
    config: getLocalSellerConfigSummary(),
    pending_draft: pendingDraft,
  };
}

function toDraftFormData(itemId: string, existingItem?: BecknItem | null): ProductFormData {
  return {
    id: itemId,
    name: existingItem?.descriptor?.name ?? existingItem?.name ?? '',
    description: existingItem?.descriptor?.short_desc ?? existingItem?.description ?? '',
    price: existingItem?.price?.value ?? '',
    currency: existingItem?.price?.currency ?? 'INR',
    categoryId: existingItem?.category_id ?? 'cat-1',
  };
}

function applyCatalogPatch(base: BecknItem | null, action: Extract<SellerAgentAction, { type: 'catalog_patch' }>): BecknItem {
  const currency = action.patch.currency ?? base?.price?.currency ?? 'INR';
  const nextName = action.patch.name ?? base?.descriptor?.name ?? base?.name ?? action.target_item_id;
  const nextDescription =
    action.patch.description ??
    base?.descriptor?.short_desc ??
    base?.description ??
    '';
  const nextCategory = action.patch.category_id ?? base?.category_id ?? 'cat-1';
  const nextImage = action.patch.image_url ?? base?.images?.[0]?.url ?? '';

  return {
    id: base?.id ?? action.target_item_id,
    name: nextName,
    description: nextDescription,
    descriptor: {
      name: nextName,
      short_desc: nextDescription,
    },
    price: {
      currency,
      value: action.patch.price ?? base?.price?.value ?? '0.00',
    },
    images: nextImage ? [{ url: nextImage }] : [],
    category: {
      name: nextCategory,
    },
    category_id: nextCategory,
  };
}

function normalizeEnvelope(payload: unknown): SellerAgentResponseEnvelope | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.summary !== 'string' || !Array.isArray(candidate.actions)) {
    return null;
  }

  const normalizedActions = candidate.actions
    .map((entry) => normalizeSellerAction(entry))
    .filter((entry): entry is SellerAgentAction => entry !== null);

  return {
    summary: candidate.summary,
    actions: normalizedActions,
  };
}

function normalizeCatalogPatchAction(candidate: Record<string, unknown>) {
  const targetItemId = safeString(candidate.target_item_id ?? candidate.item_id);
  if (!targetItemId) {
    return null;
  }

  const nestedPatch = safeRecord(candidate.patch);
  const patchSource = nestedPatch ?? candidate;
  const field = safeString(candidate.field);
  const fieldValue = safeString(candidate.value);
  const fieldPatch =
    field && fieldValue
      ? field === 'price'
        ? parseCurrencyAndValue(fieldValue, safeString(candidate.currency, 'INR'), '')
        : null
      : null;
  const parsedPrice = parseCurrencyAndValue(
    field === 'price' && fieldPatch ? fieldValue : patchSource.price,
    safeString(patchSource.currency, 'INR'),
    '',
  );
  const normalizedPatch = {
    name: field === 'name' ? (fieldValue || undefined) : optionalString(patchSource.name ?? patchSource.title),
    description: field === 'description' ? (fieldValue || undefined) : optionalString(patchSource.description),
    price: field === 'price' ? (fieldPatch?.value ?? undefined) : (parsedPrice.value || undefined),
    currency: field === 'price' ? (fieldPatch?.currency ?? undefined) : (parsedPrice.currency || undefined),
    category_id: field === 'category' || field === 'category_id'
      ? (fieldValue || undefined)
      : optionalString(patchSource.category_id ?? patchSource.category),
    image_url: field === 'image_url' || field === 'hero_image'
      ? (fieldValue || undefined)
      : optionalString(patchSource.image_url ?? patchSource.hero_image),
  };

  if (
    !normalizedPatch.name &&
    !normalizedPatch.description &&
    !normalizedPatch.price &&
    !normalizedPatch.category_id &&
    !normalizedPatch.image_url
  ) {
    return null;
  }

  return {
    type: 'catalog_patch' as const,
    target_item_id: targetItemId,
    reason: safeString(candidate.reason ?? candidate.detail, 'Catalog update requested.'),
    patch: normalizedPatch,
  };
}

function normalizeDraftListingAction(
  candidate: Record<string, unknown>,
  type: 'draft_listing_create' | 'draft_listing_update',
) {
  const explicitDraft = safeRecord(candidate.draft);
  const fieldsToReview = safeRecord(candidate.fields_to_review);
  const targetItemId = safeString(candidate.target_item_id ?? candidate.item_id ?? explicitDraft?.id);
  const existingItem = targetItemId
    ? getDemoCatalogItems().find((item) => item.id === targetItemId) ?? null
    : null;
  const baseDraft = toDraftFormData(targetItemId || explicitDraft?.id ? safeString(targetItemId || explicitDraft?.id) : `item-${Date.now()}`, existingItem);
  const parsedPrice = parseCurrencyAndValue(
    explicitDraft?.price ?? fieldsToReview?.price,
    explicitDraft?.currency ? safeString(explicitDraft.currency, baseDraft.currency) : baseDraft.currency,
    baseDraft.price || '0.00',
  );

  const guidance = safeString(candidate.guidance);
  const reviewedDescription = safeString(explicitDraft?.description ?? fieldsToReview?.description);
  const nextDescription =
    reviewedDescription ||
    (guidance ? `${baseDraft.description ? `${baseDraft.description}\n\n` : ''}Review note: ${guidance}` : baseDraft.description);

  return {
    type,
    reason: safeString(candidate.reason ?? candidate.guidance, 'Draft review requested.'),
    target_item_id: targetItemId || undefined,
    draft: {
      id: safeString(explicitDraft?.id ?? targetItemId, baseDraft.id),
      name: safeString(explicitDraft?.name ?? candidate.title, baseDraft.name),
      description: nextDescription,
      price: parsedPrice.value,
      currency: parsedPrice.currency,
      categoryId: safeString(explicitDraft?.categoryId ?? fieldsToReview?.category, baseDraft.categoryId),
    },
  };
}

function normalizeListingQualityFlagAction(candidate: Record<string, unknown>) {
  const itemId = safeString(candidate.item_id ?? candidate.target_item_id);
  if (!itemId) {
    return null;
  }

  const severity = safeString(candidate.severity, 'warning');
  const normalizedSeverity: 'info' | 'warning' | 'critical' =
    severity === 'critical' || severity === 'info' || severity === 'warning'
      ? severity
      : 'warning';
  return {
    type: 'listing_quality_flag' as const,
    item_id: itemId,
    severity: normalizedSeverity,
    issue: safeString(candidate.issue ?? candidate.title, 'Listing quality issue'),
    recommendation: safeString(candidate.recommendation ?? candidate.guidance ?? candidate.detail, 'Review the listing before publishing.'),
  };
}

function normalizeOrderFollowupNoteAction(candidate: Record<string, unknown>) {
  const orderId = safeString(candidate.order_id);
  if (!orderId) {
    return null;
  }

  return {
    type: 'order_followup_note' as const,
    order_id: orderId,
    note: safeString(candidate.note ?? candidate.summary, 'Follow up on this order.'),
    next_step: safeString(candidate.next_step),
  };
}

function normalizeNavigateAction(candidate: Record<string, unknown>) {
  const path = safeString(candidate.path);
  if (!path) {
    return null;
  }

  return {
    type: 'navigate' as const,
    path,
    reason: safeString(candidate.reason ?? candidate.detail, 'Route handoff requested.'),
  };
}

function normalizeTrustRequiredAction(candidate: Record<string, unknown>) {
  return {
    type: 'trust_required' as const,
    operation: safeString(candidate.operation ?? candidate.blocker ?? candidate.reason, 'seller_publish'),
    reason: safeString(
      candidate.detail ?? candidate.impact ?? candidate.blocker ?? candidate.reason,
      'Trust verification is required before higher-trust seller actions can execute.',
    ),
    suggested_path: safeString(candidate.suggested_path),
  };
}

function normalizeUnsupportedAction(candidate: Record<string, unknown>) {
  return {
    type: 'unsupported' as const,
    reason: safeString(candidate.reason ?? candidate.detail, 'The seller agent could not apply this request safely.'),
  };
}

function normalizeSellerAction(entry: unknown): SellerAgentAction | null {
  const candidate = safeRecord(entry);
  if (!candidate) {
    return null;
  }

  const type = safeString(candidate.type);
  if (type === 'catalog_patch') return normalizeCatalogPatchAction(candidate);
  if (type === 'draft_listing_create') return normalizeDraftListingAction(candidate, 'draft_listing_create');
  if (type === 'draft_listing_update') return normalizeDraftListingAction(candidate, 'draft_listing_update');
  if (type === 'listing_quality_flag') return normalizeListingQualityFlagAction(candidate);
  if (type === 'order_followup_note') return normalizeOrderFollowupNoteAction(candidate);
  if (type === 'navigate') return normalizeNavigateAction(candidate);
  if (type === 'trust_required') return normalizeTrustRequiredAction(candidate);
  if (type === 'unsupported') return normalizeUnsupportedAction(candidate);
  return null;
}

export function extractSellerAgentEnvelope(rawContent: string): SellerAgentResponseEnvelope | null {
  const trimmed = rawContent.trim();
  if (!trimmed) {
    return null;
  }

  const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1] ?? trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    return normalizeEnvelope(JSON.parse(candidate.slice(start, end + 1)));
  } catch {
    return null;
  }
}

export function applySellerAgentEnvelope(
  envelope: SellerAgentResponseEnvelope,
  trustState: PortfolioTrustState,
): SellerAgentPatchResult {
  const nextCatalog = getDemoCatalogItems();
  const flagDiagnostics: SellerCatalogDiagnostic[] = [];
  let navigateTo: string | null = null;
  let trustBlockReason: string | null = null;

  for (const action of envelope.actions) {
    if (action.type === 'catalog_patch') {
      if (trustState !== 'verified') {
        trustBlockReason = 'Publishing catalog changes still requires verified seller trust in AadhaarChain.';
        continue;
      }

      const current = nextCatalog.find((item) => item.id === action.target_item_id) ?? null;
      const patched = applyCatalogPatch(current, action);
      const existingIndex = nextCatalog.findIndex((item) => item.id === patched.id);
      if (existingIndex >= 0) {
        nextCatalog[existingIndex] = patched;
      } else {
        nextCatalog.unshift(patched);
      }
      upsertDemoCatalogItem(patched);
      continue;
    }

    if (action.type === 'draft_listing_create' || action.type === 'draft_listing_update') {
      saveSellerAgentDraft({
        targetItemId: action.type === 'draft_listing_update' ? (action.target_item_id ?? action.draft.id) : null,
        draft: action.draft,
        createdAt: new Date().toISOString(),
      });
      navigateTo =
        action.type === 'draft_listing_create'
          ? '/catalog/new?draft=agent'
          : `/catalog/${encodeURIComponent(action.target_item_id ?? action.draft.id)}?draft=agent`;
      continue;
    }

    if (action.type === 'listing_quality_flag') {
      flagDiagnostics.push({
        item_id: action.item_id,
        title: action.issue,
        severity: action.severity,
        detail: action.recommendation,
      });
      continue;
    }

    if (action.type === 'order_followup_note') {
      addSellerOrderNote(action.order_id, action.note, action.next_step);
      continue;
    }

    if (action.type === 'navigate') {
      navigateTo = action.path;
      continue;
    }

    if (action.type === 'trust_required') {
      trustBlockReason = action.reason;
      if (action.suggested_path) {
        navigateTo = action.suggested_path;
      }
      continue;
    }
  }

  const pendingDraft = readSellerAgentDraft()?.draft ?? null;
  return {
    summary: envelope.summary,
    actions: envelope.actions,
    catalog: nextCatalog,
    diagnostics: [...buildSellerDiagnostics(nextCatalog), ...flagDiagnostics],
    pendingDraft,
    orderNotes: listSellerOrderNotes(),
    navigateTo,
    trustBlockReason,
  };
}

export function clearConsumedSellerDraft(targetItemId?: string | null) {
  const draft = readSellerAgentDraft();
  if (!draft) {
    return;
  }

  if (!targetItemId || draft.targetItemId === targetItemId || (!draft.targetItemId && targetItemId === null)) {
    clearSellerAgentDraft();
  }
}

export function getDraftFormDataForRoute({
  isNew,
  itemId,
}: {
  isNew: boolean;
  itemId: string | null;
}) {
  const draft = readSellerAgentDraft();
  if (!draft) {
    return null;
  }

  if (isNew && draft.targetItemId === null) {
    return draft.draft;
  }

  if (!isNew && itemId && draft.targetItemId === itemId) {
    return draft.draft;
  }

  return null;
}

export function buildDraftFromCatalogItem(itemId: string) {
  const existing = getDemoCatalogItems().find((item) => item.id === itemId) ?? null;
  return toDraftFormData(itemId, existing);
}
