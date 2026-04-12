import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import type { BecknItem } from '@ondc-sdk/shared';
import {
  AsyncState,
  Badge,
  Button,
  Card,
  PageLayout,
  Section,
  StatCard,
} from '@/components/seller-ui';
import { useApi } from '../hooks/useApi';
import { useTrustState } from '../hooks/useTrustState';
import { InventoryTable } from '../components';
import { TrustNotice } from '../components/TrustStatus';

type CatalogItem = BecknItem & {
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

  return categoryId
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function CatalogPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const query = (searchParams.get('q') ?? '').trim().toLowerCase();
  const { publicKey } = useWallet();
  const trust = useTrustState(publicKey?.toBase58() ?? null);
  const { data, loading, error, execute } = useApi('/api/catalog');
  const trustBlocksCatalog = !trust.loading && trust.state !== 'verified';

  useEffect(() => {
    void execute();
  }, [execute]);

  const items = useMemo(
    () => (((data as any)?.['bpp/providers']?.[0]?.items ?? []) as CatalogItem[]),
    [data]
  );
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
  const categoryCount = new Set(filteredItems.map((item) => item.category_id ?? 'uncategorized')).size;
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

  return (
    <PageLayout>
      <Section
        eyebrow="Seller catalog"
        title={query ? `Catalog matches for “${searchParams.get('q')}”` : 'Run a tighter product shelf'}
        description="Review the inventory buyers will actually encounter, then edit the exact SKU that needs cleanup."
        actions={
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="secondary" onClick={() => void execute()}>
              Refresh catalog
            </Button>
            <Button type="button" onClick={handleAdd} disabled={trustBlocksCatalog}>
              Add product
            </Button>
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
            hint={query ? `${items.length} total products in the full catalog` : 'Active SKUs in the current view'}
          />
          <StatCard
            label="Categories covered"
            value={categoryCount}
            hint="Broader spread helps discovery across buyer intents"
            tone="info"
          />
          <StatCard
            label="Image coverage"
            value={imageryCount}
            hint="Listings with imagery read better in buyer result cards"
            tone={imageryCount === filteredItems.length && filteredItems.length > 0 ? 'success' : 'warning'}
          />
          <StatCard
            label="Trust control"
            value={trust.loading ? 'Checking' : trust.state === 'verified' ? 'Open' : 'Restricted'}
            hint={trust.reason ?? 'Catalog edits stay gated until seller trust is verified'}
            tone={trust.state === 'verified' ? 'success' : 'warning'}
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
            eyebrow="Featured review"
            title="Spot-check the top listings"
            description="These cards mimic how the catalog reads at a glance before buyers drill into edit flows."
            actions={
              query ? <Badge tone="info">{filteredItems.length} matches</Badge> : null
            }
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
                    className="group cursor-pointer overflow-hidden p-0 transition-all duration-150 hover:-translate-y-1 hover:shadow-[var(--ui-shadow-md)]"
                    onClick={() => handleEdit(item)}
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
                          {item.descriptor?.short_desc ?? 'Add a concise product description for buyer discovery.'}
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--ui-text-muted)]">
                            Price
                          </div>
                          <div className="mt-1 text-lg font-bold tracking-[-0.03em] text-[var(--ui-text)]">
                            {item.price?.currency ?? 'INR'} {item.price?.value ?? '0'}
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
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
            eyebrow="Inventory ledger"
            title="Edit every SKU from one table"
            description="Use the table for precise edits once the top-level card view confirms the shelf is headed in the right direction."
          >
            <InventoryTable
              items={filteredItems}
              onEdit={handleEdit}
              onDelete={(id) => console.log('Delete', id)}
            />
          </Section>
        </>
      )}
    </PageLayout>
  );
}
