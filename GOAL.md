# ONDC Seller Goal

## Status

**Active Token Nxt demonstration application.** It must complete the seller half
of one Buyer-to-Seller commerce journey under the shared AgentGuard contract.
Milestones 10–11 add mandate editing and tool-runner execution for the
operations agent.

## Product outcome

A small seller can let an AI operations agent **run the Seller app** (catalog,
inventory, orders, refunds) through tools under AgentGuard without granting
unrestricted financial or administrator authority.

## Required journey

1. Edit and confirm a Seller Operations Agent mandate (allowed actions + refund
   auto-approve limit).
2. Let the agent use tools to create a product, set price/inventory, and publish
   into the local ONDC-shaped demo exchange.
3. Update inventory while preventing invalid or excessive commitments.
4. Receive the Buyer's order with a stable transaction identity.
5. Let the agent accept and progress a routine order inside policy.
6. Let the agent draft customer communication without approval, but guard any
   binding promise, cancellation, compensation, or refund.
7. Allow an in-policy refund and issue an Intent Receipt.
8. Escalate an out-of-policy refund for one exact human approval; consume it
   once and reject replay.
9. Pause the agent and reject its next protected action.

## Protected actions

Catalog publication, material price change, inventory commitment, order
rejection or cancellation, binding customer remedy, and refund require current
AgentGuard authority. Drafting, summarization, diagnostics, and recommended
responses do not.

Authorization is enforced server-side and binds principal, agent, action,
resource/order, amount or quantity, policy version, nonce, and expiry. Raw
identity, customer conversation, address, order, and payment evidence stays in
the Seller application; receipts contain hashes and minimum necessary metadata.

## Acceptance criteria

- A product published in Seller is discoverable in Buyer without manual data
  repair.
- A Buyer order appears in Seller and can progress through a visible lifecycle.
- The agent can operate catalog, inventory, fulfilment, and issue tools under
  the confirmed mandate.
- An in-limit refund succeeds; an over-limit refund requires approval.
- Replay and post-pause protected actions fail.
- The seller can inspect and edit authority, exceptions, and receipts in plain
  language.
- Demo ONDC broadcast, logistics, and payment are clearly labelled simulated.
- No UI-only control is treated as authorization.

## Non-goals

- Unrestricted repricing, inventory mutation, cancellation, or refund authority.
- Giving the model administrator credentials or raw payment and identity data.
- Production ONDC network publication before onboarding and conformance.
- A separate Seller-only policy or receipt protocol.

## Source of truth

This file owns the Seller outcome. `../PRODUCTIDEA.md` owns product scope,
`../ARCHITECTURE.md` owns shared contracts and protocol requirements,
`../IMPLEMENTATIONPLAN.md` owns build milestones, `../TESTINGPLAN.md` owns
verification gates, and `../README.md` / `../AGENTS.md` own runtime routing.
