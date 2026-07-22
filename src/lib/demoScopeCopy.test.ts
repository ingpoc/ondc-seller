import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('Seller product copy', () => {
  it('uses merchant-facing ONDC language and removes environment qualifiers', () => {
    const usecase = source('public/usecase.html');
    const manifest = source('package.json');
    const entrypoint = source('src/main.tsx');
    const sellerUi = [
      source('src/App.tsx'),
      source('src/pages/DashboardPage.tsx'),
      source('src/pages/ConfigPage.tsx'),
      source('src/pages/SellerLandingPage.tsx'),
    ].join('\n');

    expect(usecase).toContain('AgentGuard lets an assistant publish catalog changes');
    expect(usecase).not.toContain('PreProd');
    expect(usecase).not.toContain('Demo scope');
    expect(usecase).not.toContain('anchor a wallet-bound proof on Solana');
    expect(usecase).not.toContain('AadhaarChain verifies you once');
    expect(usecase).not.toContain('re-checked against AadhaarChain trust');
    expect(sellerUi).toContain('ONDC network connection');
    expect(sellerUi).toContain('listings, customer orders, protected refunds, and assistant permissions');
    expect(sellerUi).not.toContain("label: auth_mode");
    expect(sellerUi).toContain('Seller settings');
    expect(sellerUi).not.toContain('Connect your Seller account to AgentGuard');
    expect(sellerUi).toContain('Generated keys are not active until you save this configuration');
    expect(sellerUi).not.toContain('PreProd');
    expect(sellerUi).not.toContain('Demo scope');
    expect(sellerUi).not.toContain('payout or seller configuration');
    expect(sellerUi).toContain('Agent Guard');
    expect(sellerUi).toContain('Profile details');
    expect(manifest).not.toContain('@solana/');
    expect(manifest).not.toContain('"bs58"');
    expect(entrypoint).not.toContain('WalletProvider');
  });
});
