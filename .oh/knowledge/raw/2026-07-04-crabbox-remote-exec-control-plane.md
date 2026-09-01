# Source: https://crabbox.sh/how-it-works.html

Capture date: 2026-07-04 (UTC). Verbatim synthesis of the Crabbox "How It Works"
documentation as fetched via WebFetch, plus the canonical project URLs the
`crabbox-remote-exec-control-plane.md` wiki entry cites.

## Canonical source URLs
- Docs (how it works): https://crabbox.sh/how-it-works.html
- Docs home: https://crabbox.sh/
- Repo: https://github.com/openclaw/crabbox
- Provider example (Upstash Box): https://crabbox.sh/providers/upstash-box.html

## Fetched body (how it works)

Crabbox is "a remote software testing and execution control plane built around
short-lived testboxes and sandboxes." Tagline: "warm a box, sync the diff, run the
suite." It keeps the local edit-save-run loop but moves expensive or
evidence-producing work onto a remote runner: lease, sync, run, release.

### Five-phase lifecycle for `crabbox run`
- **Plan** — CLI loads config (flags → env → repo config → user config → defaults),
  generates a temporary lease ID (`cbx_` + 12 hex), creates a per-lease SSH key at
  `<user-config>/crabbox/testboxes/<lease>/id_ed25519`.
- **Lease** — CLI sends `POST /v1/leases` to the coordinator with class, provider,
  target, TTL, idle timeout, slug, requested capabilities, and the SSH public key.
  The coordinator authenticates, enforces spend caps, provisions the machine, and
  returns host details + final lease ID.
- **Sync** — after SSH readiness, seed remote git from the configured origin and base
  ref; compare local/remote sync fingerprints and skip rsync if nothing changed;
  otherwise rsync the dirty checkout into the work root (e.g.
  `/work/crabbox/<lease>/<repo>`). Local-first; does not require a clean checkout.
  Excludes heavy dirs from repo config; guards against mass deletion of tracked
  files. `crabbox sync-plan` = read-only preview.
- **Run** — execute the requested command over SSH, streaming stdout/stderr; heartbeats
  in background; mirror progress to the broker as a run record with phased events.
- **Release** — unless `--keep`, release the lease; the broker deletes the runner and
  frees provider-side state.

### Architecture (three layers)
- **CLI** (`cmd/crabbox`, `internal/cli`): config + flags; per-lease SSH key; SSH
  readiness; git seeding + rsync; sync fingerprints; remote command + streaming; the
  control WebSocket when available.
- **Coordinator / broker**: holds provider credentials and owns lease state, expiry,
  cleanup, usage accounting, and cost guardrails. Runs on **Cloudflare Workers with a
  Durable Object**, or as a Node.js service with PostgreSQL + pg-boss.
- **Runner** (provider-managed): vanilla machines holding no broker secrets — "leaves:
  provisioned, used, deleted."

Credential segregation: provider secrets stay with the coordinator; per-lease SSH keys
stay local; runners hold no broker secrets. Run records, logs, telemetry, screenshots,
artifacts stay with Crabbox, not on the leased machine.

Comm flow:
```
CLI -> coordinator (HTTPS/JSON) -> provider API
CLI -> runner (SSH/rsync, direct)
```

### Providers
Brokered: **Hetzner, AWS, Azure, GCP**. Direct-only adapters for sandbox runners,
static SSH hosts, local containers, and the rest of the set. `provider: ssh` points at
a preexisting machine and bypasses the broker even when a broker URL is configured.

### Warm boxes / ephemerality / concurrency
`crabbox warmup` provisions a box without running a command, keeping it ready for reuse
by slug or ID:
```
crabbox warmup --profile project-check
crabbox run --id blue-lobster -- pnpm test:changed
crabbox ssh --id blue-lobster
crabbox stop blue-lobster
```
Each lease gets a friendly slug (e.g. `blue-lobster`, `swift-crab`); most commands
accept slug or the canonical `cbx_…` ID via `--id`. Heartbeats update `lastTouchedAt`
and recompute idle expiry; a warm lease untouched past its idle timeout is released by
the durable scheduler. Active-lease caps are enforced — exceeding them fails creation
with HTTP 429.

### Isolation model
Docs describe runners as "vanilla" full machines accessed over SSH (VM-like), not
lightweight containers; macOS/WSL2 use the POSIX rsync contract, native Windows uses a
PowerShell + tar archive sync. Isolation depth per se (container vs VM vs microVM) is
not specified — it depends on the chosen provider.

### Value vs. local execution
Credential isolation (provider secrets off dev machines), cost control (active-lease +
monthly spend caps, per-lease usage/cost tracking), guaranteed cleanup even if the CLI
crashes, safe shared infrastructure for multiple users/agents, and ephemeral
per-run machines that avoid long-lived resource pollution.
