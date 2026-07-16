import { ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';
import type { PortfolioTrustState } from '@/lib/trust';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

function getTrustMeta(state: PortfolioTrustState, loading?: boolean) {
  if (loading) {
    return {
      label: 'Loading',
      description: 'Loading trust state…',
      className: 'bg-secondary text-secondary-foreground',
      icon: ShieldAlert,
    };
  }

  switch (state) {
    case 'verified':
      return {
        label: 'Verified',
        description:
          'Trust is verified. Catalog publishing and other elevated seller actions remain available.',
        className: 'bg-primary/12 text-primary',
        icon: ShieldCheck,
      };
    case 'identity_present_unverified':
      return {
        label: 'Unverified',
        description:
          'Identity is unverified. Sign in so AgentGuard can authorize elevated actions.',
        className: 'bg-accent text-accent-foreground',
        icon: ShieldAlert,
      };
    case 'manual_review':
      return {
        label: 'Manual review',
        description:
          'Verification is under manual review. Elevated seller actions stay paused until review completes.',
        className: 'bg-accent text-accent-foreground',
        icon: ShieldAlert,
      };
    case 'revoked_or_blocked':
      return {
        label: 'Blocked',
        description:
          'Your trust state is blocked or revoked. Sign in again or review your identity before elevated seller actions.',
        className: 'bg-destructive/12 text-destructive',
        icon: ShieldX,
      };
    default:
      return {
        label: 'Sign in required',
        description:
          'Sign in before adding products or changing orders.',
        className: 'bg-secondary text-secondary-foreground',
        icon: ShieldAlert,
      };
  }
}

export function TrustStatusChip({
  state,
  loading,
}: {
  state: PortfolioTrustState;
  loading?: boolean;
}) {
  const meta = getTrustMeta(state, loading);
  const Icon = meta.icon;

  return (
    <Badge className={meta.className}>
      <Icon className="size-3.5" />
      {loading ? 'Trust loading' : `Trust ${meta.label}`}
    </Badge>
  );
}

export function TrustNotice({
  state,
  loading,
  error,
  reason,
}: {
  state: PortfolioTrustState;
  loading?: boolean;
  error?: string | null;
  reason?: string | null;
  /** @deprecated Ignored — hangar CTAs removed; use header Google/Demo sign-in. */
  actionLabel?: string;
}) {
  const meta = getTrustMeta(state, loading);
  const Icon = meta.icon;

  if (!loading && state === 'verified' && !error) {
    return null;
  }

  return (
    <Card className="border-border/70 bg-card/95">
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 rounded-full p-2 ${meta.className}`}>
            <Icon className="size-4" />
          </div>
          <div className="space-y-2">
            <Badge className={meta.className}>Access: {meta.label}</Badge>
            <p className="max-w-3xl text-sm text-muted-foreground">
              {error || reason || meta.description}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
