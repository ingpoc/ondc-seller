import { describe, expect, it } from 'vitest';

import { SAMANTHA_EXECUTION_BOUNDARY } from './SamanthaOrb';

describe('Samantha execution-boundary copy', () => {
  it('states that Samantha may execute actions and that AgentGuard still controls them', () => {
    expect(SAMANTHA_EXECUTION_BOUNDARY).toContain('carry out enabled store actions');
    expect(SAMANTHA_EXECUTION_BOUNDARY).toContain('stops for approval or is denied');
  });
});
