import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  AsyncState,
  Badge,
  Button,
  Card,
  PageLayout,
  Section,
  StatCard,
} from '@portfolio-ui';
import { useApi } from '../hooks/useApi';
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
  const { publicKey } = useWallet();
  const trust = useTrustState(publicKey?.toBase58() ?? null);
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
  const richListingCount = items.filter((item) => item.descriptor?.short_desc).length;
  const trustLabel = trust.loading
    ? 'Checking'
    : trust.state === 'verified'
      ? 'Verified'
      : 'Needs action';

  return (
    <PageLayout>
      <Section
        eyebrow="Seller cockpit"
        title="Keep the storefront ready for verified buyers"
        description="Track trust readiness, catalog depth, and the next operational move from one shared shell."
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

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Products live"
            value={itemCount}
            hint={
              itemCount > 0
                ? `${richListingCount} listings already include buyer-facing context`
                : 'Publish your first SKU to activate the seller shelf'
            }
          />
          <StatCard
            label="Catalog spread"
            value={categoryCount}
            hint={categoryCount > 1 ? 'Coverage spans multiple demand lanes' : 'Still concentrated in one lane'}
            tone="info"
          />
          <StatCard
            label="Trust state"
            value={trustLabel}
            hint={trust.reason ?? 'Verification keeps elevated seller actions available'}
            tone={trust.state === 'verified' ? 'success' : 'warning'}
          />
          <StatCard
            label="Pending orders"
            value={0}
            hint="Order intake stays quiet until live buyer traffic arrives"
          />
        </div>
      </Section>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="space-y-5">
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--ui-text-muted)]">
              Catalog pulse
            </div>
            <h2 className="text-2xl font-bold tracking-[-0.03em] text-[var(--ui-text)]">
              Recent inventory snapshot
            </h2>
            <p className="text-sm text-[var(--ui-text-secondary)]">
              Use this short list to confirm your most visible products still read clearly before
              you dive into the full table.
            </p>
          </div>

          {loading && !data ? (
            <AsyncState
              kind="loading"
              title="Loading catalog"
              description="Pulling the latest seller inventory into the dashboard."
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
              description="Create a first product card so buyers can discover your storefront."
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
              {items.slice(0, 3).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(`/catalog/${item.id}`)}
                  className="flex w-full items-start justify-between gap-4 rounded-[var(--ui-radius-lg)] border border-[var(--ui-border)] bg-white px-4 py-4 text-left transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[var(--ui-shadow-sm)]"
                >
                  <div className="space-y-2">
                    <div className="text-base font-semibold text-[var(--ui-text)]">
                      {item.descriptor?.name ?? 'Untitled product'}
                    </div>
                    <div className="text-sm text-[var(--ui-text-secondary)]">
                      {item.descriptor?.short_desc ?? 'Add a short descriptor to improve buyer scanability.'}
                    </div>
                  </div>
                  <Badge tone="info">{item.category_id ?? 'general'}</Badge>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="space-y-5">
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--ui-text-muted)]">
              Operating focus
            </div>
            <h2 className="text-2xl font-bold tracking-[-0.03em] text-[var(--ui-text)]">
              What to tighten next
            </h2>
          </div>

          <div className="space-y-3">
            <div className="rounded-[var(--ui-radius-lg)] border border-[var(--ui-border)] bg-[var(--ui-bg-subtle)] px-4 py-4">
              <div className="text-sm font-semibold text-[var(--ui-text)]">Trust verification</div>
              <div className="mt-1 text-sm text-[var(--ui-text-secondary)]">
                Verified sellers can publish and edit high-trust catalog actions without runtime
                blocks.
              </div>
            </div>
            <div className="rounded-[var(--ui-radius-lg)] border border-[var(--ui-border)] bg-[var(--ui-bg-subtle)] px-4 py-4">
              <div className="text-sm font-semibold text-[var(--ui-text)]">Listing clarity</div>
              <div className="mt-1 text-sm text-[var(--ui-text-secondary)]">
                Add concise descriptions and imagery so discovery results read well in buyer cards.
              </div>
            </div>
            <div className="rounded-[var(--ui-radius-lg)] border border-[var(--ui-border)] bg-[var(--ui-bg-subtle)] px-4 py-4">
              <div className="text-sm font-semibold text-[var(--ui-text)]">Order readiness</div>
              <div className="mt-1 text-sm text-[var(--ui-text-secondary)]">
                Keep the catalog tidy now so order-management flows can layer in without cleanup
                debt later.
              </div>
            </div>
          </div>
        </Card>
      </div>
    </PageLayout>
  );
}
