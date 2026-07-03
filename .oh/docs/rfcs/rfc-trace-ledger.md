# RFC: Normalized trace / event ledger

Status: Draft foundational spec for [#525](https://github.com/mifunedev/openharness/issues/525).

This RFC describes the normalized append-only event ledger that later
self-improvement work can build on. It is deliberately a spec only: it does not
add runtime emission, provider wiring, replay code, or changes to Ralph,
autopilot, `/eval`, or `/audit`.

It is the first proposed child issue in the
[self-improving harness roadmap curation](rfc-selfimprove-roadmap.md). The terms
`trace`, `session`, `run`, `step`, and `artifact` follow the working definitions
in the [glossary](../glossary.md).

## Goals

- Normalize traces from different agents and harness surfaces into one event
  shape.
- Preserve enough structure for replay, diagnosis, and scoring without storing
  secrets or large raw transcripts by default.
- Reserve a storage layout that fits the `.oh/` control-plane model documented in
  [`.oh/` directory layout](../oh-directory-layout.md).
- Keep the ledger append-only so later analysis can trust historical events.

## Non-goals

- No provider adapters, hooks, or runner changes in this RFC.
- No new `.oh/traces/` or `.oh/sessions/` directory is created by this document.
- No promise of byte-for-byte deterministic replay of model output.
- No central service or external database; the first storage target is files in
  the repo checkout.

## Event model

A ledger is newline-delimited JSON. Each line is one immutable event. Writers
append; they never rewrite old events. If an event needs correction, append a new
event with `corrects_event_id` and the corrected payload.

Common envelope fields:

| Field | Required | Meaning |
|---|---:|---|
| `schema_version` | yes | Schema identifier, initially `trace-ledger.v0`. |
| `event_id` | yes | Stable ID unique within the ledger. |
| `run_id` | yes | One end-to-end run, such as one Ralph iteration or one cron fire. |
| `session_id` | recommended | Agent/session container when known, such as a tmux session. |
| `step_id` | recommended | Current workflow step or task story. |
| `parent_event_id` | optional | Causal parent for nested calls. |
| `corrects_event_id` | optional | Prior event superseded by this append-only correction. |
| `ts` | yes | UTC ISO-8601 timestamp. |
| `type` | yes | Event type from the core vocabulary below. |
| `actor` | yes | Agent, runner, human, or system surface that emitted the event. |
| `source` | recommended | File, command, provider, skill, or runner that produced the event. |
| `payload` | yes | Type-specific JSON object. |

Core event types:

| Type | Payload should capture |
|---|---|
| `Run` | Run start/end, task slug, branch, issue, terminal outcome. |
| `Step` | Workflow step/story start/end, status, dependencies, acceptance surface. |
| `model_call` | Provider/model, redacted input/output refs or hashes, token counts, error state. |
| `tool_call` | Tool name, redacted args summary, result status, referenced artifacts. |
| `file_change` | Path, change kind, diff stat, content hash; raw diffs only as safe artifacts. |
| `command` | Redacted argv, cwd, exit code, duration, output artifact refs or summaries. |
| `git_action` | Branch, remote, ref, commit, merge/fetch/checkout/commit/push metadata. |
| `validation` | Check command/probe, expected result, observed result, PASS/REGRESSION/SKIPPED. |
| `approval` | Human or gate decision, approver surface, reason, scope of authority granted. |
| `handoff_status` | Emitted status token or completion marker, next target, parse result. |
| `artifact_effect` | Artifact created/updated/deleted/read, location, content hash, consumer. |
| `cost_time` | Wall time, model tokens/cost when available, retry count, unattended flag. |

`browser_action` from the #525 epic can initially be represented as a
`tool_call` with browser-specific payload fields. A later RFC can split it into a
first-class type if browser traces need separate scoring semantics.

## Storage layout

The ledger belongs in the `.oh/` machinery namespace because traces are harness
runtime evidence, not application source. The current
[`.oh/` directory layout](../oh-directory-layout.md) correctly lists
`traces/` and `sessions/` as **proposed, not present**. When implemented, this RFC
reserves:

```text
.oh/traces/<run_id>/events.jsonl
.oh/traces/<run_id>/artifacts/<artifact_id>
.oh/traces/<run_id>/manifest.json
.oh/sessions/<session_id>.json
```

- `.oh/traces/<run_id>/events.jsonl` is the append-only ledger.
- `.oh/traces/<run_id>/artifacts/` stores optional sanitized artifacts too large
  or sensitive to inline in events.
- `.oh/traces/<run_id>/manifest.json` records schema version, task/branch/issue
  pointers, retention policy, and artifact hash inventory.
- `.oh/sessions/<session_id>.json` is an index from a longer-lived session to the
  runs it produced; it should not duplicate event payloads.

Until a runtime implementation lands, absence of these directories is the
expected repo state.

## Secret and privacy handling

The ledger must be safe to inspect and safe to keep out of public PRs when it
contains private run evidence.

- Do not record raw environment dumps, credentials, tokens, cookies, private
  `.env` contents, Slack secrets, browser profile data, or host paths that reveal
  private user material.
- Store hashes, artifact references, redacted summaries, and diff stats by
  default; store raw prompts, command output, or file diffs only when explicitly
  classified as safe artifacts.
- Redact command argv and tool arguments before writing events. Prefer
  `argv_redacted` plus `redactions: ["token", "env"]` over lossy prose.
- For `file_change`, record path, change kind, stat, and content hash. Do not
  inline full file contents.
- For `model_call`, record provider/model, token counts, status, and content
  hashes or artifact refs. Raw model prompts/responses are optional sanitized
  artifacts, not required envelope fields.
- If a writer detects a possible secret after append, it must append a correction
  event and quarantine or purge the unsafe artifact by the retention policy; it
  must not silently edit the historical line.

## Minimal events for replay, diagnosis, and scoring

A useful run does not need every possible event, but it needs enough coverage to
explain what happened.

### Replay-required minimum

- `Run` start and end.
- `Step` start/end for each workflow step or user story.
- `model_call` events that identify model/provider, prompt artifact refs or
  hashes, and response status.
- Every harness side effect as `tool_call`, `command`, `git_action`,
  `file_change`, or `artifact_effect`.
- `handoff_status` for terminal status markers and next-step routing.

### Diagnosis-required minimum

- Error payloads on failed `model_call`, `tool_call`, and `command` events.
- `validation` events for checks that passed, failed, regressed, or skipped.
- `artifact_effect` events for required artifacts, especially create/delete/read
  transitions.
- `approval` events whenever a human or gate expands authority or permits a risky
  action.

### Scoring-required minimum

- Final `Run` outcome.
- `validation` outcomes for the regression floor and relevant capability checks.
- `cost_time` events or fields for elapsed time, token/cost totals when
  available, retries, and unattended completion.
- `handoff_status` parse results so malformed completion markers count as harness
  failures, not ambiguous success.

## Minimal JSONL example

Each line below is a complete JSON object.

```jsonl
{"schema_version":"trace-ledger.v0","event_id":"evt_0001","run_id":"run_20260703T190800Z_oh525","session_id":"sess_ralph_oh_selfimprove_foundation","ts":"2026-07-03T19:08:00Z","type":"Run","actor":"ralph","source":".oh/scripts/ralph.sh","payload":{"task":"oh-selfimprove-foundation","branch":"feat/525-oh-selfimprove-foundation","status":"started"}}
{"schema_version":"trace-ledger.v0","event_id":"evt_0002","run_id":"run_20260703T190800Z_oh525","session_id":"sess_ralph_oh_selfimprove_foundation","step_id":"US-002","parent_event_id":"evt_0001","ts":"2026-07-03T19:09:00Z","type":"Step","actor":"ralph","source":".oh/tasks/oh-selfimprove-foundation/prd.json","payload":{"title":"Normalized trace/event ledger RFC (foundational spec, descriptive)","status":"started"}}
{"schema_version":"trace-ledger.v0","event_id":"evt_0003","run_id":"run_20260703T190800Z_oh525","session_id":"sess_ralph_oh_selfimprove_foundation","step_id":"US-002","parent_event_id":"evt_0002","ts":"2026-07-03T19:20:00Z","type":"file_change","actor":"ralph","source":"git diff","payload":{"path":".oh/docs/rfcs/rfc-trace-ledger.md","change":"created","diff_stat":"+170 -0","content_sha256":"sha256:example"}}
{"schema_version":"trace-ledger.v0","event_id":"evt_0004","run_id":"run_20260703T190800Z_oh525","session_id":"sess_ralph_oh_selfimprove_foundation","step_id":"US-002","parent_event_id":"evt_0002","ts":"2026-07-03T19:25:00Z","type":"validation","actor":"ralph","source":"pnpm","payload":{"command":"pnpm run test","exit_code":0,"status":"PASS"}}
{"schema_version":"trace-ledger.v0","event_id":"evt_0005","run_id":"run_20260703T190800Z_oh525","session_id":"sess_ralph_oh_selfimprove_foundation","step_id":"US-002","parent_event_id":"evt_0002","ts":"2026-07-03T19:26:00Z","type":"handoff_status","actor":"ralph","source":"progress.txt","payload":{"marker":"US-002 PASS","next":"US-003","parse_status":"ok"}}
```

## Implementation notes for future child issues

- Add `.oh/traces/` and `.oh/sessions/` to the directory-layout doc only in the
  implementation PR that creates them.
- Decide retention and gitignore rules before writing private traces to disk.
- Keep provider-specific raw logs as optional artifacts; normalize only the
  cross-provider facts that later weakness mining and scoring need.
- Add eval probes for append-only behavior, redaction invariants, and malformed
  handoff-status detection when runtime emission lands.
