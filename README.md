# ONDC UCP Seller Portal

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/openclaw-gurusharan/ondc-seller)

Seller web application for ONDC (Open Network for Digital Commerce) Unified Commerce Platform integration.

## Overview

This portal enables sellers to manage their products, process orders, and configure their ONDC integration through a modern web interface built with React, TypeScript, and Vite.

## Features

- **Dashboard**: Order overview with key metrics
- **Product Catalog**: Create, edit, and manage product listings
- **Order Management**: Accept, reject, and track orders
- **Seller Configuration**: ONDC credentials and connection settings
- **AI Agent Chat**: Intelligent assistant for seller support

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Vite 5 + React 18 + TypeScript 5 |
| **Routing** | React Router v6 |
| **Design** | @drams-design/components (Dieter Rams principles) |
| **SDK** | @ondc-sdk/shared |
| **Testing** | Vitest + Testing Library |
| **Code Quality** | ESLint 9 + Prettier 3 |
| **Package Manager** | pnpm 8+ |

## Prerequisites

- Node.js 18+
- pnpm 8+

## Installation

```bash
# Clone repository
git clone <repository-url>
cd ondc-ucp-seller-portal

# Install dependencies
pnpm install
```

## Environment Variables

Create a `.env` file in the project root:

```env
# API Base URL (default: http://localhost:3001)
VITE_API_BASE_URL=http://localhost:3001

# Local browser-only commerce fallback for portfolio acceptance testing
VITE_COMMERCE_DEMO_MODE=true
```

## Trust And ONDC Boundaries

`ondc-seller` is a downstream trust consumer. It does not verify identity documents
or operate an ONDC BPP/provider directly. AadhaarChain owns identity and trust
state; the configured commerce API behind `VITE_API_BASE_URL` owns production
catalog, order, fulfillment, and seller-configuration writes.

The frontend enforces the same seller action policy before local demo writes and
before calling commerce endpoints:

| Action | Required trust | Runtime boundary |
|--------|----------------|------------------|
| View dashboard, catalog, orders, config, support | Auth/session or wallet subject | Frontend read path |
| Draft catalog listing for review | Wallet subject | Local draft state |
| Create or edit catalog item, publish listing, change price, delete item | Verified AadhaarChain trust | Commerce API or local demo catalog |
| Accept, reject, or dispatch orders | Verified AadhaarChain trust | Commerce API or local demo orders |
| Save seller configuration or generate keys | Verified AadhaarChain trust | Commerce API or local demo config |
| Agent catalog patches and order follow-up notes | Verified AadhaarChain trust plus explicit UI approval | Local seller action executor |

Every sensitive local/demo write records an audit event with action, target,
wallet, subject, session when available, trust state, timestamp, outcome, and
reason. Commerce API calls are built from a typed backend policy envelope with
`enforcement: "backend_must_revalidate_trust"` and include protected-action,
required-trust, observed-trust, wallet, and audit-subject headers. Production
must treat these client headers as context only and verify session, wallet
identity, AadhaarChain trust state, policy, and audit writes independently.
The deterministic backend-side enforcement contract lives in
`src/lib/sellerBackendEnforcement.ts` so a commerce API or serverless adapter can
reuse the same fail-closed checks before applying protected seller mutations.
Deployed `/api/*` traffic is routed through the repo-owned Vercel and Netlify
serverless gateways, which validate the seller session through the identity
service, re-read AadhaarChain trust, enforce the action policy, emit a
`seller_trust_enforcement_audit` event, and then proxy to the configured commerce
backend.

Server-side enforcement environment variables:

```env
SELLER_COMMERCE_API_BASE=https://commerce-api.example.com
SELLER_IDENTITY_API_BASE=https://identity-aadhar-gateway.onrender.com
SELLER_TRUST_API_BASE=https://identity-aadhar-gateway.onrender.com
```

## Development

```bash
# Start dev server (port 43103)
pnpm dev

# Type check
pnpm typecheck

# Lint code
pnpm lint

# Format code
pnpm format

# Check formatting
pnpm format:check
```

## Testing

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage
```

## Building

```bash
# Production build
pnpm build

# Preview production build
pnpm preview
```

## CI/CD

The project uses GitHub Actions for continuous integration:

- **Lint & Format**: Runs on every PR (blocks merge on failure)
- **Typecheck**: Validates TypeScript types
- **Build**: Ensures production build succeeds
- **Tests**: Runs full test suite

## Project Structure

```
src/
├── components/      # Reusable UI components
├── pages/          # Route-level pages
├── hooks/          # Custom React hooks
├── types/          # TypeScript type definitions
├── __tests__/      # Test setup and utilities
├── App.tsx         # Root component
└── main.tsx        # Entry point
```

## Deployment

The project is configured for Netlify deployment:

```bash
# Install Netlify CLI
pnpm add -g netlify-cli

# Deploy to preview
netlify deploy
```

See `.netlify/config.toml` for deployment settings.

## Contributing

1. Create a feature branch
2. Make your changes
3. Run `pnpm lint` and `pnpm format`
4. Run `pnpm test` and `pnpm typecheck`
5. Submit a pull request

All PRs must pass CI checks before merging.

## License

MIT
