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
import { elevatedTrustSatisfied } from '../lib/trust';
import { useAuthContext } from '../contexts/AuthContext';

interface SellerCatalogItem {
  id: string;
  descriptor?: {
    name?: string;
    short_desc?: string;
  };
  category_id?: string;
  images?: Array<{ url?: string }>;
  price?: { currency?: string; value?: string };
  quantity?: number;
}

export function categoryCountHint(categoryCount: number): string {
  if (categoryCount === 0) return 'No categories yet';
  if (categoryCount === 1) return 'One category so far';
  return 'Multiple demand lanes';
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { walletAddress, principalId } = useSubject();
  const trust = useTrustState(walletAddress);
  const { isAuthenticated } = useAuthContext();
  const elevatedOk = elevatedTrustSatisfied(trust.state, principalId);
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
    : elevatedOk
      ? 'Verified'
      : 'Needs action';

  return (
    <PageLayout
      title={isAuthenticated ? 'Seller dashboard' : 'Browse the catalog'}
      subtitle={
        isAuthenticated
          ? 'Monitor catalog readiness, seller access, and your next operational actions.'
          : 'View products currently available from this seller.'
      }
    >
      <Section
        actions={
          <div className="flex flex-wrap gap-3">
            {isAuthenticated && itemCount > 0 ? (
              <Button
                type="button"
                onClick={() => navigate('/catalog/new')}
                disabled={!trust.loading && !elevatedOk}
              >
                Add product
              </Button>
            ) : null}
            {!isAuthenticated || itemCount > 0 ? (
              <Button type="button" variant="secondary" onClick={() => navigate('/catalog')}>
                {isAuthenticated ? 'Open catalog' : 'Browse catalog'}
              </Button>
            ) : null}
          </div>
        }
      >
        {!elevatedOk || trust.error ? (
          <TrustNotice
            state={trust.state}
            loading={trust.loading}
            error={trust.error}
            reason={trust.reason}
          />
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="Products" value={itemCount} hint="Listings in your ONDC catalog" />
          <StatCard
            label="Categories"
            value={categoryCount}
            hint={categoryCountHint(categoryCount)}
            tone="info"
          />
          <StatCard
            label="Signed-in identity"
            value={elevatedOk ? 'Verified' : trustLabel}
            hint={
              trust.reason ??
              (elevatedOk
                ? 'Identity only. Store connection is checked separately in Settings; authority is shown in Assistant permissions.'
                : 'Required for protected seller operations')
            }
            tone={elevatedOk ? 'success' : 'warning'}
          />
        </div>
      </Section>

      <Card className="mt-10 space-y-5 border-border/60 shadow-none">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Inventory snapshot
          </h2>
          {itemCount > 5 ? (
            <p className="text-sm text-muted-foreground">Showing 5 of {itemCount} products</p>
          ) : null}
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
                disabled={!trust.loading && !elevatedOk}
              >
                Add first product
              </Button>
            }
          />
        ) : (
          <div className="divide-y divide-border/70">
            {items.slice(0, 5).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(`/catalog/${item.id}`)}
                className="flex w-full items-start justify-between gap-4 py-4 text-left transition-colors hover:bg-secondary/40"
              >
                <div className="min-w-0 space-y-1">
                  <div className="truncate text-base font-medium text-foreground">
                    {item.descriptor?.name ?? 'Untitled product'}
                  </div>
                  <div className="line-clamp-2 text-sm text-muted-foreground">
                    {item.descriptor?.short_desc ?? 'Add a short descriptor for buyer cards.'}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <Badge tone="info">{item.category_id ?? 'general'}</Badge>
                  <div className="text-sm font-medium text-foreground">
                    {item.price?.currency ?? 'INR'} {item.price?.value ?? '0'} · {item.quantity ?? 0} in stock
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>
    </PageLayout>
  );
}
