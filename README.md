# ONDC UCP Seller Portal

`ondc-seller` is the portfolio seller application. It consumes AadhaarChain trust state for dashboard readiness, catalog writes, order actions, payout/config readiness, seller agent workflows, and purpose-bound identity proof signing.

It does not verify identity documents and it does not operate the AadhaarChain trust boundary.

## Local Service

| Service | URL |
| --- | --- |
| Seller frontend | `http://127.0.0.1:43103` |
| AadhaarChain gateway | `http://127.0.0.1:43101` |
| Agent control plane (FlatWatch) | `http://127.0.0.1:43104` |

## Environment

```env
VITE_API_BASE_URL=http://localhost:3001
VITE_IDENTITY_URL=http://127.0.0.1:43101
VITE_TRUST_API_URL=http://127.0.0.1:43101
VITE_AGENT_CONTROL_PLANE_URL=http://127.0.0.1:43104
VITE_COMMERCE_DEMO_MODE=true
```

Server-side enforcement adapters use:

```env
SELLER_COMMERCE_API_BASE=https://commerce-api.example.com
SELLER_IDENTITY_API_BASE=https://identity-aadhar-gateway.onrender.com
SELLER_TRUST_API_BASE=https://identity-aadhar-gateway.onrender.com
```

## Development

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run lint
npm run build
```

The local dev server runs on `43103`.

## Trust And Seller Policy

The seller app reads AadhaarChain trust from:

- `GET /api/identity/{wallet_address}/trust`

Current action policy:

| Action | Required trust | Boundary |
| --- | --- | --- |
| View dashboard, catalog, orders, config, support | Auth/session or wallet subject | frontend read path |
| Draft catalog listing for review | Wallet subject | local draft state |
| Create/edit/publish catalog item, change price, delete item | `verified` | server-side commerce policy required |
| Accept/reject/dispatch order | `verified` | server-side commerce policy required |
| Payout/config writes | `verified` | server-side commerce policy required |
| Agent-originated seller writes | `verified` plus explicit approval/audit | shared agent control plane plus commerce backend |

The repo includes a deterministic backend enforcement contract in `src/lib/sellerBackendEnforcement.ts`. Deployed `/api/*` paths route through Vercel/Netlify serverless gateways that validate seller session, reread AadhaarChain trust, enforce seller action policy, emit audit context, and proxy to the configured commerce backend.

## Identity Proof Signing

The seller dashboard exposes a wallet-signing control for `seller_catalog_identity_proof`:

1. request a short-lived AadhaarChain proof challenge
2. ask the connected wallet to sign the challenge
3. verify the signed proof through AadhaarChain
4. display `Identity signed` only after signature verification succeeds

Chrome validation in the signed wallet profile has produced `Identity signed` for seller proof with wallet `C5svcE...g92YFF`.

## Agent Page

Route: `/agent`

The seller agent page uses the shared agent control plane. In signed Chrome it renders with:

- wallet `C5svcE...g92YFF`
- runtime `local_cli`
- verified seller writes enabled
- listing diagnostics visible

Chrome text-entry submission for new seller prompts is currently blocked by the Chrome plugin textarea/clipboard path, but the page, runtime, wallet, and trust state render correctly.

## Production Boundary

Do not treat frontend gating as production enforcement. Production catalog, order, payout/config, and agent-originated writes must be enforced server-side with session, wallet, trust, policy, and audit checks.
