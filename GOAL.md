# ONDC Seller Goal

## Product

ONDC Seller is an AI-assisted commerce operating system that lets verified
sellers manage catalog, pricing, inventory, orders, fulfillment, refunds, and
settlement-sensitive workflows safely across an open network.

It is the first customer-facing deployment of AadhaarChain AgentGuard.

## Product promise

> Let AI run routine commerce operations without surrendering control of the
> business.

## Primary customer

A small or medium seller, seller-platform operator, or managed-commerce team
that wants automation but remains financially and legally accountable for every
agent action.

## Customer jobs

1. Join and configure a seller operation with trustworthy ownership and roles.
2. Create and maintain an accurate, policy-compliant catalog.
3. Keep price and inventory synchronized with source systems.
4. Process orders and fulfillment efficiently.
5. Delegate routine work to AI within explicit monetary and operational limits.
6. Approve exceptional refunds, regulated products, payout changes, and admin
   operations.
7. Pause, revoke, recover, and audit agents when something goes wrong.

## Owned capabilities

- seller onboarding and organization roles;
- catalog, inventory, pricing, order, fulfillment, refund, and configuration
  workflows;
- AI operations agent and deterministic policy enforcement;
- human approval for over-limit or sensitive actions;
- server-side commerce authorization and reconciliation;
- agent activity, exception, revocation, recovery, and dispute views;
- relying-party receipts for authorized seller actions.

## Relationship to AadhaarChain

- AadhaarChain establishes seller/principal assurance and agent identity.
- AgentGuard policies define the agent's action, amount, rate, counterparty,
  data, time, and delegation limits.
- Seller verifies current policy and one-time approval before protected writes.
- Seller returns signed action receipts without receiving identity evidence.
- Suspension or revocation stops the corresponding agent authority.

## Hard rules

- AI-generated policy text is never the enforcement surface; compiled,
  deterministic rules are.
- Bank, settlement, ownership, administrator, and regulated-category changes
  always require fresh step-up approval.
- Refunds, price changes, and order decisions respect explicit amount and rate
  limits.
- Protected writes are enforced server-side and fail closed on stale authority.
- Proofs are one-time, action-bound, short-lived, and replay-safe.
- The user can see what the agent intends, why approval is required, what data is
  shared, and what will happen.
- One control pauses the agent immediately; recovery cannot be controlled by one
  untrusted guardian.
- Catalog, order, and customer data remain in the commerce system, not on-chain.

## Phase-one outcome

Demonstrate a complete, failure-visible AgentGuard seller flow:

1. Establish or fixture a clearly labeled verified seller.
2. Register a Store Operations Assistant.
3. Create the policy: routine refunds up to INR 5,000.
4. Execute and receipt an INR 3,000 refund.
5. Block an INR 7,500 refund and request passkey approval.
6. Consume the approval once and visibly reject replay.
7. Pause the agent and visibly reject the next routine action.
8. Let another relying view verify policy, approval, status, and receipt without
   seeing Aadhaar data.

This is the smallest credible live demonstration for NPCI TokenNXT or an
equivalent customer pilot.

## Success measures

- At least 80% of sellers create or accept a policy without support.
- At least 90% understand the requested action, amount, recipient, and effect.
- Zero protected writes without server-verified authority.
- Zero successful replay or post-revocation actions.
- Routine manual approval workload falls without unsafe execution.
- Receipts are independently verifiable and useful in a dispute.
- A second organizationally independent application accepts the contract.

## Non-goals

- Replacing the ONDC network or claiming protocol production readiness from a
  demo.
- Giving an AI unrestricted seller, payout, or administrator credentials.
- Using Aadhaar verification as a universal seller-quality score.
- Token incentives before a real independent verifier market exists.
- Storing catalogs, orders, customer PII, or settlement instructions on-chain.

## Source of truth

This file owns the ONDC Seller product goal. `README.md` owns development and
runtime instructions. Workspace integration status remains in the root
`AGENTS.md` and `PRODUCTION-READINESS.md`.
