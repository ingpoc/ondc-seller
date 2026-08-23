import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const config = JSON.parse(
  readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'),
);

describe('Seller Vercel routing', () => {
  it('routes every API path to the gateway before the SPA fallback', () => {
    const rewrites = config.rewrites;
    const apiIndex = rewrites.findIndex(
      (rewrite) => rewrite.source === '/api/:path*',
    );
    const fallbackIndex = rewrites.findIndex((rewrite) => rewrite.source === '/(.*)');

    expect(apiIndex).toBeGreaterThanOrEqual(0);
    expect(rewrites[apiIndex].destination).toBe(
      'https://gateway.aadharcha.in/api/:path*',
    );
    expect(apiIndex).toBeLessThan(fallbackIndex);
  });
});
