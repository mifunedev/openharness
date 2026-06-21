# Hermes runtime + auth in Open Harness

Hermes keeps **all** runtime state — config, sessions, skills, memory, **and `auth.json`** — inside one project-local directory:

- `HERMES_HOME=/home/sandbox/harness/.hermes`, set in `.devcontainer/docker-compose.yml`. This is the bind-mounted checkout, so state is host-visible.
- `.hermes/` is gitignored (`.hermes/*` ignored, only `.hermes/README.md` tracked), so credentials never reach version control.
- There is **no** `hermes-auth` named volume and **no** `auth.json` symlink. Both are forbidden — see below.
- `.devcontainer/entrypoint.sh` seeds `~/harness/.hermes/config.yaml` with `skills.external_dirs: ["/home/sandbox/harness/.claude/skills"]` so Hermes loads the harness' in-repo skills by default; it preserves existing user config and only adds the path when absent.
- On boot the entrypoint **heals** any legacy `auth.json` symlink: if `$HERMES_HOME/auth.json` is a symlink it removes it (restoring a real file from the old `/home/sandbox/.hermes/auth.json` volume path if one exists).
- `install/banner.sh` reports authentication from `$HERMES_HOME/auth.json`.

## Why auth.json must NOT be a cross-device symlink

An earlier design set `HERMES_HOME` to the bind mount but symlinked `auth.json` into a home-scoped `hermes-auth` named volume at `/home/sandbox/.hermes`. That broke every auth write (commit `c9d05b4`):

- Hermes' `_save_auth_store` writes a temp file next to `auth.json` (`auth.json.tmp.<pid>.<uuid>`, on the **bind-mount** filesystem), then calls `utils.atomic_replace`.
- `atomic_replace` resolves the symlink (to preserve it) and `os.replace`s the temp onto the **resolved** target on the **named-volume** filesystem.
- A bind mount and a named volume are different devices, so `rename(2)` fails with `OSError: [Errno 18] Invalid cross-device link` (EXDEV).

Hermes hardcodes `auth.json` into `get_hermes_home()` (no separate auth-dir env var) and atomic-writes both `auth.json` and `config.yaml`. So any file Hermes writes must live on the **same filesystem as its temp** — keep them all under one `HERMES_HOME` on a single device. Do not split auth onto a separate volume via symlink.

## Useful verification

```bash
bash -n .devcontainer/entrypoint.sh install/banner.sh
git diff --check
docker compose -f .devcontainer/docker-compose.yml config >/tmp/openharness-compose-config.yml
grep -n 'HERMES_HOME' /tmp/openharness-compose-config.yml
# expect: no hermes-auth volume, no auth.json symlink
! grep -q 'hermes-auth' /tmp/openharness-compose-config.yml && echo "no hermes-auth volume: OK"

# Prove atomic writes work on one device (run inside the sandbox):
docker exec <sandbox> python3 -c '
import os,uuid
h=os.environ["HERMES_HOME"]; a=os.path.join(h,"auth.json"); t=a+f".tmp.{os.getpid()}.{uuid.uuid4().hex}"
open(t,"w").write("{}\n"); os.replace(t, os.path.realpath(a) if os.path.islink(a) else a)
print("replace OK; symlink:", os.path.islink(a)); os.remove(a)'
```
