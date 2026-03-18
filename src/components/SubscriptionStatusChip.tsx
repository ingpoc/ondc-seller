import { Badge } from '@portfolio-ui';
import type { SubscriptionStatus } from '@/types/agent';

function getTone(status: SubscriptionStatus) {
  if (status === 'active') return 'success' as const;
  if (status === 'trial') return 'info' as const;
  if (status === 'past_due') return 'warning' as const;
  return 'neutral' as const;
}

function getLabel(status: SubscriptionStatus) {
  if (status === 'active') return 'Subscription active';
  if (status === 'trial') return 'Trial active';
  if (status === 'past_due') return 'Subscription past due';
  if (status === 'canceled') return 'Subscription canceled';
  return 'No subscription';
}

export function SubscriptionStatusChip({
  status,
  loading = false,
}: {
  status: SubscriptionStatus;
  loading?: boolean;
}) {
  return <Badge tone={loading ? 'neutral' : getTone(status)}>{loading ? 'Subscription loading' : getLabel(status)}</Badge>;
}
