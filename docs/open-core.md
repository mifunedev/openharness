---
title: "Open-core boundary"
---

# Open-core boundary

Open Harness ships under [Apache-2.0](../LICENSE). Mifune's hosted control
plane is separate and proprietary. This page states that split explicitly so
an evaluator does not have to infer it from the code.

## The split

| Apache-2.0 | Proprietary |
|---|---|
| The runtime | The Mifune Console |
| The `oh` CLI and public SDKs | Provisioning and fleet-management control plane |
| Container definitions and public deployment integrations | Billing, enterprise policy, RBAC, hosted operations |
| The harness spec and interop formats | — |

Customer harness repos stay customer-owned. Open core without crippling the
open core: the moat is the managed platform, not restrictions on modifying
the runtime.

## Why Apache-2.0 rather than MIT

Open Harness's documented adoption model is clone-and-own — companies fork
the repo into private infrastructure and extend it. MIT's bare copyright
grant is sufficient for that but leaves three gaps Apache-2.0 closes:

- an **explicit patent license** from every contributor for claims their
  contribution infringes,
- **patent-retaliation termination** if a recipient sues over the project,
- an **explicit withholding of trademark rights** ([§6](../LICENSE)) — a
  fork may run and sell the software but may not present itself as *Mifune*.

The trademark point is load-bearing precisely because clone-and-own is
encouraged, not merely tolerated.

## Why not the alternatives

- **AGPL / SSPL / BSL** — enterprise review friction, and they contradict
  the "developer-owned, open by default" positioning this project takes.
- **Apache-2.0 + a commercial dual license** — Apache-2.0 already permits
  commercial use, so a paid alternative license grants nothing a licensee
  doesn't already have.

## Prior releases

Prior MIT releases remain usable under MIT. This change governs new code
and future releases; it does not revoke past grants.

## Related

- [`LICENSE`](../LICENSE) · [`NOTICE`](../NOTICE)
- [Security considerations](security-considerations.md)
