# RFC / ADR index

A lightweight convention for proposing and recording notable changes to Open
Harness. This is a **convention, not a standards organization** — there is no
formal document-type taxonomy, no registries, and no conformance profiles. It
formalizes the RFC-style issues the project already writes, nothing more.

## Convention

A proposal is a **GitHub issue** whose title starts with `RFC:` (a change we want
to discuss and adopt) or `ADR:` (an architecture decision we want to record on the
record). Discussion happens on the issue; its outcome is captured by the issue's
state and the index below. Every proposal moves through the same minimal
lifecycle:

- **Draft** — open issue, under discussion.
- **Accepted** — agreed, and being (or already) implemented.
- **Superseded** — replaced by a later proposal (link to the replacement).

That is the whole lifecycle — three states by design (kept to ≤4 deliberately).
No stage gates, no editors, no numbering scheme beyond the GitHub issue number.

## Index

| Proposal | Status | Summary |
|---|---|---|
| [#531](https://github.com/mifunedev/openharness/issues/531) | Accepted | Portable `.oh/` control plane — `oh init` / `oh update`, the project-root seam, and the machinery-namespace relocation. |
| [#525](https://github.com/mifunedev/openharness/issues/525) | Draft | Self-improving-harness roadmap epic; the [curation doc](rfc-selfimprove-roadmap.md) is the proposed child-issue index for human filing. |
| [Trace/event ledger RFC](rfc-trace-ledger.md) | Draft | Foundational #525 child spec for the normalized append-only event ledger, storage layout, redaction rules, and replay/diagnosis/scoring event set. |
| [#532](https://github.com/mifunedev/openharness/issues/532) | [Accepted — resolved lightweight; heavy scope deferred](adr-0001-standards-scope.md) | Standards process — keep the lightweight RFC / ADR convention; defer the full taxonomy, registries, lifecycle, and conformance profiles until a concrete future issue needs them. |
| [#592](https://github.com/mifunedev/openharness/issues/592) | Draft | Runtime support — the A1/A2/A3 axis taxonomy and the "supported runtime" contract; the [companion spec](rfc-runtime-support.md) holds the fit matrix, the Cloudflare fit, and the Crabbox control-plane comparison. Implementation epic [#591](https://github.com/mifunedev/openharness/issues/591). |
| [Optional CodeLayer remote-daemon RFC](rfc-codelayer-remote-daemon.md) ([#635](https://github.com/mifunedev/openharness/issues/635)) | Draft | Docs-only proposal evaluating optional browser-based session management; it does not declare or implement CodeLayer support. |

## Decision records

| Record | Decision |
|---|---|
| [ADR-0001: #532 standards scope](adr-0001-standards-scope.md) | The lightweight RFC / ADR convention is sufficient for now; heavier taxonomy, registries, lifecycle, and conformance machinery stay deferred until a concrete future need appears. |

## Deferred scope

The full IETF-style standards body — the `OH-RFC` / `STD` / `BCP` / `EXP` / `INF`
/ `ADR` document taxonomy, formal registries, an IANA-style allocation authority,
conformance profiles, and a multi-stage lifecycle — remains **out of scope for
this index**. [ADR-0001](adr-0001-standards-scope.md) resolves #532 with the
lightweight convention above and keeps that heavier machinery deferred until a
concrete future issue needs it.
