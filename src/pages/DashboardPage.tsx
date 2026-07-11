import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { useSubject } from '../hooks/useSubject';
import { useTrustState } from '../hooks/useTrustState';
import { TrustNotice } from '../components/TrustStatus';

interface SellerCatalogItem {
  id: string;
  descriptor?: {
    name?: string;
    short_desc?: string;
  };
  category_id?: string;
  images?: Array<{ url?: string }>;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { walletAddress } = useSubject();
  const trust = useTrustState(walletAddress);
  const { data, loading, error, execute } = useApi('/api/catalog');

  useEffect(() => {
    void execute();
  }, [execute]);

  const items = useMemo(
    () => (((data as any)?.['bpp/providers']?.[0]?.items ?? []) as SellerCatalogItem[]),
    [data]
  );
  const itemCount = items.length;
  const categoryCount = new Set(items.map((item) => item.category_id ?? 'uncategorized')).size;
  const trustLabel = trust.loading
    ? 'Checking'
    : trust.state === 'verified'
      ? 'Verified'
      : 'Needs action';

  return (
    <PageLayout>
      <Section
        eyebrow="Seller"
        title="Catalog and trust"
        description="Publish listings when verified. Open catalog to manage the full shelf."
        actions={
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={() => navigate('/catalog/new')}
              disabled={!trust.loading && trust.state !== 'verified'}
            >
              Add product
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate('/catalog')}>
              Open catalog
            </Button>
          </div>
        }
      >
        {trust.state !== 'verified' || trust.error ? (
          <TrustNotice
            state={trust.state}
            loading={trust.loading}
            error={trust.error}
            reason={trust.reason}
          />
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="Products" value={itemCount} hint="Live listings in the demo catalog" />
          <StatCard
            label="Categories"
            value={categoryCount}
            hint={categoryCount > 1 ? 'Multiple demand lanes' : 'Single category so far'}
            tone="info"
          />
          <StatCard
            label="Trust"
            value={trustLabel}
            hint={trust.reason ?? 'Required for elevated publish actions'}
            tone={trust.state === 'verified' ? 'success' : 'warning'}
          />
        </div>
      </Section>

      <Card className="mt-10 space-y-5">
        <div className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--ui-text-muted)]">
            Recent products
          </div>
          <h2 className="text-2xl font-bold tracking-[-0.03em] text-[var(--ui-text)]">
            Inventory snapshot
          </h2>
        </div>

        {loading && !data ? (
          <AsyncState
            kind="loading"
            title="Loading catalog"
            description="Pulling the latest seller inventory."
          />
        ) : error ? (
          <AsyncState
            kind="error"
            title="Catalog unavailable"
            description={error}
            action={
              <Button type="button" variant="secondary" onClick={() => void execute()}>
                Retry
              </Button>
            }
          />
        ) : itemCount === 0 ? (
          <AsyncState
            kind="empty"
            title="No products yet"
            description="Create a first product so buyers can discover your storefront."
            action={
              <Button
                type="button"
                onClick={() => navigate('/catalog/new')}
                disabled={!trust.loading && trust.state !== 'verified'}
              >
                Add first product
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {items.slice(0, 5).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(`/catalog/${item.id}`)}
                className="flex w-full items-start justify-between gap-4 rounded-[var(--ui-radius-lg)] border border-[var(--ui-border)] bg-white px-4 py-4 text-left transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[var(--ui-shadow-sm)]"
              >
                <div className="min-w-0 space-y-2">
                  <div className="truncate text-base font-semibold text-[var(--ui-text)]">
                    {item.descriptor?.name ?? 'Untitled product'}
                  </div>
                  <div className="line-clamp-2 text-sm text-[var(--ui-text-secondary)]">
                    {item.descriptor?.short_desc ?? 'Add a short descriptor for buyer cards.'}
                  </div>
                </div>
                <Badge tone="info">{item.category_id ?? 'general'}</Badge>
              </button>
            ))}
          </div>
        )}
      </Card>
    </PageLayout>
  );
}
