# Source: .oh/tasks/cloud-ssh-readiness/prd.md

# PRD — OpenHarness Cloud MVP on ECS EC2

**Issue:** [ryaneggz/openharness#341](https://github.com/ryaneggz/openharness/issues/341) — *Spec: OpenHarness Cloud MVP on ECS EC2* (source EPIC: [ryaneggz/openharness#340](https://github.com/ryaneggz/openharness/issues/340) — *Managed OpenHarness Node*)
**Branch:** `feat/341-openharness-cloud-mvp` (`341` = the **upstream ryaneggz** issue number; mifunedev#341 is unrelated)
**Target repo:** new private repo **`mifunedev/openharness-cloud`** (Next.js App Router + TypeScript + shadcn/ui, Netlify) — scaffolded under `.oh/worktrees/project/mifunedev/openharness-cloud` from this plan-of-record. The **one** sandbox-image story lands in this repo (`mifunedev/openharness`); everything else builds the new control-plane repo.
**Deployed sandbox artifact:** `ghcr.io/mifunedev/openharness:<tag>` (no separate cloud image).

---

## 1. Introduction / Overview

OpenHarness today is a locally-provisioned Docker sandbox: an operator runs `make sandbox`
(or an image-only `docker run`) on their own host and attaches over a terminal or VS Code. The
**Managed OpenHarness Node** direction (#340) is to sell that sandbox as a hosted product —
a persistent, remotely-accessible agent workspace someone can provision without owning any
infrastructure.

Before any product surface (auth, billing, dashboard, provider abstraction) is worth building,
one load-bearing question must be answered end-to-end: **can a small control plane provision,
expose, and let a user SSH into a *persistent* OpenHarness sandbox running on AWS?** This PRD
scopes exactly that validation slice from #341 and nothing more.

The MVP is a thin **Next.js (Netlify) control plane** that, on one authenticated API call, uses
the AWS SDK to launch **one ECS task per sandbox** on **EC2 launch-type** container instances,
persists the workspace and agent auth on **EFS**, exposes container port 22 on a **dynamic host
port**, and returns a ready-to-use `ssh` command. Lifecycle endpoints (get / stop / restart /
destroy) prove the sandbox is a durable, reconnectable resource — its workspace and agent
credentials survive a stop→start cycle.

This is **infrastructure validation, not the product**. There is deliberately no user auth model,
no dashboard, no multi-tenant hardening, and no provider abstraction here — those are #340 roadmap,
explicitly out of scope (§5).

## 2. Goals

Measurable outcomes that define "the MVP works":

- **G1 — One call provisions.** A single authenticated `POST /api/provision/sandbox` returns
  `202 Accepted` with a `sandboxId` in **under 5 seconds** and results in a `RUNNING` ECS task on an
  EC2 container instance.
- **G2 — One call yields access.** `GET /api/provision/sandbox/:id` returns a **copy-pasteable
  `ssh` command** (`ssh -p <hostPort> sandbox@<ec2-public-dns>`) once the task reaches `RUNNING` and
  its network binding is resolved.
- **G3 — Real login works.** A user with the provisioned key pair can **SSH in** and **attach VS Code
  Remote-SSH** to the sandbox and use the agent CLIs (`claude`, `codex`, `pi`).
- **G4 — State persists.** After `stop` → `restart`, the **workspace** (`/home/sandbox/harness`) and
  **agent auth** (`~/.claude`, `~/.codex`, `~/.pi`, `~/.config/gh`) are intact — a file written in the
  first session is present in the second.
- **G5 — Clean teardown.** `destroy` stops the task and deregisters its task definition; with
  `deleteStorage: true` it also removes the sandbox's EFS data. No orphaned running tasks or task-def
  revisions remain.
- **G6 — Auditable lifecycle.** Every state transition writes a row to `sandbox_events`, so a sandbox's
  history is reconstructable from Postgres alone.

## 3. Architecture Decision Record (ADRs)

This section **lands the four open questions** #341 left unanswered, plus the supporting decisions the
build depends on. Each records the decision, the rationale, and the rejected alternative.

### ADR-1 — Cloud image variant *(open question #1 — REVISED & VERIFIED)*

**Decision:** There is **no separate cloud image.** The image deployed to ECS is
`ghcr.io/mifunedev/openharness:<tag>` itself.

**Rationale:** **PR #599** (merged 2026-07-07, commit `af053e57` on `origin/development`) already ships
an SSH server into the base image as an **opt-in overlay**, which is everything the cloud MVP needs at
the image layer:
- The Dockerfile installs `openssh-server`.
- `entrypoint.sh`, gated on **`SANDBOX_SSH=true`**, runs `ssh-keygen -A`, seeds
  `~/.ssh/authorized_keys` from the **`SANDBOX_SSH_AUTHORIZED_KEYS`** env var (multi-line or literal
  `\n`), writes a hardened `sshd_config.d` drop-in (`PermitRootLogin no`, pubkey auth on, password
  auth only when `SANDBOX_SSH_PASSWORD_AUTH=true`), and starts `sshd` as a **background daemon** while
  PID 1 remains `sleep infinity`.
- Behavior is unchanged when `SANDBOX_SSH` is unset — no regression to local flows.

ECS consumes this **directly**: the per-sandbox task definition sets `SANDBOX_SSH=true` and
`SANDBOX_SSH_AUTHORIZED_KEYS=<user pubkey>` in the container `environment`. No Docker Compose overlay
is involved (that overlay, `docker-compose.ssh.yml`, is the *local* consumer of the same env contract).

**Remaining flag-guarded gaps** (the whole of US-003, small):
1. **Agent-auth symlinks** for the 2-access-point EFS model (ADR-2): the entrypoint must, under the
   cloud flag, symlink `~/.claude`, `~/.codex`, `~/.pi`, `~/.config/gh`, `~/.ssh` into
   `/mnt/agent-auth/*` so per-user credentials persist on the auth AP rather than the ephemeral
   container FS.
2. **Host-key persistence.** `ssh-keygen -A` regenerates host keys every container start, so the
   client sees a changed host key after every restart. **MVP decision:** document
   `StrictHostKeyChecking accept-new` in the returned connection guidance **and** persist the host keys
   under the workspace mount (`/home/sandbox/harness/.oh/.ssh-hostkeys/`, symlinked to `/etc/ssh/`)
   when the cloud flag is set, so a restart of the *same* sandbox keeps a stable host key. (Restart may
   still change DNS/port; `accept-new` covers first-connect and is the safety net.)

**Consideration (documented, not fixed at MVP):** `sshd` dying is **invisible to ECS** because PID 1 is
`sleep infinity`, not `sshd`. Acceptable for validation; a container `healthCheck` probing port 22 is a
post-MVP hardening item.

**Rejected:** a dedicated `openharness-cloud` image fork. It would duplicate the release pipeline, drift
from the base image, and is unnecessary now that SSH is a first-class opt-in in the base image.

### ADR-2 — Task-definition strategy *(open question #2)*

**Decision:** Register **one task-definition family per sandbox** (`oh-sbx-<sandboxId>`) at provision
time. Each task def mounts **two EFS Access Points**:
- **Workspace AP** → `Path=/sandboxes/<sandboxId>/workspace`, mounted at `/home/sandbox/harness`.
- **Per-user auth AP** → `Path=/users/<userId>/auth`, mounted at `/mnt/agent-auth`.

The entrypoint (under the cloud flag) symlinks the agent-auth directories into `/mnt/agent-auth/*`
(ADR-1 gap #1).

**Rationale — this is forced by ECS/EFS mechanics, not preference:**
- **`RunTask` cannot override `volumes` or `mountPoints`.** Overrides are limited to container
  environment/command/resources — *not* the volume configuration. So the per-sandbox EFS paths must be
  baked into the task **definition**, which means a per-sandbox task def (or at least a per-sandbox
  revision). A single shared task def cannot carry per-sandbox paths.
- **ECS has no `subPath`** (unlike Kubernetes). You cannot mount one EFS volume and select a
  per-sandbox subdirectory at run time. **EFS Access Points** are the AWS-native equivalent: an AP
  pins a root directory *and* squashes POSIX ownership.
- **EFS AP `CreationInfo`** auto-creates the AP root directory with `OwnerUid/OwnerGid = 1000:1000`
  and `Permissions = 0755` the first time it's used. This **simultaneously solves** two problems:
  (a) Netlify functions can't mount EFS to `mkdir` the per-sandbox dirs, and (b) the sandbox runs as
  uid 1000 and would otherwise hit `EACCES` on a root-owned EFS mount.

**Deliberate deviation from #341's literal mount map:** #341 lists ~6 discrete mounts
(`.../auth/claude`, `.../auth/codex`, `.../auth/pi`, `.../auth/gh`, `.../auth/ssh`, workspace). We
implement the **same persistence contract with 2 APs + entrypoint symlinks** instead of 6 mounts:
fewer AWS resources per sandbox, identical durability guarantee. This deviation is intentional and
called out here for the critique gate.

**Rejected:** one shared task definition mounting the **EFS filesystem root**. Because the sandbox user
has `sudo`, every sandbox would then be able to read *every* user's credentials on the shared
filesystem — an unacceptable cross-tenant leak even for an MVP.

### ADR-3 — SSH exposure *(open question #3)*

**Decision:** At MVP, expose SSH over the **EC2 instance's public DNS + the dynamic host port** ECS
assigns (bridge network mode, `containerPort: 22 → hostPort: 0`). The control plane resolves the
`(publicDns, hostPort)` pair via `DescribeTasks` → `DescribeContainerInstances` → `DescribeInstances`
and the task's network binding. The container-instance **security group** opens the ECS dynamic port
range (`32768–61000`) to a **parameterized ingress CIDR** (default: the operator's IP; documented as a
tighten-me knob). `sshd` is **pubkey-only**.

**Rationale:** Zero extra moving parts to validate the core loop — no proxy, no tunnel, no DNS
provisioning per sandbox. The dynamic-port range is exactly what ECS bridge networking already uses.

**Rejected (deferred to ADR-4):** a per-sandbox reverse proxy / gateway that maps a stable hostname to
each sandbox. Correct long-term, unnecessary to prove the provision→access loop.

### ADR-4 — cloudflared role *(open question #4)*

**Decision:** At MVP, cloudflared (if present at all) is for **the control-plane app's own DNS/TLS
only**, not per-sandbox access. Per-sandbox SSH uses ADR-3's raw public DNS + dynamic port.

**Post-MVP successor:** a **cloudflared tunnel per sandbox** is the named successor to ADR-3 — it
closes the public `32768–61000` port range entirely (no inbound SG rule needed), gives each sandbox a
stable hostname, and removes the public-IP dependency. Called out as the first hardening step after the
loop is validated.

**Rejected:** building per-sandbox tunnels now. It adds a token/credential dependency and a moving part
before the thing it protects is even proven to work.

### ADR-5 — Control-plane code home *(operator-confirmed)*

**Decision:** The control plane is a **new repo, `mifunedev/openharness-cloud`** — **Next.js (App
Router) + TypeScript + shadcn/ui**, deployed on **Netlify**. Worked via
`.oh/worktrees/project/mifunedev/openharness-cloud`. Proposed structure:

```
app/api/provision/sandbox/route.ts            # POST create, (list)
app/api/provision/sandbox/[id]/route.ts       # GET status, DELETE destroy
app/api/provision/sandbox/[id]/stop/route.ts  # POST stop
app/api/provision/sandbox/[id]/restart/route.ts # POST restart
lib/aws.ts        # ECS/EFS/EC2 SDK clients + provisioning helpers
lib/db.ts         # Supabase client + sandboxes / sandbox_events accessors
lib/schemas.ts    # zod request/response schemas
lib/auth.ts       # x-provision-key shared-secret gate + per-user cap
supabase/migrations/*.sql
infra/provision-aws.sh   # idempotent AWS baseline
infra/VALIDATION.md      # E2E runbook (US-008)
```

**shadcn/ui is in the scaffold from day one** so the post-validation MVP UI (#341's "MVP interface":
create form, status panel, copy-SSH button, lifecycle buttons) has its component system ready — **but
MVP scope stays API-first**; the UI is not built in this task.

**All sandbox-image / entrypoint changes stay in `mifunedev/openharness`** (per ADR-1). The deployed
sandbox artifact is `ghcr.io/mifunedev/openharness` with no image variant.

**Rejected:** building the control plane inside `mifunedev/openharness`. The harness repo is the
sandbox artifact + orchestrator tooling; a customer-facing web control plane is a distinct product with
its own release cadence, secrets, and deploy target.

### Supporting decisions

- **SD-1 — 202-async provisioning.** `POST` **registers the task def, calls `RunTask`, writes DB rows,
  and returns `202` immediately** — it does *not* wait for `RUNNING`. `GET` is the **reconciler**: it
  polls ECS and updates DB state. This is forced by the timeout mismatch — a Netlify function times out
  at ~10–26 s, but first-boot task start (image pull + entrypoint seed) is **minutes**. ASG user-data
  **pre-pulls** `ghcr.io/mifunedev/openharness:latest` so warm instances start in seconds.
- **SD-2 — EFS path/content initialization (no Lambda).** Directory creation = **AP `CreationInfo`**
  (ADR-2). SSH authorized-keys = **PR #599's env-seeded `authorized_keys`** via
  `SANDBOX_SSH_AUTHORIZED_KEYS` in the task-def env. Workspace content = existing **`seed_workspace_volume()`**
  (`OH_IMAGE_ONLY=1`) seeding the baked `/opt/oh-seed` into the (empty) workspace AP on first boot.
  Nothing needs a Lambda.
- **SD-3 — Destroy-time storage reclaim.** `destroy` with `deleteStorage: true` runs a **shared
  `oh-efs-reaper` task** (registered once by `infra/provision-aws.sh`) via `RunTask` with a **command
  override** that `rm -rf`s `/sandboxes/<id>` (and the user auth dir only when explicitly requested).
  Reuses SD-1's "RunTask can override command" fact.
- **SD-4 — MVP endpoint protection.** All endpoints require a **mandatory `x-provision-key` header**
  (shared secret in Netlify env) — #341's "unauthenticated first" is relaxed to a single shared secret
  so the endpoints aren't open provisioning to the internet. A **per-user sandbox cap** (env-configurable,
  default small) bounds blast radius. This is *not* a user auth model (§5).
- **SD-5 — Sudo password.** Each sandbox gets a **random per-sandbox `SANDBOX_PASSWORD`** (for `sudo`),
  stored with the sandbox row; `SANDBOX_SSH_PASSWORD_AUTH` stays **false** (pubkey-only login).
- **SD-6 — AWS baseline as one idempotent script.** `infra/provision-aws.sh` stands up the shared
  baseline (SGs, EFS + mount targets, IAM roles, ECS cluster + EC2 ASG + capacity provider, reaper task
  def). **Terraform is post-MVP** — a re-runnable bash script keeps the validation loop fast and
  legible.

## 4. User Stories

> Priority = dependency order. `US-003` and `US-004` are independent of the API stories and can run in
> parallel with `US-002`, but both **gate `US-005`** (create needs the image ready and the AWS baseline
> standing). Every code-bearing story ends with **"Typecheck passes."**

### US-001: Control-plane repo scaffold + DB foundation

**Description:** As the platform builder, I want the `openharness-cloud` repo scaffolded with its
database schema so that every later story has a typed app and persistence layer to build on.

**Acceptance Criteria:**
- [ ] `mifunedev/openharness-cloud` scaffolded: Next.js (App Router) + TypeScript (strict) + shadcn/ui
      initialized, Netlify config present, `.env.example` documenting every required var.
- [ ] `supabase/migrations/0001_init.sql` creates the **`sandboxes`** and **`sandbox_events`** tables
      (schema per FR-6/FR-7).
- [ ] `lib/db.ts` exports a Supabase client plus typed accessors:
      `createSandbox`, `getSandbox`, `updateSandboxState`, `insertEvent`, `countUserSandboxes`.
- [ ] `lib/schemas.ts` defines zod schemas for every request/response body.
- [ ] Typecheck passes.

### US-002: API scaffold + auth gate

**Description:** As the platform builder, I want the five endpoints stubbed behind the shared-secret
gate so the request/response contract is fixed before AWS wiring.

**Acceptance Criteria:**
- [ ] All five routes exist and return well-formed typed responses (stubbed AWS calls): `POST` create,
      `GET` :id, `POST` :id/stop, `POST` :id/restart, `DELETE` :id (destroy, `deleteStorage` in body).
- [ ] `lib/auth.ts` enforces `x-provision-key`: a **missing/wrong** key → **401**; a malformed body →
      **400** (zod). Both paths covered by a test.
- [ ] Per-user sandbox cap enforced in `POST` (over-cap → **429**), reading `countUserSandboxes`.
- [ ] Typecheck passes.

### US-003: Base-image cloud SSH readiness *(repo: `mifunedev/openharness`)*

**Description:** As the platform builder, I want the base sandbox image to support the 2-AP cloud auth
layout and stable host keys so a provisioned ECS task is SSH-ready and persistent.

**Acceptance Criteria:**
- [ ] Builds on **merged PR #599** (`SANDBOX_SSH=true` + `SANDBOX_SSH_AUTHORIZED_KEYS`); does **not**
      reimplement sshd setup.
- [ ] Under a cloud flag, entrypoint symlinks `~/.claude`, `~/.codex`, `~/.pi`, `~/.config/gh`,
      `~/.ssh` → `/mnt/agent-auth/*` (creating targets if absent), idempotently.
- [ ] Host-key persistence: when the cloud flag is set, host keys live under the workspace mount and
      are symlinked into `/etc/ssh/`, so a restart of the same sandbox keeps a stable host key.
- [ ] Local proof: `docker run` with `OH_IMAGE_ONLY=1 SANDBOX_SSH=true` + two `-v` dirs standing in for
      the workspace and agent-auth APs →
      **(a)** pubkey SSH succeeds, **(b)** password auth is refused, **(c)** the five symlinks resolve
      into the auth dir, **(d)** the seed marker makes a second boot idempotent, **(e)** a restart keeps
      the same host key, **(f)** default (non-cloud) boot is byte-for-byte unchanged.
- [ ] New/updated eval probe asserts the flag-guarded branch + regression floor; `/eval` shows no
      green→red regression.
- [ ] Docs: `.oh/docs/integrations/sshd.md` extended with the cloud (ECS) consumption notes.
- [ ] Typecheck / shellcheck passes.

### US-004: AWS baseline provisioner

**Description:** As the platform operator, I want one idempotent script to stand up all shared AWS
resources so provisioning has a cluster, storage, and networking to target.

**Acceptance Criteria:**
- [ ] `infra/provision-aws.sh` idempotently creates/ensures: control-plane + instance **security
      groups** (SSH dynamic-port range to a parameterized CIDR), **EFS filesystem + mount targets** per
      AZ, **IAM** (task execution role, task role, instance profile), **ECS cluster + EC2 Auto Scaling
      Group + capacity provider** (user-data pre-pulls the image), and the shared **`oh-efs-reaper`
      task definition**.
- [ ] Re-running the script makes **no** changes when the baseline already exists (idempotent).
- [ ] Emits the resource IDs the control plane needs (cluster name, EFS id, subnets, SGs) as env/JSON.
- [ ] Documented required IAM permissions to run it.

### US-005: `POST /api/provision/sandbox` — create (202-async)

**Description:** As a user, I want one API call to provision a sandbox so that a running ECS task is
created without waiting for it to boot.

**Acceptance Criteria:**
- [ ] Creates the **workspace AP** and **per-user auth AP** (idempotent — reuse the user's auth AP),
      **registers** the `oh-sbx-<id>` task def (2 EFS volumes, bridge mode, `containerPort 22 →
      hostPort 0`, env: `SANDBOX_SSH=true`, `SANDBOX_SSH_AUTHORIZED_KEYS`, random `SANDBOX_PASSWORD`,
      cloud flag), calls **`RunTask`**, writes the `sandboxes` row (`state=PROVISIONING`) and a
      `sandbox_events` row.
- [ ] Returns **`202`** with `{ sandboxId, state: "PROVISIONING" }` in **< 5 s** (does not wait for
      `RUNNING`).
- [ ] Over per-user cap → 429; bad body → 400; bad key → 401.
- [ ] Typecheck passes.

### US-006: `GET /api/provision/sandbox/:id` — status reconciler

**Description:** As a user, I want to poll a sandbox's status so I get a working `ssh` command once it's
ready.

**Acceptance Criteria:**
- [ ] Resolves live state via **`DescribeTasks` → `DescribeContainerInstances` → `DescribeInstances`**,
      extracting the public DNS and the dynamic host port bound to container port 22.
- [ ] Reconciles the DB row to the observed state (`PROVISIONING`→`RUNNING`/`STOPPED`/`FAILED`) and
      writes an event on transitions.
- [ ] When `RUNNING`, returns a copy-pasteable **`ssh -p <hostPort> sandbox@<publicDns>`** plus the
      host-key guidance (`accept-new`).
- [ ] Unknown id → 404; bad key → 401. Typecheck passes.

### US-007: stop / restart / destroy lifecycle

**Description:** As a user, I want to stop, restart, and destroy a sandbox so I control its cost and
lifetime while its state persists across stop→restart.

**Acceptance Criteria:**
- [ ] **stop** → `StopTask`, state `STOPPED`, event written. **restart** → new `RunTask` from the
      *existing* per-sandbox task def (same EFS APs → workspace + auth intact), state
      `PROVISIONING`→`RUNNING`, event written.
- [ ] **destroy** → `StopTask` + **deregister** the `oh-sbx-<id>` task-def revision(s); with
      `deleteStorage: true`, run the **`oh-efs-reaper`** task (command override `rm -rf /sandboxes/<id>`)
      and mark storage deleted. State `DESTROYED`, event written.
- [ ] No orphaned running tasks or active task-def revisions after destroy.
- [ ] Typecheck passes.

### US-008: End-to-end validation runbook

**Description:** As the platform operator, I want a recorded runbook proving the full loop so the MVP's
definition of done is demonstrable and repeatable.

**Acceptance Criteria:**
- [ ] `infra/VALIDATION.md` records the #341 checklist executed against a real deploy: provision → poll
      → **SSH in** → **VS Code Remote-SSH attach** → write a file → **stop** → **restart** → confirm the
      file persists → **destroy** (with and without `deleteStorage`).
- [ ] Each step lists the exact command and the observed result; any deviation is noted as a follow-up.
- [ ] Runbook cross-references the Success Metrics (§8) so each metric maps to a runbook step.

## 5. Functional Requirements

**Endpoints** (all require `x-provision-key`):
- **FR-1 — `POST /api/provision/sandbox`**: body `{ userId, publicKey, name? }`; creates APs + task def,
  `RunTask`, returns `202 { sandboxId, state }`. Enforces per-user cap.
- **FR-2 — `GET /api/provision/sandbox/:id`**: returns `{ sandboxId, state, ssh?, publicDns?, hostPort?,
  events? }`; reconciles live ECS state into the DB.
- **FR-3 — `POST /api/provision/sandbox/:id/stop`**: `StopTask`; state → `STOPPED`.
- **FR-4 — `POST /api/provision/sandbox/:id/restart`**: `RunTask` from existing task def; state →
  `PROVISIONING`.
- **FR-5 — `DELETE /api/provision/sandbox/:id`**: body `{ deleteStorage?: boolean }`; stop + deregister
  task def; if `deleteStorage`, run reaper; state → `DESTROYED`.

**Data model (Supabase Postgres):**
- **FR-6 — `sandboxes`**: `id` (uuid pk), `user_id`, `name`, `state`
  (`PROVISIONING|RUNNING|STOPPED|DESTROYED|FAILED`), `ecs_task_arn`, `task_def_arn`, `workspace_ap_id`,
  `auth_ap_id`, `public_dns`, `host_port`, `public_key`, `sandbox_password` (secret), `storage_deleted`
  (bool), `created_at`, `updated_at`.
- **FR-7 — `sandbox_events`**: `id` (uuid pk), `sandbox_id` (fk), `type`
  (`created|running|stopped|restarted|destroyed|failed|storage_deleted`), `detail` (jsonb),
  `created_at`.

**Infrastructure:**
- **FR-8 — EFS mount map** (via 2 APs, ADR-2): workspace AP `/sandboxes/<id>/workspace` →
  `/home/sandbox/harness`; per-user auth AP `/users/<userId>/auth` → `/mnt/agent-auth` (entrypoint
  symlinks the five agent-auth dirs into it).
- **FR-9 — ECS task def**: EC2 launch type, **bridge** network mode, `containerPort: 22 → hostPort: 0`
  (dynamic), two EFS volumes with transit encryption + the respective AP IDs, container env
  (`SANDBOX_SSH`, `SANDBOX_SSH_AUTHORIZED_KEYS`, `SANDBOX_PASSWORD`, cloud flag, `OH_IMAGE_ONLY=1`).
- **FR-10 — Provisioning sequence**: create/reuse APs → register task def → `RunTask` → (async) reconcile
  to `RUNNING` → resolve `(publicDns, hostPort)` → emit `ssh` command. Every transition writes an event.

## 6. Non-Goals (Out of Scope)

Explicitly **not** in this MVP (from #341 "Avoid for MVP" + #340 roadmap):
- **Fargate or EKS** — EC2 launch type only.
- **User auth / RBAC / accounts / sessions** — only a single shared `x-provision-key`.
- **Dashboard / Node Control Panel UI** — API-first; shadcn is scaffolded but the UI is not built.
- **Multi-cloud / provider abstraction** — AWS only, concretely.
- **Billing / metering / the $200 SKU** (#340).
- **Slack teammate, session reports, observability, team fleet** (#340).
- **cloudflared per-sandbox tunnels** — named as ADR-4's successor, deferred.
- **Terraform / full IaC** — one idempotent bash baseline instead (SD-6).
- **Container healthchecks / sshd supervision** — noted in ADR-1, deferred.
- **A separate cloud image** — deploy `ghcr.io/mifunedev/openharness` (ADR-1).

## 7. Technical Considerations

- **RunTask override limits (load-bearing):** `RunTask` overrides **cannot** change `volumes` /
  `mountPoints` — only container env / command / resources. This is why ADR-2 needs per-sandbox task
  defs, and why SD-3's reaper uses a *command* override.
- **EFS Access Point squash:** APs enforce `PosixUser`/`RootDirectory` ownership (uid 1000) — this is
  what makes a uid-1000 sandbox able to write EFS without a manual `chown` from a privileged mounter.
- **Netlify function timeout ≪ task cold start** — mandates the 202-async split (SD-1). Warm ASG
  instances (image pre-pulled) keep steady-state start in seconds.
- **Secrets:** `x-provision-key`, Supabase service key, AWS creds live in Netlify env; per-sandbox
  `SANDBOX_PASSWORD` stored in the `sandboxes` row (acceptable at MVP; a secrets manager is post-MVP).
- **Credential dependency (STOP condition):** deploying/validating requires **AWS account credentials**,
  a **Supabase project + keys**, and **Netlify env** config. Per operator instruction, the build STOPs
  and requests these at the point they're needed rather than guessing.

## 8. Success Metrics

Maps 1:1 to the #341 definition of done (verified in US-008's runbook):
- **SM-1** — `POST` → `202` with `sandboxId` in **< 5 s**; task reaches `RUNNING`.
- **SM-2** — `GET` returns a working `ssh` command; **SSH login succeeds**.
- **SM-3** — **VS Code Remote-SSH** attaches and agent CLIs run.
- **SM-4** — File written pre-stop is present post-restart (**workspace + auth persist**).
- **SM-5** — `destroy` leaves **no orphaned** tasks/task-def revisions; `deleteStorage` removes EFS data.
- **SM-6** — Every transition has a `sandbox_events` row (**lifecycle fully auditable**).

## 9. Open Questions

Only what genuinely remains after the ADRs:
- **OQ-1 — Host-key persistence final call:** ADR-1 chose persist-in-workspace **+** documented
  `accept-new`. Confirm the persisted-key path survives an AZ/instance change (workspace AP follows the
  sandbox, so it should) during US-003/US-008; if not, fall back to `accept-new` only.
- **OQ-2 — Per-user auth AP sharing semantics:** one auth AP per user is shared across that user's
  sandboxes (deliberate — shared agent creds). Confirm no concurrent-write hazard when a user runs two
  sandboxes at once; if real, scope auth per-sandbox instead.
- **OQ-3 — ASG sizing / bin-packing:** how many sandboxes per EC2 instance, and the scale-out trigger,
  are left to US-004 tuning — not architecture-blocking.
- **OQ-4 — `x-provision-key` rotation:** single shared secret at MVP; rotation/per-user keys are the
  first step of the real auth model (#340), out of scope here.

## Wiki Alignment

- **Impact**: REQUIRED
- **Local entries**: `.oh/skills/wiki/corpus/openharness-cloud-mvp.md` to create (at execute time)
- **Spec alignment**: The wiki entry must capture the landed architecture — the ECS-EC2 + 2-EFS-AP
  provisioning model (ADR-2), the "no separate cloud image / PR #599 SSH overlay" decision (ADR-1), the
  202-async provision→reconcile split (SD-1), and the explicit non-goals (§6) so future work does not
  re-litigate settled questions. It must reflect that the control plane lives in the separate
  `mifunedev/openharness-cloud` repo and only US-003 touches `mifunedev/openharness`.
- **DeepWiki comparison**: To be recorded at execute time against
  `https://deepwiki.com/mifunedev/openharness` — the cloud control plane is a *new* subsystem not yet
  represented there; expect "no relevant DeepWiki page found" for the ECS provisioning flow, with the
  closest existing pages being the sandbox entrypoint / image lifecycle. Note terminology gaps
  (sandbox-as-ECS-task vs sandbox-as-local-container).
- **Acceptance criteria**: US-008 (or a dedicated wiki step at execute time) creates
  `.oh/skills/wiki/corpus/openharness-cloud-mvp.md` following `.oh/skills/wiki/references/schema.md`
  (frontmatter + line-cited claims + `## See Also`), aligned to this PRD's goals/non-goals, and passes
  `bash .oh/evals/probes/wiki-readme-index.sh`.
