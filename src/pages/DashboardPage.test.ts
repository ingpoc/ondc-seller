import { describe, expect, it } from 'vitest';

import { categoryCountHint } from './DashboardPage';

describe('Dashboard category summary', () => {
  it('does not describe an empty catalog as a single category', () => {
    expect(categoryCountHint(0)).toBe('No categories yet');
    expect(categoryCountHint(1)).toBe('One category so far');
    expect(categoryCountHint(2)).toBe('Multiple demand lanes');
  });
});
