# RFC: Experimental pxpipe context-image proxy integration

Status: Draft for [#630](https://github.com/mifunedev/openharness/issues/630).

## Summary

Open Harness should evaluate [`teamchong/pxpipe`](https://github.com/teamchong/pxpipe)
as an **experimental, opt-in local proxy** for compatible coding-agent/model
combinations. It must remain disabled by default and must not be described as a
supported integration until Open Harness reproduces useful savings without an
unacceptable quality regression on representative harness workloads.

This RFC is a decision and evaluation plan. It does not add, install, or enable
pxpipe.

## Context

Long-lived Open Harness sessions repeatedly send large system prompts, tool
schemas, file contents, command output, and conversation history. pxpipe sits
between a client and model API and replaces eligible bulky text blocks with PNG
renders. Its upstream README reports materially lower request size on some
model/client combinations and provides a local dashboard, event log, model
allowlist, profitability gate, and kill switch.

The mechanism is also intentionally lossy. Upstream reports silent
confabulations when dense images contain exact identifiers, with strongly
model-dependent results. Those trade-offs are especially important for coding
agents, where hashes, paths, line numbers, commands, patches, credentials, and
machine-readable output may be correctness- or security-critical.

All performance and quality figures in the pxpipe repository are **upstream
claims**, not Open Harness results. This RFC proposes reproducing the relevant
measurements before any support claim.

## Goals

- Determine whether pxpipe lowers token usage or cost on representative Open
  Harness sessions without materially reducing task success.
- Define a safe, reversible, one-toggle integration shape if the evidence is
  favorable.
- Preserve the current direct-to-provider path as the zero-configuration
  default.
- Make lossy transformation, routing, model scope, and local data retention
  visible to the operator.
- Establish promotion criteria from experimental to supported.

## Non-goals

- Enabling pxpipe by default.
- Vendoring or forking pxpipe.
- Treating image-rendered context as byte-exact storage or compression.
- Replacing model-native prompt caching, context compaction, or subagent
  delegation.
- Accepting upstream benchmark results as Open Harness validation.
- Implementing the integration in this RFC PR.

## Proposed decision

Adopt a two-stage policy:

1. **Draft / evaluation:** maintain this RFC and an Open Harness benchmark plan;
   operators may use pxpipe manually as bring-your-own tooling.
2. **Experimental integration:** only after the evaluation gate passes, add a
   disabled-by-default, version-pinned, one-toggle integration with explicit
   warnings and rollback. “Experimental” is not “supported” under the runtime
   support contract.

Promotion to **supported** requires documentation, a one-toggle path, validation,
and a dedicated regression/drift guard, consistent with the runtime support
contract in [`rfc-runtime-support.md`](rfc-runtime-support.md).

## Candidate architecture

```text
coding agent
    |
    | provider request (opt-in base URL)
    v
pxpipe on 127.0.0.1
    |  eligible bulk -> PNG pages
    |  unsafe/recent/unsupported content -> text pass-through
    v
model provider API
```

The preferred implementation shape, if approved later, is:

- a `harness.yaml` experimental integration toggle;
- installation pinned to an exact package version and integrity-checked through
  the existing install path;
- a supervised sandbox-local process bound to loopback only;
- explicit provider base-URL wiring for opted-in agent sessions, not a global
  transparent network interception;
- an exact model-ID allowlist, with all other models passed through unchanged;
- health/status output that shows whether requests are proxied, transformed, or
  passed through;
- an immediate operator kill switch that restores the direct provider URL;
- local logs only, with documented location, retention, permissions, and
  deletion procedure.

No implementation choice is ratified by this RFC until the compatibility spike
confirms pxpipe's actual client and endpoint behavior.

## Safety and trust boundaries

### Lossy context

Image transformation can produce plausible but incorrect readings. The initial
policy must conservatively keep verbatim-sensitive content as text, including:

- secrets, tokens, private keys, and credentials;
- commit SHAs, checksums, UUIDs, issue/PR IDs, ports, and exact versions;
- shell commands and arguments;
- patches, conflict markers, and generated diffs;
- structured data consumed as a protocol (JSON, YAML, TOML, XML, CSV);
- test failures where punctuation, line numbers, or expected/actual values are
  decisive;
- explicit user requests for exact quotation or byte-for-byte reproduction.

A practical guard must be demonstrated; documentation alone is insufficient.
If pxpipe cannot reliably classify or pin these blocks as text through a stable
API, Open Harness should stop at BYO documentation rather than ship a first-class
integration.

### Credential path

A local proxy receives provider credentials and full request bodies. Therefore:

- the process must bind only to loopback by default;
- credentials must stay in memory/environment and never enter pxpipe event logs;
- request/image/event retention must be documented and minimized;
- dashboard access must not be exposed through forwarded ports by default;
- operators must be told that adding this proxy expands the trusted computing
  base for model traffic;
- dependency updates require review rather than an unpinned `npx` fetch on every
  launch.

### Supply chain and licensing

Before implementation, verify the published package provenance, package/repo
license, lockfile behavior, transitive native dependencies, release process, and
whether the installed artifact corresponds to reviewed source. The source
repository currently states MIT; the implementation PR must verify package
metadata and pin the selected artifact.

## Compatibility scope

The evaluation matrix must name exact combinations rather than claiming generic
support:

| Dimension | Initial question |
|---|---|
| Harness/client | Claude Code first; Pi only if its provider endpoint and image semantics are compatible |
| Provider API | Anthropic Messages first; other endpoints evaluated separately |
| Model | Exact IDs only; default to pxpipe's upstream-safe allowlist, then verify independently |
| Context type | system/tool docs, old history, and large tool results measured separately |
| Prompt caching | compare cache reads/writes and total billed usage, not raw input alone |
| Session type | code edit, debugging, log triage, documentation, and exact-identifier tasks |

Unsupported clients, endpoints, and models must bypass transformation or fail
closed to the direct provider path.

## Evaluation plan

Use paired or replayable workloads with pxpipe **off** and **on**. Record the
client, exact model ID, pxpipe version/config, workload revision, and provider
pricing date.

### Required measures

- end-to-end task success and test/eval result;
- exact-identifier recall and command/patch fidelity;
- input, cache-write, cache-read, and output tokens;
- total estimated cost, with formula and prices recorded;
- latency to first token and total wall time;
- transform/pass-through rate and reason;
- proxy failures, retries, and direct-path rollback success.

### Proposed experimental gate

The first-class experimental integration may proceed only if all are true:

1. No secrets or explicitly pinned verbatim-sensitive blocks appear in retained
   images/events during the test corpus.
2. Exact-identifier and structured-output guard tests show no regression because
   those blocks remain text.
3. Representative coding-task success is non-inferior within the agreed sample;
   every divergent result is reviewed rather than averaged away.
4. Median end-to-end token cost improves materially on at least one named,
   common Open Harness workload after cache accounting.
5. Sparse/already-cached workloads correctly pass through when transformation is
   not beneficial.
6. Proxy failure and the kill switch restore direct operation without changing
   repository state or credentials.

Numeric non-inferiority margins, minimum sample sizes, and the threshold for
“materially” must be set in #630 before implementation begins; choosing them
after seeing results would bias the decision.

## Rollout

1. **Compatibility spike:** manually exercise pxpipe with exact supported client,
   endpoint, and model combinations; publish raw methodology and summarized
   results.
2. **Safety spike:** verify text-pinning/classification, credential handling,
   loopback binding, event-log behavior, and rollback.
3. **Experimental implementation:** add the pinned, disabled-by-default toggle,
   docs, process supervision, and a deterministic smoke probe.
4. **Limited operator trial:** collect opt-in evidence; do not silently upload
   raw prompts or logs.
5. **Promotion decision:** accept supported status, keep experimental, revert to
   BYO docs, or supersede this RFC.

## Rollback

Rollback must be one command or one configuration change: disable the toggle,
stop the proxy, and restore the direct provider base URL. Existing agent
configuration and credentials must remain valid. Removal must include the local
event-log and cached-image cleanup path without deleting unrelated agent state.

## Alternatives

### Document pxpipe as BYO tooling

Lowest ownership and supply-chain burden. This is the fallback if stable safety
controls or compatibility hooks are unavailable.

### Native client/provider prompt caching

Lossless and preferable where effective, but savings vary by provider, client,
and workload. It is complementary rather than automatically equivalent.

### Text compaction and summarization

More model-independent but also lossy and prone to omitting details. Existing
compaction remains the baseline for quality and cost comparisons.

### Subagent delegation and selective file reads

Reduces context by changing work decomposition rather than representation. It
should continue regardless of pxpipe and may outperform proxying on sparse work.

### Do nothing

Preserves the smallest trusted computing base and avoids image-read errors. This
is the correct outcome if Open Harness evidence does not clear the gate.

## Open decisions

- First-class integration or BYO documentation only?
- Which exact client/provider/model combination forms the initial support cell?
- Can pxpipe's API enforce the required verbatim-text policy without a fork?
- Who owns benchmark fixtures and version/model recertification?
- What sample size and non-inferiority margin are required?
- What token/cost improvement justifies the added process and supply-chain
  complexity?
- Should event logging default off, redact by construction, or use bounded local
  retention?
- Does this belong under integrations, harness-specific docs, or a future
  cross-provider proxy category?

## Acceptance criteria

This RFC may move from Draft to Accepted only when:

- #630 resolves the open decisions and records the chosen scope;
- an Open Harness-owned evaluation report separates upstream claims from local
  results;
- security, data-retention, provenance, and rollback requirements have owners;
- the implementation plan includes docs and a regression/drift probe;
- maintainers explicitly agree that the measured benefit justifies the added
  complexity and trusted component.

Until then, pxpipe remains unshipped and unsupported by Open Harness.
