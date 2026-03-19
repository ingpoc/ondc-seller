import { beforeEach, describe, expect, it } from 'vitest';
import {
  applySellerAgentEnvelope,
  buildSellerAgentSnapshot,
  extractSellerAgentEnvelope,
} from './agentSellerState';
import { clearSellerAgentDraft, readSellerAgentDraft } from './localSellerDraft';
import { getDemoCatalogItems, saveDemoCatalogItems } from './mockCatalog';
import { listSellerOrderNotesForOrder } from './localSellerOrders';

describe('agentSellerState', () => {
  beforeEach(() => {
    window.localStorage.clear();
    saveDemoCatalogItems(getDemoCatalogItems());
    clearSellerAgentDraft();
  });

  it('extracts a structured seller envelope from json content', () => {
    const envelope = extractSellerAgentEnvelope(
      JSON.stringify({
        summary: 'Prepared a safer draft and a config handoff.',
        actions: [
          {
            type: 'draft_listing_create',
            reason: 'Need a reviewable draft',
            draft: {
              id: 'draft-item',
              name: 'Fresh Mangoes',
              description: 'New crop with verified source farms.',
              price: '450.00',
              currency: 'INR',
              categoryId: 'cat-1',
            },
          },
        ],
      }),
    );

    expect(envelope?.summary).toContain('safer draft');
    expect(envelope?.actions).toHaveLength(1);
    expect(envelope?.actions[0]?.type).toBe('draft_listing_create');
  });

  it('normalizes seller draft and trust actions from fallback agent payloads', () => {
    const envelope = extractSellerAgentEnvelope(
      JSON.stringify({
        summary: 'Cold Pressed Mustard Oil needs a hero image. Draft created for review. Identity verification required to publish.',
        actions: [
          {
            type: 'draft_listing_update',
            item_id: 'demo-cold-pressed-oil',
            title: 'Cold Pressed Mustard Oil 1L',
            fields_to_review: {
              hero_image: 'MISSING - Add primary product image',
              description: 'Highlight cold-pressed extraction and use case.',
              category: 'Pantry',
              price: 'INR 285.00',
            },
            guidance: 'Upload a front-facing image before publication.',
          },
          {
            type: 'trust_required',
            reason: 'no_identity',
            detail: 'Identity verification is not yet complete. You can draft and review, but cannot publish or edit live.',
          },
        ],
      }),
    );

    expect(envelope?.actions).toHaveLength(2);
    expect(envelope?.actions[0]).toMatchObject({
      type: 'draft_listing_update',
      target_item_id: 'demo-cold-pressed-oil',
      draft: {
        id: 'demo-cold-pressed-oil',
        categoryId: 'Pantry',
        price: '285.00',
        currency: 'INR',
      },
    });
    expect(envelope?.actions[1]).toMatchObject({
      type: 'trust_required',
      operation: 'no_identity',
    });
  });

  it('normalizes flat catalog patch payloads from verified seller responses', () => {
    const envelope = extractSellerAgentEnvelope(
      [
        '```json',
        JSON.stringify(
          {
            summary: 'Listing updated directly.',
            actions: [
              {
                type: 'catalog_patch',
                item_id: 'demo-cold-pressed-oil',
                description: 'Cold-pressed mustard oil with a sharp aroma and small-batch sourcing.',
                price: 'INR 299.00',
              },
            ],
          },
          null,
          2,
        ),
        '```',
        '',
        'Applied live catalog edit.',
      ].join('\n'),
    );

    expect(envelope?.actions).toHaveLength(1);
    expect(envelope?.actions[0]).toMatchObject({
      type: 'catalog_patch',
      target_item_id: 'demo-cold-pressed-oil',
      patch: {
        description: 'Cold-pressed mustard oil with a sharp aroma and small-batch sourcing.',
        price: '299.00',
        currency: 'INR',
      },
    });
  });

  it('normalizes field/value catalog patch actions from verified seller responses', () => {
    const envelope = extractSellerAgentEnvelope(
      [
        '```json',
        JSON.stringify(
          {
            summary: 'Listing updated directly.',
            actions: [
              {
                type: 'catalog_patch',
                item_id: 'demo-cold-pressed-oil',
                field: 'description',
                value: 'Cold-pressed mustard oil with a sharp aroma and small-batch sourcing.',
              },
              {
                type: 'catalog_patch',
                item_id: 'demo-cold-pressed-oil',
                field: 'price',
                value: 'INR 299.00',
              },
            ],
          },
          null,
          2,
        ),
        '```',
      ].join('\n'),
    );

    expect(envelope?.actions).toHaveLength(2);
    expect(envelope?.actions[0]).toMatchObject({
      type: 'catalog_patch',
      target_item_id: 'demo-cold-pressed-oil',
      patch: {
        description: 'Cold-pressed mustard oil with a sharp aroma and small-batch sourcing.',
      },
    });
    expect(envelope?.actions[1]).toMatchObject({
      type: 'catalog_patch',
      target_item_id: 'demo-cold-pressed-oil',
      patch: {
        price: '299.00',
        currency: 'INR',
      },
    });
  });

  it('applies seller actions to local draft and notes state', () => {
    const result = applySellerAgentEnvelope(
      {
        summary: 'Queued a draft and added an order note.',
        actions: [
          {
            type: 'draft_listing_update',
            reason: 'Tighten the hero copy before publication.',
            target_item_id: 'demo-basmati-rice',
            draft: {
              id: 'demo-basmati-rice',
              name: 'Basmati Rice 5kg',
              description: 'Verified farm source with premium grain length.',
              price: '640.00',
              currency: 'INR',
              categoryId: 'cat-1',
            },
          },
          {
            type: 'order_followup_note',
            order_id: 'seller-demo-1001',
            note: 'Call the buyer before dispatch to confirm delivery slot.',
            next_step: 'Reach out within 30 minutes.',
          },
        ],
      },
      'identity_present_unverified',
    );

    expect(result.summary).toContain('Queued a draft');
    expect(result.navigateTo).toBe('/catalog/demo-basmati-rice?draft=agent');
    expect(readSellerAgentDraft()?.draft.description).toContain('Verified farm source');
    expect(listSellerOrderNotesForOrder('seller-demo-1001')[0]?.note).toContain('confirm delivery slot');
  });

  it('blocks direct catalog patches when seller trust is not verified', () => {
    const beforeDescription = getDemoCatalogItems()[0]?.descriptor?.short_desc;
    const result = applySellerAgentEnvelope(
      {
        summary: 'Tried to push a live catalog edit.',
        actions: [
          {
            type: 'catalog_patch',
            target_item_id: 'demo-basmati-rice',
            reason: 'Improve conversion for a top listing',
            patch: {
              description: 'This should not be applied without verified trust.',
            },
          },
        ],
      },
      'identity_present_unverified',
    );

    expect(result.trustBlockReason).toContain('requires verified seller trust');
    expect(getDemoCatalogItems()[0]?.descriptor?.short_desc).toBe(beforeDescription);
  });

  it('applies verified catalog patches without blanking unspecified fields', () => {
    const result = applySellerAgentEnvelope(
      {
        summary: 'Listing updated directly.',
        actions: [
          {
            type: 'catalog_patch',
            target_item_id: 'demo-cold-pressed-oil',
            reason: 'Tighten the live listing copy',
            patch: {
              description: 'Cold-pressed mustard oil with a sharp aroma and small-batch sourcing.',
              price: '299.00',
              currency: 'INR',
            },
          },
        ],
      },
      'verified',
    );

    expect(result.trustBlockReason).toBeNull();
    const updated = getDemoCatalogItems().find((item) => item.id === 'demo-cold-pressed-oil');
    expect(updated?.descriptor?.name).toBe('Cold Pressed Mustard Oil 1L');
    expect(updated?.descriptor?.short_desc).toBe(
      'Cold-pressed mustard oil with a sharp aroma and small-batch sourcing.',
    );
    expect(updated?.price?.currency).toBe('INR');
    expect(updated?.price?.value).toBe('299.00');
  });

  it('applies verified field/value catalog patches without blanking preserved fields', () => {
    const envelope = extractSellerAgentEnvelope(
      JSON.stringify({
        summary: 'Listing updated directly.',
        actions: [
          {
            type: 'catalog_patch',
            item_id: 'demo-cold-pressed-oil',
            field: 'description',
            value: 'Cold-pressed mustard oil with a sharp aroma and small-batch sourcing.',
          },
          {
            type: 'catalog_patch',
            item_id: 'demo-cold-pressed-oil',
            field: 'price',
            value: 'INR 299.00',
          },
        ],
      }),
    );

    expect(envelope).not.toBeNull();
    const result = applySellerAgentEnvelope(envelope!, 'verified');
    expect(result.trustBlockReason).toBeNull();

    const updated = getDemoCatalogItems().find((item) => item.id === 'demo-cold-pressed-oil');
    expect(updated?.descriptor?.name).toBe('Cold Pressed Mustard Oil 1L');
    expect(updated?.descriptor?.short_desc).toBe(
      'Cold-pressed mustard oil with a sharp aroma and small-batch sourcing.',
    );
    expect(updated?.price?.currency).toBe('INR');
    expect(updated?.price?.value).toBe('299.00');
    expect(updated?.category?.name).toBeTruthy();
  });

  it('builds a seller snapshot with catalog, diagnostics, and pending draft state', () => {
    const result = applySellerAgentEnvelope(
      {
        summary: 'Prepared a draft.',
        actions: [
          {
            type: 'draft_listing_create',
            reason: 'Launch a new staple listing',
            draft: {
              id: 'draft-ragi-flour',
              name: 'Stoneground Ragi Flour',
              description: 'Calcium-rich flour in 1kg packs.',
              price: '190.00',
              currency: 'INR',
              categoryId: 'cat-1',
            },
          },
        ],
      },
      'verified',
    );

    expect(result.pendingDraft?.name).toBe('Stoneground Ragi Flour');

    const snapshot = buildSellerAgentSnapshot({
      pathname: '/agent',
      search: '',
      trustState: 'verified',
    });

    expect(snapshot.catalog.total_items).toBeGreaterThan(0);
    expect(snapshot.diagnostics.length).toBeGreaterThan(0);
    expect(snapshot.pending_draft?.name).toBe('Stoneground Ragi Flour');
  });
});
