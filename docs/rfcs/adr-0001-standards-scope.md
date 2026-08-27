# ADR-0001: #532 standards scope

Status: Accepted

Date: 2026-07-03

Related: [#532](https://github.com/mifunedev/openharness/issues/532)

## Decision

Open Harness will keep the lightweight `RFC:` / `ADR:` GitHub issue convention
as the right-sized standards process for now. The broader standards body proposed
in #532 stays deferred: document-type taxonomy, formal registries, an IANA-style
allocation authority, conformance profiles, and a multi-stage lifecycle are not
being built here.

A future need can still justify heavier process, but each need should start as a
new proposed issue with concrete evidence. Until then, the existing convention is
enough.

## Context

Issue #532 proposed a broad standards model for Open Harness. Since then, the
repo has shipped the pieces that are useful today: vocabulary, `.oh/` layout,
security considerations, and the lightweight RFC / ADR index. The index already
records the deliberately deferred heavy scope in its
[Deferred scope](README.md#deferred-scope) section.

This decision closes #532 proportionately. It records what shipped, adds only the
small descriptive pieces still useful to readers, and avoids turning the harness
into a standards organization before there is a concrete need.

## #532 acceptance-criteria disposition

| # | #532 acceptance criterion | Disposition | Rationale |
|---|---|---|---|
| 1 | A standards process document exists for `OH-RFC` / `OH-STD` style proposals. | SHIPPED | The [RFC / ADR index](README.md) shipped a lighter `RFC:` / `ADR:` issue convention (#567/#569); the `OH-STD` taxonomy is part of the [deferred scope](README.md#deferred-scope). |
| 2 | A terminology document defines the core Open Harness vocabulary. | SHIPPED | [Glossary](../glossary.md) shipped the descriptive vocabulary (#565). |
| 3 | A proposed `.oh` directory layout is documented. | SHIPPED | [`.oh/` directory layout](../oh-directory-layout.md) shipped the descriptive map (#566). |
| 4 | A proposed `.oh/harness.yml` manifest is documented with an example. | DONE-HERE | This task resolves it as a descriptive example only: an illustration of current shape, not a required schema, registry-backed format, or conformance target. |
| 5 | Agent profile, loop definition, policy model, trace event, and tool invocation envelope examples exist. | DEFERRED | These are normalized spec surfaces. Per [Deferred scope](README.md#deferred-scope), they need a concrete future interoperability issue before becoming formal examples or schemas. |
| 6 | A first-pass capability registry is drafted. | DEFERRED | Formal registries and an IANA-style allocation authority are explicitly deferred in the [RFC / ADR index](README.md#deferred-scope). |
| 7 | A security considerations document exists. | SHIPPED | [Security considerations](../security-considerations.md) shipped the current enforced and recommended boundaries (#568). |
| 8 | `OH-Core` and `OH-Dev` compatibility profiles are defined. | DEFERRED | Conformance profiles are explicitly deferred in the [RFC / ADR index](README.md#deferred-scope). |
| 9 | The docs clearly separate model, agent CLI, harness, loop, policy, and trace layers. | DONE-HERE | This task resolves the separation as plain vocabulary and cross-references, not as a conformance profile. |

## Consequences

- The lightweight process remains: proposals live as `RFC:` / `ADR:` GitHub
  issues and are indexed when notable.
- The current docs stay descriptive. They explain what Open Harness does today;
  they do not create a standards authority.
- Deferred standards machinery must not be built as part of #532 closure. If a
  future operator needs registries, schemas, profiles, or trace protocols, that
  need should be proposed and scoped in a new issue.
