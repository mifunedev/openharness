# Disposable PM2/Pi study fixture

This fixture is scoped to issue #677 evidence. It is synthetic, credentialless,
and disposable. It must never import, execute, or inspect production bridge,
supervisor, extension, settings, config, state, lock, log, tmux, gateway, or
runtime content.

`contract.mjs` constructs the equivalent of an `env -i` launch: child processes
receive only the fixed allowlist and manifest-declared fixture variables. Every
home and `PM2_HOME` is beneath a fresh runtime root; PM2 state is mode `0700`.
Candidate launch is forbidden unless `proveDeniedNetwork()` returns `PROVEN`;
an unavailable isolation primitive is safe `NOT RUN`.

`process-registry.mjs` owns exact PID, parent PID, Linux `/proc` start time, role,
candidate, and namespace registration. Cleanup signals only revalidated entries
in reverse order with bounded TERM-to-KILL escalation and is idempotent.

`baseline.mjs` exposes only synthetic ready/work/status/exit/restart-count and
live-unhealthy sentinel surfaces over bounded UTF-8 LF JSONL. It contains no
production or provider integration. US-003/US-004 verification never launches
it or any PM2 candidate.

`direct-rpc-topology.mjs` characterizes US-006's direct topology without a
wrapper. It pins PM2 7.0.3 identity/source metadata, inspects only the public
installed Pi package/source, and retains every stdin/stdout/ready/EOF/exit and
lossless-frame obligation as unverified when network namespace isolation is
unavailable. The US-006 `run.mjs` branch checks that prerequisite before setup
or candidate launch and emits three explicit non-comparable `NOT RUN` slots,
metadata-only delta evidence, and zero-process cleanup proof.
