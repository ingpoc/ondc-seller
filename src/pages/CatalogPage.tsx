import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { BecknItem } from '@ondc-sdk/shared';
import {
  AsyncState,
  Alert,
  Badge,
  Button,
  Card,
  PageLayout,
  Section,
  StatCard,
} from '@/components/seller-ui';
import { useApi } from '../hooks/useApi';
import { useSubject } from '../hooks/useSubject';
import { useTrustState } from '../hooks/useTrustState';
import { InventoryTable } from '../components';
import { TrustNotice } from '../components/TrustStatus';
import { effectiveElevatedTrustState, elevatedTrustSatisfied } from '../lib/trust';
import { recordSellerActionAuditEvent } from '../lib/localSellerAudit';
import { executeProtectedAction } from '../lib/agentGuardClient';
import { assertSellerActionAllowed } from '../lib/sellerActionPolicy';
import {
  notifySellerCatalogChanged,
  SELLER_CATALOG_CHANGED_EVENT,
} from '../lib/sellerCatalogEvents';

type CatalogItem = BecknItem & {
  quantity?: number;
  descriptor?: BecknItem['descriptor'] & {
    short_desc?: string;
  };
  images?: Array<{ url?: string }>;
  category_id?: string;
  price: BecknItem['price'] & {
    currency?: string;
    value?: string;
  };
};

function formatCategory(categoryId?: string | null) {
  if (!categoryId) {
    return 'General';
  }

  return categoryId.replace(/[-_]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function CatalogPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const query = (searchParams.get('q') ?? '').trim().toLowerCase();
  const { subjectId, walletAddress, principalId } = useSubject();
  const trust = useTrustState(walletAddress);
  const { data, loading, error, execute } = useApi('/api/catalog');
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const trustBlocksCatalog = !trust.loading && !elevatedTrustSatisfied(trust.state, principalId);
  const catalogNotice = (location.state as { catalogNotice?: string } | null)?.catalogNotice;

  useEffect(() => {
    void execute();
  }, [execute]);

  useEffect(() => {
    const refreshPublishedCatalog = () => void execute();
    window.addEventListener(SELLER_CATALOG_CHANGED_EVENT, refreshPublishedCatalog);
    return () => window.removeEventListener(SELLER_CATALOG_CHANGED_EVENT, refreshPublishedCatalog);
  }, [execute]);

  const items = useMemo(
    () => ((data as any)?.['bpp/providers']?.[0]?.items ?? []) as CatalogItem[],
    [data]
  );
  const usingLocalCatalogCache = (data as any)?.__source === 'local';
  const filteredItems = useMemo(() => {
    if (!query) {
      return items;
    }

    return items.filter((item) => {
      const haystack = [
        item.descriptor?.name,
        item.descriptor?.short_desc,
        item.category_id,
        item.id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [items, query]);
  const featuredItems = filteredItems.slice(0, 3);
  const categoryCount = new Set(filteredItems.map((item) => item.category_id ?? 'uncategorized'))
    .size;
  const imageryCount = filteredItems.filter((item) => item.images?.[0]?.url).length;

  const handleEdit = useCallback(
    (item: BecknItem) => {
      if (trustBlocksCatalog) {
        return;
      }

      navigate(`/catalog/${item.id}`);
    },
    [navigate, trustBlocksCatalog]
  );

  const handleAdd = useCallback(() => {
    if (trustBlocksCatalog) {
      return;
    }

    navigate('/catalog/new');
  }, [navigate, trustBlocksCatalog]);

  const handleDelete = useCallback(
    async (itemId: string) => {
      if (trustBlocksCatalog) {
        setArchiveError('Sign in with a verified seller session before archiving products.');
        return;
      }
      const policyTrust = effectiveElevatedTrustState(trust.state, principalId);
      try {
        assertSellerActionAllowed('catalog_delete', {
          trustState: policyTrust,
          walletAddress,
          subjectId,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Catalog delete blocked.';
        recordSellerActionAuditEvent({
          action: 'catalog_delete',
          targetId: itemId,
          walletAddress,
          subjectId,
          trustState: policyTrust,
          outcome: 'blocked',
          reason,
        });
        setArchiveError(reason);
        return;
      }

      const confirmed = window.confirm(
        'Archive this listing? Buyers will no longer see it. Publish it again to restore buyer visibility.'
      );
      if (!confirmed) {
        return;
      }

      setArchiveError(null);
      try {
        const executed = await executeProtectedAction({
          walletAddress,
          action: 'seller.catalog.archive',
          amountInr: 0,
          resourceId: itemId,
          idempotencyKey: `seller.catalog.archive:${itemId}:${crypto.randomUUID()}`,
          payload: { item_id: itemId },
        });
        if (!executed.execution) {
          throw new Error(
            executed.decision === 'need_approval'
              ? 'Catalog archive requires exact AgentGuard approval. Enable Archive catalog on AgentGuard.'
              : 'Catalog archive was denied by AgentGuard.'
          );
        }
        recordSellerActionAuditEvent({
          action: 'catalog_delete',
          targetId: itemId,
          walletAddress,
          subjectId,
          trustState: policyTrust,
          outcome: 'applied',
          reason: 'Archived seller catalog item through AgentGuard.',
        });
        notifySellerCatalogChanged();
        await execute();
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : 'Catalog archive failed. Try again.';
        recordSellerActionAuditEvent({
          action: 'catalog_delete',
          targetId: itemId,
          walletAddress,
          subjectId,
          trustState: policyTrust,
          outcome: 'blocked',
          reason,
        });
        setArchiveError(reason);
      }
    },
    [execute, principalId, subjectId, trust.state, trustBlocksCatalog, walletAddress]
  );

  return (
    <PageLayout
      title={query ? `Catalog matches for “${searchParams.get('q')}”` : 'Product catalog'}
      subtitle="Review what buyers can find, then update the product that needs attention."
      showHeader
    >
      {catalogNotice ? (
        <div role="status" aria-live="polite">
          <Alert
            tone="success"
            title="Catalog saved"
            description={catalogNotice}
            className="mb-6"
          />
        </div>
      ) : null}
      {archiveError ? (
        <div role="alert" aria-live="assertive">
          <Alert
            tone="error"
            title="Could not archive product"
            description={archiveError}
            className="mb-6"
          />
        </div>
      ) : null}
      <Section
        eyebrow="Seller catalog"
        actions={
          <div className="flex flex-wrap gap-3">
            {usingLocalCatalogCache ? <Badge tone="warning">Local cache</Badge> : null}
            <Button type="button" variant="secondary" onClick={() => void execute()}>
              Refresh catalog
            </Button>
            {items.length > 0 || query ? (
              <Button type="button" onClick={handleAdd} disabled={trustBlocksCatalog}>
                Add product
              </Button>
            ) : null}
          </div>
        }
      >
        {trustBlocksCatalog || trust.error ? (
          <TrustNotice
            state={trust.state}
            loading={trust.loading}
            error={trust.error}
            reason={trust.reason}
          />
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Visible products"
            value={filteredItems.length}
            hint={
              query
                ? `${items.length} total products in the full catalog`
                : 'Published products in the current view'
            }
          />
          <StatCard
            label="Categories covered"
            value={categoryCount}
            hint="More categories help buyers discover your products"
            tone="info"
          />
          <StatCard
            label="Image coverage"
            value={imageryCount}
            hint="Product images help buyers recognize your listings"
            tone={
              imageryCount === filteredItems.length && filteredItems.length > 0
                ? 'success'
                : 'warning'
            }
          />
          <StatCard
            label="Edit access"
            value={trust.loading ? 'Checking' : !trustBlocksCatalog ? 'Ready' : 'Sign in needed'}
            hint={
              trust.loading
                ? 'Checking your catalog permissions'
                : !trustBlocksCatalog
                  ? 'Signed in; catalog changes are protected by AgentGuard'
                  : (trust.reason ?? 'Sign in to add or edit products')
            }
            tone={!trustBlocksCatalog ? 'success' : 'warning'}
          />
        </div>
      </Section>

      {loading && !data ? (
        <div className="mt-10">
          <AsyncState
            kind="loading"
            title="Loading seller catalog"
            description="Pulling the latest seller inventory for catalog review."
          />
        </div>
      ) : error ? (
        <div className="mt-10">
          <AsyncState
            kind="error"
            title="Unable to load the catalog"
            description={error}
            action={
              <Button type="button" variant="secondary" onClick={() => void execute()}>
                Retry
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <Section
            className="mt-10"
            eyebrow="Featured products"
            title="Review published listings"
            description="Check how each product will appear to buyers."
            actions={query ? <Badge tone="info">{filteredItems.length} matches</Badge> : null}
          >
            {featuredItems.length === 0 ? (
              <AsyncState
                kind="empty"
                title={query ? 'No catalog matches' : 'No products published yet'}
                description={
                  query
                    ? 'Try a different keyword or clear the search to review the full catalog.'
                    : 'Create a product to populate the seller shelf.'
                }
                action={
                  !query ? (
                    <Button type="button" onClick={handleAdd} disabled={trustBlocksCatalog}>
                      Add first product
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="grid gap-4 lg:grid-cols-3">
                {featuredItems.map((item) => (
                  <Card
                    key={item.id}
                    className={`group overflow-hidden p-0 transition-all duration-150 ${
                      trustBlocksCatalog
                        ? 'cursor-not-allowed opacity-75'
                        : 'cursor-pointer hover:-translate-y-1 hover:shadow-[var(--ui-shadow-md)]'
                    }`}
                    onClick={trustBlocksCatalog ? undefined : () => handleEdit(item)}
                  >
                    <div className="relative h-48 overflow-hidden bg-secondary/70">
                      <div className="absolute left-4 top-4 z-10">
                        <Badge tone="info">{formatCategory(item.category_id)}</Badge>
                      </div>
                      {item.images?.[0]?.url ? (
                        <img
                          src={item.images[0].url}
                          alt={item.descriptor?.name ?? item.id}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-5xl">📦</div>
                      )}
                    </div>
                    <div className="space-y-4 p-5">
                      <div className="space-y-2">
                        <h3 className="text-lg font-bold tracking-[-0.03em] text-[var(--ui-text)]">
                          {item.descriptor?.name ?? 'Untitled product'}
                        </h3>
                        <p className="text-sm text-[var(--ui-text-secondary)]">
                          {item.descriptor?.short_desc ??
                            'Add a concise product description for buyer discovery.'}
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex gap-8">
                          <div>
                            <div className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--ui-text-muted)]">
                              Price
                            </div>
                            <div className="mt-1 text-lg font-bold tracking-[-0.03em] text-[var(--ui-text)]">
                              {item.price?.currency ?? 'INR'} {item.price?.value ?? '0'}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--ui-text-muted)]">
                              Stock
                            </div>
                            <div className="mt-1 text-lg font-bold tracking-[-0.03em] text-[var(--ui-text)]">
                              {item.quantity ?? 0}
                            </div>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          aria-label={`Edit featured listing ${item.descriptor?.name ?? 'untitled product'}`}
                          disabled={trustBlocksCatalog}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleEdit(item);
                          }}
                        >
                          Edit
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </Section>

          <Section
            className="mt-10"
            eyebrow="Product details"
            title="Update products in one table"
            description="Use this table to update prices, stock, and product details."
          >
            <InventoryTable
              items={filteredItems}
              onEdit={handleEdit}
              onDelete={(id) => {
                void handleDelete(id);
              }}
              actionsDisabled={trustBlocksCatalog}
            />
          </Section>
        </>
      )}
    </PageLayout>
  );
}
