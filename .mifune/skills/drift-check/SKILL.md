---
name: drift-check
description: |
  Detect and report three classes of silent harness drift: framework drift
  (origin↔upstream), branch-behind/append-file drift, and cron-staleness
  drift. Never auto-remediates — prints a recommended command for each
  finding without executing it.
  TRIGGER when: asked to check for drift, before a session-critical commit,
  after a long session gap, when MEMORY.md or log.md may have been
  concurrently modified, or on suspicion that a recently-merged cron is
  not running.
---

# Drift Check

Read-only harness drift detector. Reports three drift classes and prints a
recommended remediation command for each finding — never executes any
remediation. This skill never mutates local branches, the working tree,
committed history, the remote, or host state. The sole permitted write is
`git fetch` (updates only remote-tracking refs + `FETCH_HEAD`), which is
non-destructive.

## Instructions

Run all three sections in order and collect the one-line summary for each.
At the end, emit the aggregate `DRIFT:` line only when at least one class
is non-clean.

---

### (A) Framework drift (origin↔upstream)

**Goal**: detect how far `origin/development` lags behind `upstream/development`.

**Step A-1 — preflight upstream remote:**

```bash
git remote get-url upstream 2>/dev/null
```

If this command exits non-zero, print:

```
DRIFT-CHECK: upstream remote not configured — framework drift cannot be checked
```

and skip the rest of Section (A). Do NOT run `git fetch upstream` if the
remote does not exist.

**Step A-2 — timeout-wrapped fetch:**

```bash
timeout 15s git fetch upstream 2>&1
```

If the fetch times out or exits non-zero (network unavailable, DNS failure,
auth error), print:

```
DRIFT-CHECK: upstream fetch failed (offline/timeout) — framework drift unknown
```

and skip the rest of Section (A).

**Step A-3 — count divergence:**

```bash
git rev-list --left-right --count origin/development...upstream/development
```

Output is `<left>\t<right>` where `left` = commits origin is ahead,
`right` = commits origin is behind upstream. Report:

```
DRIFT-CHECK (A): origin/development is N behind upstream/development (M ahead)
```

If `right` is `0`, print a single `OK` token for class A:

```
(A) Framework drift: OK
```

**Step A-4 — derive changed paths and print remediation (only when N > 0):**

```bash
git diff --name-only origin/development...upstream/development
```

Capture the list of changed paths. Print the recommended remediation with
the real paths substituted — NEVER a bare pathless checkout, NEVER a
placeholder:

```
  Recommended: git checkout upstream/development -- <path1> <path2> ...
```

If the path list is empty despite a non-zero behind count (e.g., pure
rename history), print `  (no changed paths detected — inspect manually)`.

---

### (B) Branch-behind / append-file drift

**Goal**: detect whether HEAD is behind its remote tracking branch, the
working tree is dirty, or the current branch is unexpected. This section
is motivated by the append-only-file stale-view trap: `memory/MEMORY.md`
and `memory/<date>/log.md` are appended by concurrent sessions; if HEAD
drifts behind `origin/<branch>`, the in-context view of these files lags
behind reality.

**Step B-1 — identify current branch:**

```bash
BRANCH=$(git branch --show-current)
echo "Current branch: $BRANCH"
```

**Step B-2 — unexpected-branch check:**

The expected branch is `development`. Any other branch is flagged as
unexpected UNLESS it matches the regex `^(feat|fix|task|audit|skill|agent)/`
(a legitimate work branch). A work-branch warning is informational only,
not an error.

```bash
# Pseudocode — implement as inline shell logic:
if [ "$BRANCH" != "development" ]; then
  if echo "$BRANCH" | grep -qE '^(feat|fix|task|audit|skill|agent)/'; then
    echo "DRIFT-CHECK (B): on work branch '$BRANCH' (expected: development) — informational"
  else
    echo "DRIFT-CHECK (B): UNEXPECTED branch '$BRANCH' (expected: development or a feat/fix/task/audit/skill/agent/ work branch)"
  fi
fi
```

**Step B-3 — timeout-wrapped fetch (offline-safe):**

```bash
timeout 15s git fetch origin 2>&1
```

If the fetch fails or times out, note it and continue with local tracking
data only:

```
DRIFT-CHECK (B): origin fetch failed (offline/timeout) — using cached tracking refs
```

**Step B-4 — behind/ahead count:**

```bash
git rev-list --left-right --count HEAD...origin/$BRANCH
```

Output is `<ahead>\t<behind>`. Report:

```
DRIFT-CHECK (B): HEAD is N behind / M ahead of origin/<branch>
```

If both counts are `0` and the working tree is clean and the branch is
expected, print a single `OK` token for class B:

```
(B) Branch-behind drift: OK
```

**Step B-5 — dirty working tree:**

```bash
git status --porcelain
```

If output is non-empty, print:

```
DRIFT-CHECK (B): working tree is dirty — N uncommitted change(s)
  Recommended: git status to review, then git add / git commit or git restore as appropriate
```

When behind count > 0, print:

```
  Recommended: git pull --ff-only origin/<branch>
```

---

### (C) Host/state drift (cron-staleness)

**Goal**: detect schedulable cron files changed after the running
`cron-system` runtime started. Cron body text is hot-reloaded at fire time,
but restart-required frontmatter/config (`schedule`, `enabled`, `agent`,
`tmux`, `worktree`, `preflight`) is loaded when the scheduler arms the cron;
a changed cron file may therefore leave the live runtime using stale config
until a SIGHUP reschedule or runtime restart.

This detector is conservative: without a runtime snapshot it cannot prove
which field changed. It reports that restart-required frontmatter/config **may**
be stale when a schedulable cron file is newer than the live runtime.

For deep host resource triage (memory, disk, CPU, Docker), defer to
`/health-check` — this section targets only cron-staleness.

**Step C-1 — resolve runtime start time:**

Prefer the PID stored in `crons/.pid` via `/proc/<pid>/stat`:

```bash
PID=$(cat crons/.pid 2>/dev/null)
if [ -n "$PID" ] && [ -r "/proc/$PID/stat" ]; then
  # Field 22 of /proc/<pid>/stat is process start time in clock ticks
  # since system boot. Combine with btime from /proc/stat for wall-clock.
  BTIME=$(grep '^btime ' /proc/stat | awk '{print $2}')
  STARTTIME_TICKS=$(awk '{print $22}' /proc/$PID/stat)
  CLK_TCK=$(getconf CLK_TCK 2>/dev/null || echo 100)
  RUNTIME_START=$(( BTIME + STARTTIME_TICKS / CLK_TCK ))
  echo "DRIFT-CHECK (C): cron runtime start time (from /proc): $(date -d @$RUNTIME_START -u '+%Y-%m-%d %H:%M:%S UTC' 2>/dev/null || date -r $RUNTIME_START -u '+%Y-%m-%d %H:%M:%S UTC' 2>/dev/null || echo $RUNTIME_START)"
else
  RUNTIME_START=""
fi
```

If `/proc/<pid>/stat` is inaccessible (PID namespace isolation, non-Linux
host, stale PID), fall back to the `cron-system` tmux session creation
time:

```bash
if [ -z "$RUNTIME_START" ]; then
  TMUX_START=$(tmux display-message -p '#{session_created}' -t cron-system 2>/dev/null)
  if [ -n "$TMUX_START" ] && [ "$TMUX_START" -gt 0 ] 2>/dev/null; then
    RUNTIME_START=$TMUX_START
    echo "DRIFT-CHECK (C): cron runtime start time (from tmux session): $(date -d @$RUNTIME_START -u '+%Y-%m-%d %H:%M:%S UTC' 2>/dev/null || echo $RUNTIME_START)"
  fi
fi
```

If neither source resolves a start time, print and skip the comparison:

```
DRIFT-CHECK: cron runtime start time unavailable — restart runtime if a cron was recently merged
```

Then print a single `OK` token for class C:

```
(C) Cron-staleness drift: OK (start time unavailable — assumed clean)
```

**Step C-2 — compare cron file mtimes:**

When `RUNTIME_START` is set, check each **schedulable cron file** for a
mtime strictly after the runtime start time. A `crons/*.md` file qualifies
only if it passes the predicate below (a leading `---` frontmatter block
declaring a non-empty `schedule:` key that parses with the same Croner
constructor used by `scripts/cron-runtime.ts`, not `enabled: false`, valid
cron id, filename/id match, and safe `agent:` override) — so non-cron docs like
`crons/README.md` and malformed cron files the runtime logs as `SCHED_INVALID`
are skipped by the predicate, never mtime-compared, and never counted.
Qualification is property-based, not a hard-coded name list. The block also
extracts the restart-required frontmatter field set for the diagnostic line:

```bash
INERT=()
# Qualify each crons/*.md as a SCHEDULABLE cron BEFORE the mtime check, mirroring
# scripts/cron-runtime.ts parseCronFile + loadCrons: a file the runtime never
# loads cannot be "inert". A file qualifies IFF all of:
#   1. first line is literally '---' (trailing \r stripped, CRLF-safe) — so a
#      '---' inside a fenced code block (the crons/README.md trap) cannot match,
#   2. a closing '---' delimiter exists on a later line (well-formed frontmatter),
#   3. the leading frontmatter has a non-empty, anchored, comment-excluding
#      schedule: key (^[[:space:]]*schedule: — skips '# schedule:' and substring
#      'pre_schedule:'),
#   4. it is not disabled (no enabled: set to false, bare or quoted),
#   5. the id is a valid cron id and matches the filename stem,
#   6. any agent: override is safe by the runtime's isValidAgentBin() contract,
#   7. the schedule parses with Croner, matching the runtime's isValidSchedule()
#      / SCHED_INVALID path so malformed schedules are skipped, not flagged inert.
# Non-qualifying files (e.g. crons/README.md or invalid schedules) are skipped
# silently — never mtime-compared, never counted toward the inert aggregate. The
# predicate is property-based: no hard-coded cron name list or count.
RESTART_REQUIRED_FRONTMATTER_FIELDS="schedule enabled agent tmux worktree preflight"

cron_fm_value() {
  local key="$1"
  awk -v wanted="$key" '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    {
      i = index($0, ":")
      if (i == 0) next
      k = substr($0, 1, i - 1)
      v = substr($0, i + 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", k)
      if (k != wanted) next
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", v)
      sub(/^["\047]/, "", v)
      sub(/["\047]$/, "", v)
      print v
      found = 1
      exit
    }
    END { exit !found }
  '
}

is_valid_cron_id() {
  printf '%s' "$1" | grep -Eq '^[a-z0-9][a-z0-9-]*$'
}

is_valid_agent_bin() {
  local agent="$1"
  [ -n "$agent" ] || return 1
  case "$agent" in -*|*..*) return 1 ;; esac
  printf '%s' "$agent" | grep -Eq '^[A-Za-z0-9_./-]+$'
}

cron_fm_fingerprint() {
  local fm="$1" key value out=()
  for key in $RESTART_REQUIRED_FRONTMATTER_FIELDS; do
    if value=$(printf '%s\n' "$fm" | cron_fm_value "$key"); then
      out+=("$key=$value")
    else
      out+=("$key=<unset>")
    fi
  done
  printf '%s' "${out[*]}"
}

is_valid_cron_schedule() {
  local schedule="$1" root
  root="${DRIFT_CHECK_ROOT:-}"
  if [ -z "$root" ]; then
    root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
  fi

  DRIFT_CHECK_ROOT="$root" node --input-type=module -e '
    import { createRequire } from "node:module";
    const schedule = process.argv[1] ?? "";
    const root = (process.env.DRIFT_CHECK_ROOT || process.cwd()).replace(/\/$/, "");
    const requireFromRoot = createRequire(`${root}/package.json`);
    const mod = await import(requireFromRoot.resolve("croner"));
    const CronCtor = mod.Cron ?? mod.default?.Cron ?? mod.default;
    let probe;
    let ok = false;
    try {
      probe = new CronCtor(schedule);
      ok = true;
    } catch {
      ok = false;
    } finally {
      probe?.stop?.();
    }
    process.exit(ok ? 0 : 1);
  ' "$schedule" >/dev/null 2>&1
}

is_schedulable_cron() {
  local f="$1" fm schedule enabled id expected_id agent

  [ "$(head -n1 "$f" | tr -d '\r')" = '---' ] || return 1
  awk 'NR>1 { sub(/\r$/,""); if ($0 ~ /^---[[:space:]]*$/) { ok=1; exit } } END { exit !ok }' "$f" || return 1

  fm=$(awk 'NR>1 { sub(/\r$/,""); if ($0 ~ /^---[[:space:]]*$/) exit; print }' "$f")

  schedule=$(printf '%s\n' "$fm" | cron_fm_value schedule) || return 1
  [ -n "$schedule" ] || return 1
  is_valid_cron_schedule "$schedule" || return 1

  if enabled=$(printf '%s\n' "$fm" | cron_fm_value enabled); then
    [ "$enabled" = "false" ] && return 1
  fi

  expected_id=$(basename "$f" .md)
  id=$(printf '%s\n' "$fm" | cron_fm_value id || printf '%s' "$expected_id")
  is_valid_cron_id "$id" || return 1
  is_valid_cron_id "$expected_id" || return 1
  [ "$id" = "$expected_id" ] || return 1

  if agent=$(printf '%s\n' "$fm" | cron_fm_value agent); then
    is_valid_agent_bin "$agent" || return 1
  fi

  return 0
}
for f in crons/*.md; do
  is_schedulable_cron "$f" || continue
  FILE_MTIME=$(stat -c '%Y' "$f" 2>/dev/null || stat -f '%m' "$f" 2>/dev/null)
  if [ -n "$FILE_MTIME" ] && [ "$FILE_MTIME" -gt "$RUNTIME_START" ]; then
    fm=$(awk 'NR>1 { sub(/\r$/,""); if ($0 ~ /^---[[:space:]]*$/) exit; print }' "$f")
    INERT+=("$f")
    echo "DRIFT-CHECK (C): $f modified after runtime start — restart-required frontmatter/config may be stale until SIGHUP reschedule or runtime restart (${RESTART_REQUIRED_FRONTMATTER_FIELDS}; current $(cron_fm_fingerprint "$fm"))"
  fi
done
```

If `INERT` is empty, print a single `OK` token for class C:

```
(C) Cron-staleness drift: OK
```

**Step C-3 — recommend restart (only when inert files found):**

Print (do not execute):

```
  Recommended: reschedule or restart the cron-system runtime
    # preferred live reschedule when the PID is valid:
    kill -HUP $(cat crons/.pid)
    # or restart the tmux session:
    tmux kill-session -t cron-system
    # then relaunch via the documented runtime-start procedure in scripts/cron-runtime.ts
```

Note: this recommendation names the reschedule/restart commands but never runs
them. Reschedule/restart is an intentional operator action, not performed by
this read-only skill.

---

## Output Contract

- Each class prints exactly one summary line when clean: `(A) Framework drift: OK`, `(B) Branch-behind drift: OK`, `(C) Cron-staleness drift: OK`. The `(C) Cron-staleness drift: OK` clean token is unchanged by the predicate — it still prints whenever no schedulable cron is inert.
- When a class has findings, it prints one or more `DRIFT-CHECK (<letter>): ...` detail lines followed by a `Recommended:` block.
- Class (C) evaluates only **schedulable cron files** — `crons/*.md` files that pass the Step C-2 predicate (a leading `---` frontmatter block declaring a non-empty, Croner-valid `schedule:` key, not `enabled: false`, valid cron id, filename/id match, and safe `agent:` override). Non-scheduled docs such as `crons/README.md` and malformed schedules the runtime would log as `SCHED_INVALID` are never evaluated, never emitted as a `DRIFT-CHECK (C)` line, and never counted toward the inert aggregate. Qualification is predicate-based, not a hard-coded name list, so a future non-cron file dropped into `crons/` is handled generically. Detail lines name the restart-required field set (`schedule enabled agent tmux worktree preflight`) and say the frontmatter/config may be stale until SIGHUP reschedule or runtime restart.
- When at least one class is non-clean, print a final aggregate line:

```
DRIFT: <comma-separated summary of non-clean classes>
```

- The aggregate's `cron-staleness drift (N inert file)` term counts only **schedulable cron files**; a non-scheduled doc such as `crons/README.md` never increments it, and any inline example names a real cron (e.g. `crons/heartbeat.md`).

Example (all clean):

```
(A) Framework drift: OK
(B) Branch-behind drift: OK
(C) Cron-staleness drift: OK
```

Example (A and C non-clean):

```
DRIFT-CHECK (A): origin/development is 3 behind upstream/development (0 ahead)
  Recommended: git checkout upstream/development -- .claude/skills/git/SKILL.md scripts/cron-runtime.ts
DRIFT-CHECK (B): ...
(B) Branch-behind drift: OK
DRIFT-CHECK (C): crons/heartbeat.md modified after runtime start — restart-required frontmatter/config may be stale until SIGHUP reschedule or runtime restart (schedule enabled agent tmux worktree preflight; current schedule=0 * * * * enabled=true agent=pi tmux=<unset> worktree=<unset> preflight=<unset>)
  Recommended: reschedule or restart the cron-system runtime ...
DRIFT: framework drift (3 behind upstream), cron-staleness drift (1 inert file)
```

The heartbeat surfaces the `DRIFT:` aggregate line in its log entry and
reply when drift is found. When all classes are clean, the heartbeat
appends nothing extra — the existing `HEARTBEAT_OK` reply is unchanged.
