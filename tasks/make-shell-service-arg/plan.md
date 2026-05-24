# Plan: `make shell [service]` — scope to a compose service, default sandbox

## Context

Today the `Makefile` `shell` target hardcodes one path:

```makefile
shell: ## Connect to the sandbox (agent choice happens inside)
	docker exec -it -u sandbox $(SANDBOX_NAME) zsh
```

It always `docker exec`s into the `openharness` container as the `sandbox` user. The harness is moving toward multi-service compose stacks — `.devcontainer/docker-compose.postgres.yml` already adds a `postgres` service (`${SANDBOX_NAME}-postgres`), and overlays are loaded dynamically through `config.json`'s `composeOverrides[]`. Reaching the postgres (or any future overlay) container today means dropping out of Make and constructing a `docker exec` by hand.

Desired behaviour:

- `make shell` — unchanged: opens a shell in the default `sandbox` service as `sandbox` user.
- `make shell <service>` — opens a shell in the named compose service (`postgres`, future overlays).
- `make shell <service> SHELL_USER=<user>` — overrides the exec user when the target container has no `sandbox` user (postgres, etc.).

Service resolution goes through `docker compose exec`, so overlay-defined services resolve correctly without re-deriving container names, and arbitrary `docker ps` names outside the compose project are intentionally out of reach.

## Approach

### 1. Makefile changes — `/home/sandbox/harness/Makefile`

Add a `SHELL_USER` variable next to `SANDBOX_NAME` (line 6 area):

```makefile
SHELL_USER ?= sandbox
```

Replace the `shell:` target (currently lines 23–24) with a compose-exec variant that reads an optional positional service argument:

```makefile
shell: ## Connect to a compose service shell. Usage: make shell [service] [SHELL_USER=user]
	$(COMPOSE) exec -u $(SHELL_USER) $(SHELL_SERVICE) zsh
```

Add the positional-arg shim just above the target (or grouped with other variable assignments):

```makefile
SHELL_SERVICE ?= sandbox
ifeq ($(firstword $(MAKECMDGOALS)),shell)
  SHELL_POS_ARGS := $(wordlist 2,$(words $(MAKECMDGOALS)),$(MAKECMDGOALS))
  ifneq ($(SHELL_POS_ARGS),)
    SHELL_SERVICE := $(firstword $(SHELL_POS_ARGS))
    $(foreach a,$(SHELL_POS_ARGS),$(eval $a:;@:))
  endif
endif
```

Notes on this idiom:

- Scoped under `ifeq ($(firstword $(MAKECMDGOALS)),shell)` so the catch-all `:; @:` rules only register when `shell` is actually being invoked — does not pollute other targets' namespaces.
- `SHELL_SERVICE` is overridable via env/make var as well, so `make shell SHELL_SERVICE=postgres` works equivalently to `make shell postgres` for tooling that prefers named vars.
- `$(COMPOSE)` already resolves to `docker compose $(COMPOSE_BASE) $(COMPOSE_OVERRIDES)` (line 14), so overlay services like `postgres` are visible.
- Drop the explicit `-it` flag: `docker compose exec` allocates a TTY by default when stdin is a terminal; matches behavior the user expects.

Update the help comment on the `shell` target (rendered by the existing `make help` mechanism at line 44) to document the new form.

### 2. Documentation updates

The bare `make shell` form keeps working unchanged, so existing docs aren't wrong — but the canonical references should mention the new optional argument once, in the same place SANDBOX_NAME is described:

- `/home/sandbox/harness/Makefile` — header comment block already shows `make shell SANDBOX_NAME=mycontainer`; append a similar one-liner for the new form.
- `/home/sandbox/harness/CLAUDE.md` — § Lifecycle → Setup step 3 (Option A) currently shows `make shell` only. Add a one-line note: `make shell <service>` for non-default services.
- `/home/sandbox/harness/AGENTS.md` — mirror the CLAUDE.md edit (Explore reported it's a copy at the same line numbers).
- `/home/sandbox/harness/docs/connecting.md` — Option A section.
- `/home/sandbox/harness/docs/quickstart.md` — "Enter the sandbox" section.

Skip the per-agent docs under `docs/agents/*.md` and `.pi/extensions/slack/README.md` — they reference `make shell` only as the entry-point command, not as an interface to document.

### 3. CHANGELOG entry

Append to `/home/sandbox/harness/CHANGELOG.md` under `## [Unreleased]` → `### Changed`:

```markdown
- `make shell [service]` now accepts an optional compose service name; defaults to `sandbox`. Pair with `SHELL_USER=<user>` for services without a `sandbox` user (e.g., postgres).
```

## Critical files

| File | Change |
|------|--------|
| `Makefile` (lines 4–6, 23–24, ~30 lines added) | Add `SHELL_USER`/`SHELL_SERVICE` vars + positional-arg shim; replace `shell:` body to use `$(COMPOSE) exec` |
| `CLAUDE.md`, `AGENTS.md`, `docs/connecting.md`, `docs/quickstart.md` | One-line addition documenting `make shell <service>` |
| `CHANGELOG.md` | `### Changed` entry under `[Unreleased]` |

## Verification

Run from the harness root with the sandbox up (`make sandbox` already executed):

1. **Default still works** — `make shell` lands in the `openharness` container as `sandbox` (whoami → `sandbox`, hostname matches container).
2. **Service arg routes through compose** — with the postgres overlay enabled in `config.json`'s `composeOverrides[]`, run `make shell postgres SHELL_USER=postgres`. Expect a postgres-container shell (psql binary on PATH, `whoami` → `postgres`).
3. **Service arg without user override surfaces a clear error** — `make shell postgres` (no `SHELL_USER` override) should error from inside the container that user `sandbox` doesn't exist; confirms the override knob is reachable.
4. **Unknown service fails fast** — `make shell nonexistent` exits with `docker compose`'s "no such service" message; the catch-all `:; @:` does not silently swallow it.
5. **`SANDBOX_NAME` override still composes correctly** — `make shell SANDBOX_NAME=othersandbox` (with that container provisioned) still works for the default service.
6. **Make `help` output** — `make help` shows the updated description for `shell`.

Read the modified `Makefile` end-to-end after editing to verify no other target was accidentally affected by the conditional catch-all block.
