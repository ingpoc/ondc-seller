import { describe, expect, it } from 'vitest';

import {
  SAMANTHA_EXECUTION_BOUNDARY,
  SAMANTHA_SETTINGS_PATH,
  groundedSellerToolReply,
  samanthaReadyHint,
} from './SamanthaOrb';

describe('Samantha execution-boundary copy', () => {
  it('states that Samantha may execute actions and that AgentGuard still controls them', () => {
    expect(SAMANTHA_EXECUTION_BOUNDARY).toContain('carry out enabled store actions');
    expect(SAMANTHA_EXECUTION_BOUNDARY).toContain('stops for approval or is denied');
  });

  it('describes microphone readiness without implying that text mode is listening', () => {
    expect(samanthaReadyHint(true)).toBe('Voice and text ready · microphone on');
    expect(samanthaReadyHint(false)).toBe('Text ready · microphone off');
  });

  it('opens the Samantha memory settings rather than the generic authority tab', () => {
    expect(SAMANTHA_SETTINGS_PATH).toBe('/config?tab=samantha');
  });

  it('grounds multi-tool replies in the actual tool outcomes', () => {
    expect(
      groundedSellerToolReply([
        { ok: true, message: 'Order accepted.' },
        { ok: false, message: 'Delivery details are incomplete.' },
      ]),
    ).toBe('Completed: Order accepted.\nNot completed: Delivery details are incomplete.');
  });
});
