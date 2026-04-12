import { ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';
import { normalizeLoopbackUrl } from '@/lib/loopback';
import type { PortfolioTrustState } from '@/lib/trust';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const IDENTITY_WEB_URL = normalizeLoopbackUrl(
  import.meta.env.VITE_IDENTITY_WEB_URL || 'http://127.0.0.1:43100',
);

function getTrustMeta(state: PortfolioTrustState, loading?: boolean) {
  if (loading) {
    return {
      label: 'Loading',
      description: 'Loading AadhaarChain trust state…',
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
          'Complete AadhaarChain verification before publishing or managing high-trust seller actions.',
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
          'Your trust state is blocked or revoked. Review AadhaarChain before attempting elevated seller actions.',
        className: 'bg-destructive/12 text-destructive',
        icon: ShieldX,
      };
    default:
      return {
        label: 'No identity',
        description:
          'Create an identity anchor in AadhaarChain before acting as a verified seller.',
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
    <a href={`${IDENTITY_WEB_URL}/dashboard`} className="inline-flex">
      <Badge className={meta.className}>
        <Icon className="size-3.5" />
        {loading ? 'Trust loading' : `Trust ${meta.label}`}
      </Badge>
    </a>
  );
}

export function TrustNotice({
  state,
  loading,
  error,
  reason,
  actionLabel = 'Resolve trust in AadhaarChain',
}: {
  state: PortfolioTrustState;
  loading?: boolean;
  error?: string | null;
  reason?: string | null;
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
            <Badge className={meta.className}>AadhaarChain trust: {meta.label}</Badge>
            <p className="max-w-3xl text-sm text-muted-foreground">
              {error || reason || meta.description}
            </p>
          </div>
        </div>

        <div>
          <Button asChild variant={state === 'verified' ? 'secondary' : 'default'}>
            <a href={`${IDENTITY_WEB_URL}/dashboard`}>{actionLabel}</a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
