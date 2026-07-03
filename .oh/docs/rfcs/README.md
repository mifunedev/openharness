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
| [#525](https://github.com/mifunedev/openharness/issues/525) | Draft | Self-improving-harness roadmap epic, curated into [proposed child issues](rfc-selfimprove-roadmap.md). |
| [#532](https://github.com/mifunedev/openharness/issues/532) | Draft | Standards process — the full RFC/ADR taxonomy, registries, and conformance profiles (deferred scope; see below). |

## Deferred scope

The full IETF-style standards body — the `OH-RFC` / `STD` / `BCP` / `EXP` / `INF`
/ `ADR` document taxonomy, formal registries, an IANA-style allocation authority,
conformance profiles, and a multi-stage lifecycle — is **out of scope for this
index** and tracked in
[#532](https://github.com/mifunedev/openharness/issues/532). This page stays
deliberately proportionate to what the project already produces; reach for the
heavier process only if #532 concludes we need it.
