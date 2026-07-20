import { describe, expect, it } from 'vitest';
import { customerReference } from './displayText';

describe('customerReference', () => {
  it('turns internal ids into short references without implementation prefixes', () => {
    expect(customerReference('order_40a99f8ff4ea4d1e')).toBe('40A99F8F');
    expect(customerReference('receipt:0a15abd4aa3a460b')).toBe('0A15ABD4');
  });
});
