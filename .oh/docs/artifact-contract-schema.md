# Artifact-contract schema

An **artifact contract** is an optional block a task spec (`prd.json`) may declare
to state, up front, what the completed work must leave behind and under what
constraints — so the audit gate can fail a run whose promised artifacts are
missing or unverifiable instead of trusting prose. This is the concrete
realization of item 5 of the
[self-improving harness roadmap](rfcs/rfc-selfimprove-roadmap.md) — *"Artifact
contract declaration and audit enforcement: let task specs declare required
artifacts, allowed locations, destructive-edit constraints, verification
commands, rollback conditions, and final handoff requirements; fail audit when
they are missing or unverifiable."*

**The block is optional and additive.** A `prd.json` with no `artifact_contract`
key behaves exactly as before — the block only *adds* enforceable guarantees, it
never relaxes an existing gate. Today the one field the [`/audit implementation`](../skills/audit/references/implementation.md)
Gate 1 mechanically enforces is `required_artifacts` (a declared path missing on
disk is a hard `AUDIT-FAIL`); the remaining fields are declarative contract terms
a proposal generator, an auditor, or a human reviewer reads and holds the work
to. Declaring a field you do not yet enforce is intentional — the contract is the
written record; the enforcer catches up to it.

## Where it lives

The block sits at the **root of `prd.json`**, a sibling of `userStories` — so a
reader (`jq '.artifact_contract'`) finds the whole contract in one place:

```jsonc
{
  "schemaVersion": 1,
  "project": "Open Harness",
  "branchName": "task/<slug>",
  "artifact_contract": { /* the block documented below */ },
  "userStories": [ /* ... */ ]
}
```

## The seven fields

Every field is an array. All seven are **optional**; omit a field to make no
promise on that axis. Field names are canonical — declare them verbatim so a
`jq` reader (and Gate 1) finds them.

| Field | Type | Meaning |
|-------|------|---------|
| `required_artifacts` | `string[]` | Repo-relative paths the finished task **must** leave on disk. **Enforced:** [`/audit implementation`](../skills/audit/references/implementation.md) Gate 1 `jq`-reads this array and a listed path that is absent is a hard `AUDIT-FAIL`. |
| `allowed_locations` | `string[]` | Path prefixes the task's edits may land within — the self-edit surface for this unit (typically a subset of `OWNED_PATHS`; see the [repair-operator registry](repair-operator-registry.md) Tier 1). |
| `forbidden_destructive_edits` | `string[]` | Paths or globs that must **not** be deleted or destructively rewritten — the lines this task promises to leave intact. |
| `verification_commands` | `string[]` | The exact shell commands that prove the work (probes, eval runner, targeted checks). A reader runs these to confirm the deliverable, not to trust the narrative. |
| `acceptance_criteria` | `string[]` | Contract-level acceptance gates for the whole unit — the done conditions, distinct from and complementary to the per-story `userStories[].acceptanceCriteria`. |
| `rollback_conditions` | `string[]` | The observable conditions under which the change must be reverted (e.g. a green→red probe regression, CI red, a broken enforcer). |
| `final_handoff_requirements` | `string[]` | What must be true before the unit is handed off for the human merge gate (e.g. CI green, docs indexed, no new regression, PR marked ready). |

## Minimal embeddable example

A complete `artifact_contract` block, ready to paste at the root of a `prd.json`:

```json
"artifact_contract": {
  "required_artifacts": [
    ".oh/docs/artifact-contract-schema.md",
    ".oh/evals/probes/artifact-contract-audit.sh"
  ],
  "allowed_locations": [
    ".oh/docs/",
    ".oh/skills/audit/",
    ".oh/evals/probes/"
  ],
  "forbidden_destructive_edits": [
    ".oh/hooks/deny-env-dump.sh",
    ".oh/hooks/deny-secret-paths.sh"
  ],
  "verification_commands": [
    "bash .oh/evals/probes/artifact-contract-audit.sh",
    "bash .oh/skills/eval/run.sh"
  ],
  "acceptance_criteria": [
    "All seven artifact-contract fields documented verbatim",
    "Gate 1 FAILs on a missing declared required_artifact"
  ],
  "rollback_conditions": [
    "Any green->red probe regression in RESULTS.md",
    "Gate 1 change makes a no-contract prd.json fail"
  ],
  "final_handoff_requirements": [
    "bash .oh/skills/eval/run.sh green with no new regression",
    "Both new docs indexed in .oh/docs/README.md"
  ]
}
```

The smallest useful contract is just the enforced field:

```json
"artifact_contract": {
  "required_artifacts": [".oh/docs/artifact-contract-schema.md"]
}
```

## Related

- [Repair-operator registry](repair-operator-registry.md) — the trust tiers a
  repair is granted; `allowed_locations`/`forbidden_destructive_edits` map onto
  its Tier-1 self-edit surface and Tier-2/3 guarded surfaces.
- [`/audit implementation`](../skills/audit/references/implementation.md) — Gate 1 is the enforcer for
  `required_artifacts`.
- [Self-improving harness roadmap](rfcs/rfc-selfimprove-roadmap.md) — item 5 is
  this schema's parent RFC; item 7 is the repair registry.
