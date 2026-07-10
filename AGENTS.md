# AGENTS.md

## Scope

Repo-local guidance for `ondc-seller` only.

**Portfolio QA / browser / same-wallet control owner:** `../aadhaar-chain/qa/docs/workflow/`  
Entry: `../aadhaar-chain/qa/docs/workflow/README.md`

There is no parent `../AGENTS.md` in this multi-repo checkout. Do not invent one. Do not fork the ledger or graders under this repo.

## Browser / portfolio testing (pointer only)

- BEFORE browser testing → `../aadhaar-chain/qa/docs/workflow/browser-testing-control-plane.md`
- BEFORE same-wallet journey → `../aadhaar-chain/qa/docs/workflow/portfolio-browser-acceptance-loop.md`
- Session friction → `../aadhaar-chain/qa/docs/workflow/session-friction-log.md`
- Confirm AadhaarChain verified trust before seller write conclusions (catalog/order/config)
- Critical routes: `/dashboard`, `/catalog`, `/catalog/new`, `/orders`, `/orders/:id`, `/config`, `/agent`
- Run graders only from `aadhaar-chain/qa`

## Repository Type

Private webapp — Vite + React + TypeScript. Dev port **43103** (not 3002).

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm install` | Install dependencies |
| `pnpm dev` | Start dev server (port 43103) |
| `pnpm build` | Production build |
| `pnpm preview` | Preview production build |
| `pnpm test` | Run tests |
| `pnpm test:watch` | Tests in watch mode |
| `pnpm test:coverage` | Tests with coverage |
| `pnpm typecheck` | TypeScript check |
| `pnpm lint` | Run ESLint |
| `pnpm format` | Format with Prettier |

## Development

1. `pnpm install` → `pnpm dev`
2. Open `http://127.0.0.1:43103`
3. Trust client: vendored at `./shared/trust-client` (aliases must point here, not missing `../shared/...`)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React 18 + Vite |
| Language | TypeScript |
| Routing | React Router v6 |
| Testing | Vitest + jsdom |

## Seller-Specific Features

- Catalog management
- Order fulfillment
- Inventory tracking
- Store configuration

## Before Changing

1. Check `src/pages/` for route definitions
2. Read `src/services/` for API patterns
3. Run `pnpm typecheck` before committing
4. Test user flows, not just components

## CI/CD

CI on PRs/main: typecheck, build, test. No publishing.
