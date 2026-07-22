import { describe, expect, it } from 'vitest';

import { verifiedRuntimeSummary } from './samanthaRuntimeHandoff';

describe('Seller runtime completion evidence', () => {
  it('rejects a result without a verified postcondition', () => {
    expect(verifiedRuntimeSummary({
      status: 'completed',
      summary: 'Triaged 17 orders.',
      executed_tools: ['commerce_api'],
      postcondition: { verified: true, evidence: '' },
    })).toBeNull();
  });

  it('accepts a tool-backed verified postcondition', () => {
    expect(verifiedRuntimeSummary({
      status: 'completed',
      summary: 'No orders require follow-up.',
      executed_tools: ['commerce_api'],
      postcondition: { verified: true, evidence: 'Read-back returned zero open orders.' },
    })).toBe('No orders require follow-up.');
  });
});
