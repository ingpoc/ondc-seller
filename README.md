# ONDC UCP Seller Portal

`ondc-seller` is the portfolio **ONDC Seller** app under **AgentGuard**. Authorization is session principal (Google / demo) via the gateway; legacy wallet KYC hangar is optional.

It does not verify identity documents and does not operate a separate identity product UX.

## Local Service

| Service | URL |
| --- | --- |
| Seller frontend | `http://127.0.0.1:43103` |
| Gateway + AgentGuard | `http://127.0.0.1:43101` |
| Agent control plane (FlatWatch) | `http://127.0.0.1:43104` |

## Environment

```env
# Leave unset — do NOT use :3001. Vite /api → gateway :43101; orders via /api/demo-commerce/seller/orders
# VITE_API_BASE_URL=
VITE_IDENTITY_URL=http://127.0.0.1:43101
VITE_TRUST_API_URL=http://127.0.0.1:43101
VITE_IDENTITY_AUTH_ENABLED=true
# Leave empty locally so /api/agent/* uses Vite proxy → gateway
VITE_AGENT_CONTROL_PLANE_URL=
VITE_COMMERCE_DEMO_MODE=false
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

## Auth And AgentGuard

Booth path: **Continue with Google** or **Continue as demo user** → session cookie principal → AgentGuard on refund / elevated writes.

Legacy wallet trust (`GET /api/identity/{wallet}/trust`) remains for hangar fixtures only. Session principals skip the legacy trust wall for elevated demo UI.

Sensitive catalog/order/config actions still declare a verified-trust policy; demo/Google `principal:*` subjects satisfy that policy for local demo.

## Agent / AgentGuard Pages

- `/agent` — seller agent control plane
- `/agentguard` — mandate / refund demo chrome

Prefer Samantha orb for user journeys (see `.cursor/skills/ondc-testing`).
