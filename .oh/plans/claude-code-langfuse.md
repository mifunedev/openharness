# Claude Code Langfuse documentation plan

## Purpose and discovery correction

Extend issue #480 so Open Harness documents optional Langfuse end-to-end
observability for both Pi and Claude Code. Initial discovery considered a native
Claude OpenTelemetry/environment-variable recipe. Verification on 2026-07-11
found that the supported, lowest-friction Claude Code integration is the
**Langfuse Claude Code marketplace plugin**. It installs Stop and SessionEnd
hooks; this change deliberately does not introduce an OTLP recipe, custom
launcher, MCP server, adapter, native service, Compose change, or networking
change.

## Authoritative sources (verified 2026-07-11)

- [Langfuse Claude Code integration](https://langfuse.com/integrations/developer-tools/claude-code), last edited 2026-06-22.
- [Langfuse Claude Observability Plugin](https://github.com/langfuse/Claude-Observability-Plugin), observed at commit [`9ad0076a7a24e8673ac6e7ac6f7b658b18826bb6`](https://github.com/langfuse/Claude-Observability-Plugin/commit/9ad0076a7a24e8673ac6e7ac6f7b658b18826bb6), plugin version 1.0.0.
- Anthropic's current [Claude Code plugins](https://code.claude.com/docs/en/plugins) and [hooks guide](https://code.claude.com/docs/en/hooks-guide), used to verify plugin scope, configuration, and hook lifecycle.
- Existing pinned [Pi package documentation](https://www.npmjs.com/package/pi-langfuse/v/1.5.6) and its source commit, retained in the integration guide.

## Scope and files

1. Update `.oh/docs/integrations/langfuse.md` with separate Pi and Claude Code
   paths while retaining Pi configuration, privacy precedence, and the local
   self-hosted Langfuse walkthrough.
2. Add the official Claude marketplace install and configuration commands,
   endpoint-selection guidance for host, sandbox, shared Docker network, and
   remote/Cloud deployments, lifecycle commands, verification, and
   troubleshooting.
3. Add a concise optional-observability cross-link to
   `.oh/docs/harnesses/claude-code.md`.
4. Clarify that `.devcontainer/.example.env`'s Langfuse block is Pi-only;
   Claude plugin configuration owns Claude credentials, so no variables are
   added and Compose is not changed.
5. Record the user-visible documentation addition in `CHANGELOG.md` under
   `Unreleased / Added`.

## Security and privacy model

- Langfuse is an external data boundary. Never put public or secret keys in
  tracked files, shell history, screenshots, or chat.
- Pi and Claude offer end-to-end observability, not identical schemas or
  privacy semantics. Pi retains its explicit capture presets (including
  `metadata-only`) and saved Pi configuration.
- The Claude plugin has no Pi-style metadata-only or prompt-off control and no
  general redaction. It captures conversation and tool data, so users must
  disable it at user scope before sensitive sessions.
- Claude plugin credentials are entered through Claude's plugin configuration
  and stored according to upstream Claude plugin configuration/OS-keychain
  behavior. Open Harness persists `~/.claude` on the `claude-auth` volume, but
  OS-keychain availability and persistence are platform-dependent and must be
  verified after a rebuild. Pi and Claude may use the same Langfuse key pair
  but save independent settings.

## Validation

- Check the official command spelling, configuration field names/defaults,
  plugin version/commit, data-capture claims, scopes, endpoint URLs, and
  lifecycle commands against the verified findings and Claude Code CLI help.
- Review the rendered Markdown hierarchy and ensure no unsupported native OTEL,
  MCP, launcher, adapter, service, credential, or Compose instruction appears.
- Run `git diff --check`, the core docs fast-path probe, core typecheck/script
  tests, and the companion website typecheck/production build.
- From a shared-network sandbox, verify Langfuse health and the prerequisites,
  then use non-sensitive credentials entered by the operator to install and
  configure the plugin, send one test turn, and confirm its turn trace,
  generations, tool spans, session grouping, and token usage when available.
- Disable the plugin at user scope, restart Claude Code, send a second uniquely
  named test turn, and confirm no new trace is created. Re-enable only with
  operator approval.
- Do not test for a prompt-content-off mode: the official plugin has none.
  Instead confirm injected skill instruction content is absent under its
  default `CC_LANGFUSE_CAPTURE_SKILL_CONTENT=false` setting.
- Scan the diff and test output for public keys, secret keys, encoded
  authorization values, and generated credential files.

## Explicit non-goals

- Installing or configuring the plugin in a live Claude account.
- Adding credentials, environment injection, Compose services, Docker networks,
  custom hooks, MCP servers, OTLP exporters, launchers, or adapters.
- Changing Pi saved configuration or its documented privacy semantics.
- Claiming Claude captures hidden reasoning/thinking blocks; the examined
  plugin text extractor includes text blocks only.
