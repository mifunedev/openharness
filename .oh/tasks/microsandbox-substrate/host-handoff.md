# Host handoff — P0 `wsl2-substrate-spike`

Paste the block below to an agent that runs on the **WSL2 host**, outside the Open
Harness container. The block is self-contained.

Context for the operator, not for the paste: the sandbox container classified P0 as
BLOCKED. The container has no `/dev/kvm`, no Docker socket, and no host shell, so it
cannot run one command of this spike. Every later phase of the MicroSandbox plan
waits on this result.

---

## PASTE FROM HERE

You run on a WSL2 host. Your job is a **measurement spike**. You write no
application code, you edit no repository file, and you open no pull request.

### Objective

Measure which container isolation tier runs on this host. Test two candidates:
gVisor (`runsc`) and MicroSandbox (`msb`). Return one filled result table and one
verdict for each candidate.

### The oracle — read this before step 0

A presence check is not a result. `command -v runsc`, `command -v msb`, and
`[ -c /dev/kvm ]` all succeed on a host that then fails to boot the sandbox.

A candidate reads **GREEN** on a round trip alone: `runsc` or `msb` reports healthy
**and** a command returns stdout that a booted sandbox produced.

Each candidate ends **GREEN**, **RED**, or **BLOCKED** with a stated reason.
"Unknown" is not a terminal state. If you cannot finish a step, report BLOCKED and
name the missing thing.

### Constraints

1. Steps 0 through 2 install packages and change the Docker daemon. Ask the operator
   before the first `sudo` command. Report what you plan to change.
2. Record the real output of every command. A verdict with no pasted output does not
   count.
3. Publish no overhead percentage from memory. The upstream gVisor performance guide
   measures the `ptrace` platform, not the default `systrap` platform. Report the two
   timings you measure and the ratio between them.
4. A network failure inside a sandbox may be policy, not capability. MicroSandbox
   blocks private ranges, loopback, link-local, and cloud metadata by default. Label
   each failure `policy` or `capability` before it enters a verdict.
5. Never pipe an installer straight to a shell.
6. Download each installer to a file, read the file, then run the file.
7. Report a blocker rather than improvise a workaround. A wrong measurement is worse
   than a missing measurement.

### Step 0 — record the starting state

```bash
uname -r
head -2 /etc/os-release
ls -l /dev/kvm
docker context ls
docker info --format '{{.OperatingSystem}} | runtimes: {{.Runtimes}}'
ldd --version | head -1
```

`docker context ls` selects the path.

**A `desktop-linux` context confirms the Docker Desktop blocker.** The Docker daemon
then runs in the `docker-desktop` WSL distribution, not in this one. The
`docker-desktop` distribution keeps no persistent path for the `runsc` binary, and a
Docker Desktop restart discards it. Upstream records the gap as
`google/gvisor#11238`.

**Path A — install Docker Engine in this distribution.** This path is the cheap
unblock. Docker Engine then runs in the same distribution as `runsc`,
`/etc/docker/daemon.json` persists, and `runsc install` behaves as upstream
documents. Prefer path A.

```bash
curl -fsSL https://get.docker.com -o /tmp/get-docker.sh   # read it, then run it
sudo sh /tmp/get-docker.sh
sudo usermod -aG docker "$USER"          # log out and back in
sudo service docker start                # WSL2 Ubuntu 22.04 ships no systemd by default
docker context use default
docker info --format '{{.OperatingSystem}}'   # expect the distribution, not "Docker Desktop"
```

Docker Desktop stays installed. `docker context use desktop-linux` switches back.
Turn off WSL integration for this distribution in Docker Desktop settings when the
two daemons conflict.

**Path B — the Docker Desktop workaround.** Install `runsc` into the `docker-desktop`
distribution and edit `daemon.json` through the GUI. Record path B as RED for a
default substrate, whatever the spike measures. A substrate that the operator
reinstalls after every restart is not a default.

Report which path you took before you continue.

### Step 1 — install gVisor. Path A only.

```bash
curl -fsSL https://gvisor.dev/archive.key | sudo gpg --dearmor -o /usr/share/keyrings/gvisor-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/gvisor-archive-keyring.gpg] https://storage.googleapis.com/gvisor/releases release main" | sudo tee /etc/apt/sources.list.d/gvisor.list
sudo apt-get update && sudo apt-get install -y runsc
sudo runsc install
sudo service docker restart
docker info --format '{{.Runtimes}}'     # expect runsc listed
```

`runsc` in that output is a presence check, not a result. Continue to step 2.

### Step 2 — the three gVisor spikes, in order

**Spike 1 — does it boot.**

```bash
docker run --runtime=runsc --rm hello-world
```

Pass condition: the container prints the hello-world text.

**Spike 2 — does tmux survive. This spike carries the most weight.**

```bash
docker run --runtime=runsc --rm -it debian:bookworm-slim \
  bash -c 'apt-get update -qq && apt-get install -y -qq tmux >/dev/null && tmux new-session -d -s t "sleep 60" && tmux ls'
```

Pass condition: `tmux ls` lists the session.

This spike decides the whole candidate. The Open Harness process model makes tmux
normative, and no upstream gVisor document states how `runsc` handles PTYs. A tier
that cannot hold a detached tmux session cannot host the workspace. Report a failure
here in full, with the exact error.

**Spike 3 — the cost nobody has published.**

Run the same command twice in the same directory, once under each runtime. Use a
directory that holds a `package.json` and a `package-lock.json`.

```bash
cd <path-to-a-node-project-on-this-host>
docker run --rm -v "$PWD:/w" -w /w node:22 sh -c 'time npm ci'                    # runc baseline
docker run --runtime=runsc --rm -v "$PWD:/w" -w /w node:22 sh -c 'time npm ci'    # runsc
```

Report both timings and the ratio. Report the ratio you measured. Invent no number.

**Spike 4 — nested Docker, if the first three pass.** Nested `dockerd` inside gVisor
needs `--iptables=false`, and that flag breaks `docker run -p` and
`docker run --expose`. Nested containers then need `--network=host`. Record whether
nested `dockerd` starts at all, and record the flags it needed.

### Step 3 — MicroSandbox, the lower-probability candidate

`msb` needs `/dev/kvm`. Step 0 already recorded whether this host exposes it. An
absent `/dev/kvm` makes this candidate BLOCKED, and you state that instead of
running the commands.

```bash
curl -sSL https://get.microsandbox.dev -o /tmp/get-msb.sh   # read it, then run it
sh /tmp/get-msb.sh
msb self doctor
msb run alpine --exec 'echo ok'
```

Pass condition: `msb self doctor` exits 0, **and** `msb run` prints `ok`.

Two upstream limits are real, and they matter for a later phase rather than for this
spike: `msb ssh` idles out at 10 minutes and takes no configuration (upstream
`#1339`), and the hardened profile conflicts with nested Docker and with `sudo`.

### The result table to return

| Candidate | Path | Boots | tmux survives | `npm ci` ratio | Nested dockerd | Verdict |
|---|---|---|---|---|---|---|
| gVisor `runsc` | A or B | | | | | GREEN / RED / BLOCKED |
| MicroSandbox `msb` | | | | | | GREEN / RED / BLOCKED |

### What your result decides

Return the table and stop. Do not act on the outcome. The mapping below is context,
so that you understand what each verdict costs.

| Outcome | Next phase |
|---|---|
| gVisor GREEN on path A | The gVisor RFC goes first. MicroSandbox drops to a remote-host and CI substrate. |
| gVisor GREEN on path B only | The gVisor RFC goes first, and states that gVisor stays opt-in until the operator leaves Docker Desktop. |
| gVisor RED, MicroSandbox GREEN | The MicroSandbox phases run as the plan writes them. |
| Both RED | Stop. Publish the finding. The devcontainer stays the only substrate. |

### What to return

1. The filled result table.
2. The raw output of every command, in order.
3. One line per verdict that names the round trip that produced it.
4. Any step you could not run, with the missing thing named.

Do not commit a file. Do not open a pull request. The container-side session owns
the repository change.

## PASTE TO HERE
