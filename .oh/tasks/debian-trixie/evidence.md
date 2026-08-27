# Evidence — debian-trixie

- **PR**: #851 (`mifunedev/openharness`, base `development`) · **Branch**: `task/807-debian-trixie`
- **Audit run**: `audit-20260826T223004Z-3955` · **Verdict**: `AUDIT-PASS`
- **Audited commit**: `ff7c246941b9ea301b7508400c52ce02cbced247`

## Why this is better

Before this change, every rebuilt sandbox used Debian 12 Bookworm, now oldstable. MicroSandbox's glibc `>= 2.39` prerequisite failed on glibc 2.36. The updated sandbox follows Debian 13 Trixie stable and clears that prerequisite. It retains Node `v22.23.2`, pnpm `10.33.0`, the default tools, the Herdr pins, and the ownership behavior. The updated documentation identifies `/dev/kvm` as the remaining MicroSandbox blocker.

The cost is 27 changed files and one Dockerfile-scoped amd64 all-optionals build. Permanent CI also performs a 46-second Bookworm/Trixie Node-pnpm parity check. The arm64 build remains one-time migration evidence and is not a permanent CI gate. Expensive vendor builds do not run for broad `.oh/**` changes.

## What the plan asked for

Move the image to `debian:trixie-slim`, move Docker's apt suite to Trixie, and retain Cloudflare's Bookworm suite with an explicit HTTP 404 explanation. Prove amd64 and arm64 builds, unchanged Node/pnpm, default and optional tool availability, Herdr checksums, UID/bind ownership, compose boot, and no eval regression. Reconcile active Bookworm and two-blocker claims without adding a runtime, device, or configuration key.

## What was built

`.devcontainer/Dockerfile:1,31,36-40` now pins Trixie, uses Docker's Trixie repository, and documents Cloudflare's Bookworm exception. `.oh/scripts/verify-sandbox-image.sh` verifies the distribution, repositories, built-in `1000:1000` user, Node/pnpm, Herdr version and architecture checksum, and numeric version output from required tools. `.oh/scripts/sandbox-boot-smoke.sh:81` proves runtime bind ownership.

`.github/workflows/sandbox-compatibility.yml` automatically compares Node/pnpm across fixed Bookworm and Trixie bases and builds one amd64 image with all four optional installers. Runtime diagnostics retain both measured prerequisites while stating that Trixie clears glibc and default compose still lacks `/dev/kvm` (`.oh/cli/src/lib/runtimes/catalog.ts:100-110`; `.oh/docs/runtimes/microsandbox.md:49-59`).

## Where it diverged from the plan, and why

- US-003 initially put one-time Node/pnpm parity in a new dispatch-only workflow. Adversarial review found that a new manual workflow cannot run before merge. The review also found that its inputs created an expression-to-shell injection risk. The repair moved parity into the automatic PR compatibility workflow with fixed image references.
- Version guards initially accepted arbitrary nonempty zero-exit output. CI exposed an emulation warning as false evidence, and adversarial review exposed the broader false-positive. The final verifier and optional checks require numeric dotted versions.
- US-002 also updated `.oh/docs/runtimes/{overview,docker}.md` because the source sweep found active Bookworm substrate claims there. This change reconciles claims and does not expand runtime behavior.
- After review, the operator removed permanent arm64 CI. The successful QEMU run remains one-time migration evidence, but future PRs do not rebuild arm64.

## What remains unverified

- The one-time arm64 proof used QEMU fallback instead of native arm64 hardware. There is no permanent arm64 CI gate.
- The task did not test or change multi-platform GHCR publication. Issue #807 explicitly excludes publication changes.
- No story declares browser criteria, so the audit did not run UI verification.

## Proof by gate

| Gate | Check | Observed | Result |
|------|------------------|----------|--------|
| Task graph | `prd.json` story state | `4/4 stories pass` | PASS |
| Regression floor | `/eval` runner exit and delta | `rc=0`; `94 PASS`, `0 REGRESSION`, `3 SKIPPED` | PASS |
| Promotable / CI | Focused PR classifier at `ff7c2469` | `promotable`; CI PASS; MERGEABLE/CLEAN; evidence complete | PASS |
| UI | Browser criteria | n/a — no browser criterion | N/A |

## Observed output

```text
$ AUDIT_AGENT_COMMAND_JSON='["claude","-p","--output-format","text"]' \
    .oh/skills/audit/scripts/audit-run.sh implementation debian-trixie \
    --pr 851 --repo mifunedev/openharness --base development \
    --branch task/807-debian-trixie -- .oh/skills/audit/scripts/route-driver.sh
Verdict: AUDIT-PASS
Gates: graph 4/4 · eval rc 0 (94 PASS / 3 SKIPPED / 0 REGRESSION) · promotable (CI PASS, MERGEABLE/CLEAN) · ui n/a
AUDIT-EVIDENCE: AUDIT-PASS
audit -- run-id=audit-20260826T223004Z-3955 target=implementation state=complete verdict=AUDIT-PASS exit=0
```

```text
$ bash .oh/scripts/node-pnpm-parity.sh debian:bookworm-slim debian:trixie-slim
debian:bookworm-slim     node v22.23.2  pnpm 10.33.0
debian:trixie-slim       node v22.23.2  pnpm 10.33.0
PARITY: debian:bookworm-slim and debian:trixie-slim report identical node and pnpm versions
```

```text
$ # GitHub Actions: Build and verify the default arm64 image
/usr/local/bin/herdr: OK
ok: node is major 22 (v22.23.2)
ok: pnpm is exactly 10.33.0
ok: herdr is 0.7.4
ok: gh --version -> gh version 2.98.0 (2026-08-20)
ok: docker --version -> Docker version 29.7.2, build a7dcaa6
ok: docker compose version -> Docker Compose version v5.5.0
ok: cloudflared --version -> cloudflared version 2026.8.2 (built 2026-08-14-12:17 UTC)
ok: bun --version -> 1.4.0
ok: uv --version -> uv 0.12.6 (aarch64-unknown-linux-gnu)
verify-sandbox-image: all checks passed
```

```text
$ # GitHub Actions: Build one amd64 image with every optional installer
Hermes Agent v0.20.5 (2026.8.19)
deepagents-cli 0.3.0
--- opencode --version
1.18.23
--- grok --version
grok 0.2.39 (55a20b703)
```

```text
$ # GitHub Actions: Validate sandbox compose and image build
sandbox boot smoke: sandbox user, bind mount, and sandbox-created files all resolve to 1001:1001
```

```text
$ gh pr checks 851 --repo mifunedev/openharness
Boot Path Lint (shellcheck + hadolint)                         pass
Build and verify the default arm64 image                       pass (one-time migration evidence)
Build one amd64 image with every optional installer            pass
Eval Probe Regression Gate                                     pass
Lint, Typecheck, Build & Test                                  pass
Validate sandbox compose and image build                       pass
Verify exact Node and pnpm parity across Debian bases          pass
```

## Acceptance criteria → proof

| Story | Criterion | Proof |
|-------|-----------|-------|
| US-001 | Trixie base; Docker Trixie suite; Cloudflare Bookworm exception | `.devcontainer/Dockerfile:1,31,36-40`; CI passed `sandbox-base-image.test.ts` |
| US-001 | User-visible changelog | `CHANGELOG.md` under `[Unreleased]` → `Changed`; `changelog-entry-length` PASS |
| US-002 | glibc cleared; `/dev/kvm` remains | `.oh/cli/src/lib/runtimes/catalog.ts:100-110`; `.oh/docs/runtimes/microsandbox.md:49-59`; `runtime-preflight-gate` PASS |
| US-003 | Default tools and Herdr checksum | the boot and optional jobs passed the amd64 verifier; the one-time arm64 output appears above |
| US-003 | Built-in and runtime ownership | image verifier reported `1000:1000`; compose boot reported synchronized `1001:1001` |
| US-003 | Exact Node/pnpm parity | fixed-base parity output above; [job 98344609985](https://github.com/mifunedev/openharness/actions/runs/33019069348/job/98344609985) |
| US-004 | one-time arm64 build | Herdr build checksum plus verifier; [job 98344609788](https://github.com/mifunedev/openharness/actions/runs/33019069348/job/98344609788); permanent gate removed after operator review |
| US-004 | All optional installers | four numeric versions above; [job 98344609954](https://github.com/mifunedev/openharness/actions/runs/33019069348/job/98344609954) |
| US-004 | No registry write or release change | compatibility workflow has `contents: read`, `push: false`, no login; `release.yml` absent from the diff |

## Gaps and non-gating findings

- Three eval probes remain SKIPPED exactly as on the accepted `origin/development` baseline: `debugmcp-availability`, `next-dev-prod`, and `registry-portability`.
- Audit run `audit-20260826T223004Z-3955` reported permission-schema warnings for `settings.local.json` and `.config` write patterns. The warnings did not change the correlated `AUDIT-PASS` verdict.
- Eval reported no pre-existing red probe.
