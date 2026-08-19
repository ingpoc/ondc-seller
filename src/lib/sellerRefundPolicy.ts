import type { UCPOrder } from '@ondc-sdk/shared';

export function remainingRefundAmountInr(
  order: Pick<UCPOrder, 'total'> & { refundedAmountInr?: number },
): number {
  return Math.max(
    0,
    Math.round(Number(order.total) || 0) - Math.round(Number(order.refundedAmountInr) || 0),
  );
}

export function refundAmountBlockedReason(amountInr: number, remainingInr: number): string | null {
  const amount = Math.round(Number(amountInr) || 0);
  const remaining = Math.max(0, Math.round(Number(remainingInr) || 0));
  if (amount <= 0) return 'Enter a refund amount greater than zero.';
  if (amount > remaining) {
    return `Refund INR ${amount.toLocaleString('en-IN')} exceeds the remaining order total of INR ${remaining.toLocaleString('en-IN')}.`;
  }
  return null;
}

export function refundOutcomeLooksExecuted(outcome?: string | null): boolean {
  const normalized = String(outcome || '').trim().toLowerCase();
  return (
    normalized === 'succeeded' ||
    normalized === 'allow' ||
    normalized === 'executed' ||
    normalized === 'refunded'
  );
}
