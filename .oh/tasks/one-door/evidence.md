# Evidence: one door for harness and tool installs

Answers back to the approved plan in `.oh/tasks/one-door/prd.md` (issue #948, PR #949).
Audit run: `audit-20260902T172640Z-2208766` — native verdict `AUDIT-PASS` · `SIMPLICITY-RESIDUAL: 2`.
Every excerpt below is output that ran in this session; nothing is reconstructed.

## 0. Why this is better than not doing it

Before: every fresh home mount installed five packages the operator never asked for (claude-code, codex, pi, herdr, cloudflared), behind five kinds of switch (`kind: "default"`, `install.*` keys, three persist flags, an env off-ramp, a healthcheck marker). After: one verb pair and nothing else.

| Measure | Before | After |
|---|---|---|
| Packages installed at boot on a fresh volume | 5 | 0 |
| Install surfaces | catalog `default` kind, `install.*` keys, `--persist-only`/`--no-persist`/`--defaults`, `install.sh` and `oh init` prompts, `OH_PROVISION_DEFAULTS`, provision-failed marker | `oh harness install <id>`, `oh tool install <id>` |
| Time to `sandbox healthcheck ok` on a fresh volume (child over the parent's socket) | 46 s, after the five installs | 16 s |
| Tracked lines | — | −462 net (+1317 / −1779) |
| Probe suite | 138 probes, `tailscale-tool-boundary` red on the base | 138 probes, no new red; `tailscale-tool-boundary` green |

Cost paid: `AGENTS.md` sits 7 B under its 9500 B budget; a fresh sandbox needs `oh tool install herdr` before `herdr` (documented in the root lifecycle and every quickstart); `start_period: 600s` is now oversized and tracked as a follow-up on #948.

## 1. What the plan asked for

The CLI is the only door. Nothing installs at boot; no `install.*` keys; no persist flags; no off-ramps. A harness or tool enters the sandbox only through `oh harness install <id>` or `oh tool install <id>`, lands in `~/.local` in the home volume, and persists because that volume persists. `kind: "baked-in"` tools stay in the image. Docs, root context, verifiers, probes, CI and knowledge describe and enforce that state, proven by a child sandbox before and after.

## 2. What was built

### D1 — before (child `oh-child-before`, image `ghcr.io/mifunedev/openharness:latest` = `f02005e8`, CLI 0.6.0)
```
$ docker logs oh-child-before 2>&1 | grep "\[provision-defaults\]"
[provision-defaults] installing claude-code into /home/sandbox/.local
[provision-defaults] installing codex into /home/sandbox/.local
[provision-defaults] installing pi into /home/sandbox/.local
[provision-defaults] installing herdr into /home/sandbox/.local
[provision-defaults] installing cloudflared into /home/sandbox/.local
[provision-defaults] OK  all 5 default harnesses and tools provisioned under /home/sandbox/.local
[provision-defaults] OK  all 5 default harnesses and tools provisioned under /home/sandbox/.local

$ docker exec -u sandbox oh-child-before bash -lc "oh harness list; oh tool list"
HARNESS      KIND       ENABLED  INSTALLED
claude-code  default    n/a      yes
codex        default    n/a      yes
pi           default    n/a      yes
opencode     optional   no       no
grok-build   optional   no       no
hermes       optional   no       no
t3code       on-demand  n/a      no
TOOL           KIND      ENABLED  INSTALLED
agent-browser  opt-in    no       no
herdr          default   n/a      yes
cloudflared    default   n/a      yes
docker-cli     baked-in  n/a      yes
gh             baked-in  n/a      yes
tailscale      opt-in    no       no
```

### D2, D3 — after (child `oh-child-after`, image `openharness:one-door` = `a462096a`, built with `docker build -f .devcontainer/Dockerfile .` from the worktree at `8c898945`)
```
$ docker logs oh-child-after 2>&1 | grep "\[provision-defaults\]"
(no output)
$ docker exec oh-child-after bash /home/sandbox/harness/.oh/scripts/sandbox-healthcheck.sh
sandbox healthcheck ok

$ docker exec -u sandbox oh-child-after bash -lc "oh harness list; oh tool list; ls ~/.local/bin"
HARNESS      KIND         INSTALLED
claude-code  installable  no
codex        installable  no
pi           installable  no
opencode     installable  no
grok-build   installable  no
hermes       installable  no
t3code       on-demand    no
TOOL           KIND         INSTALLED
agent-browser  installable  no
herdr          installable  no
cloudflared    installable  no
docker-cli     baked-in     yes
gh             baked-in     yes
tailscale      installable  no
python3.11

$ docker exec -u sandbox oh-child-after bash -lc "cd ~/harness && oh tool install herdr --yes && herdr --version"
installing Herdr into the sandbox…
/tmp/tmp.uvr9jwgjP1/herdr: OK
herdr: installed — see https://github.com/mifunedev/openharness/blob/main/docs/installation.md
herdr 0.7.4
exit=0

$ docker exec -u sandbox oh-child-after bash -lc "cd ~/harness && oh harness install pi && pi --version"
installing Pi into the sandbox…
added 128 packages in 6s
pi: installed — see https://github.com/mifunedev/openharness/blob/main/docs/harnesses/pi.md for authentication
0.84.4
exit=0
```

The first-boot banner in the after child reads `oh tool install herdr   # then run herdr`. Both children were removed with `down -v`; `docker ps -a` and `docker volume ls` show no `oh-child-*` entry.

### D5 — image verifier
```
$ bash .oh/scripts/verify-sandbox-image.sh openharness:one-door
ok: no harness is baked into the image (claude-code codex pi opencode grok-build hermes t3code )
ok: no installable tool is baked into the image (agent-browser herdr cloudflared tailscale )
ok: every baked-in tool is present (docker-cli gh )
verify-sandbox-image: all checks passed for openharness:one-door
```
Against the published image the same script fails closed (`matched no entry for '.[] | select(.kind == "installable")' — the unbaked-image check would pass vacuously`) because that image's catalog predates the kinds.

### D4 — switch strings
```
$ git grep -nE '<13 switch strings>' -- . ':!CHANGELOG.md' ':!.oh/tasks' ':!.oh/logs' | cut -d: -f1 | sort | uniq -c
      1 .oh/cli/src/__tests__/runtime-catalog.test.ts      (not.toContain("harnessKey"))
     11 .oh/evals/probes/harness-one-door.sh               (the probe's own negative assertions)
      1 .oh/evals/probes/runtime-preflight-gate.sh          (grep -qE 'buildArg|harnessKey' guard)
```

### D6, D7 — local gates
```
npm --prefix .oh/cli run typecheck   exit 0
npm --prefix .oh/cli run build       exit 0   (dist/oh.js 168.6kb)
env -u SANDBOX_SSH pnpm test         Test Files 58 passed (58) / Tests 962 passed (962)
bash .oh/skills/eval/run.sh          exit 0, ran 138 probe(s); SKIPPED unchanged: cc-safety-net-wiring, debugmcp-availability, next-dev-prod, registry-portability
bash .oh/evals/probes/harness-one-door.sh
PASS: no default set, install key, provisioner or boot-time off-ramp remains, and all 10 installable entries install as the sandbox user into /home/sandbox/.local, checksum their 3 downloads, and stay out of the image
```
Fault injection on a scratch copy (one fault at a time, `HARNESS_ONE_DOOR_ROOT=` pointed at the copy): `harnessKey: "x"` → REGRESSION; `kind: "default"` → REGRESSION; `provision-defaults.sh` restored → REGRESSION; `OH_PROVISION_DEFAULTS` in entrypoint → REGRESSION; `install.hermes` field in oh-config.ts → REGRESSION; `npm -g @anthropic-ai/claude-code` in the Dockerfile → REGRESSION; `installUser: "root"` → REGRESSION; herdr `sha256sum` line removed → REGRESSION; copy restored → PASS.

### D8 — CI on head `0fe00420`
```
Boot Path Lint (shellcheck + hadolint)                    pass  15s
Eval Probe Regression Gate                                pass  31s
Install every optional harness through the CLI            pass  2m9s
Lint, Typecheck, Build & Test                             pass  35s
Validate sandbox compose and image build                  pass  1m58s
Verify exact Node and pnpm parity across Debian bases     pass  25s
mergeable=MERGEABLE
```

### D9 — docs
`git grep` of the switch strings over `docs README.md AGENTS.md .oh/cli/README.md .oh/install .oh/skills` returns nothing; the retired-vocabulary grep (`preinstalled|installed at boot|provisioned on boot|default harness|default tool|optional installs|opt-in harness|opt-in tool`) returns nothing. `AGENTS.md` lifecycle step 3 is `Run oh tool install herdr, then herdr.` `docs/harnesses/overview.md` and `docs/installation.md` were read end to end.

### D10 — out of scope untouched
Parent checkout `git status --short` before and after: `M oh.json`, `?? .oh/scripts/migrate-dotenv-settings.sh` only. The branch diff contains no `oh.json`, no `provision-python.sh`, and under `.oh/skills/` exactly two single-line edits (`t3/references/tailscale-mobile.md:86`, `agent-browser/SKILL.md:70`).

### Actual Knowledge Impact (union of `knowledge-impact.sh --changed` and the plan's prediction)

| Page | State | Action |
|---|---|---|
| `compose-env-boundary` | UPDATED | install route rewritten to the verb; `provision-defaults.sh` removed from `sources:` and the diagram; `harness-one-door.sh` added as a guard; `updated:` and `verified_at:` advanced |
| `fresh-machine-setup` | UPDATED | `.devcontainer/.env` + `INSTALL_*` and `install.hermes` claims replaced; Herdr install step added to the flow; `updated:` and `verified_at:` advanced |
| `sandbox-dependency-installs` | REVERIFIED | pnpm gate, marker, and three boot states unchanged in `entrypoint.sh`; `verified_at:` advanced |
| `managed-agents` | REVERIFIED | cited ranges (`overview.md` product boundary, `security-considerations.md:34-43,121-134`) untouched; `verified_at:` advanced |
| `oh-cli-portable-lifecycle` | REVERIFIED | `oh init` payload sourcing and `cli.ts` precedence unchanged; only the wizard's install step was removed; `verified_at:` advanced |

Index regenerated; `wiki-readme-index`, `knowledge-source-freshness`, `wiki-related-slugs`, `wiki-kind-schema-contract` PASS.

### Benchmark
Floor: `eval-result.json` at head, `runnerExit: 0`, no new regression. Ceiling: `suite score = 1.44` on the branch and on `development` — held. The change removed machinery (−462 lines, one probe replaces two, one verb pair replaces seven surfaces) and delivered its stated capability (D2, D3 observed). Verdict: BENEFICIAL (justified hold). The capability instrument was not groomed this cycle.

## 3. Where they diverged, and why

- **Executors ran as `general-purpose` with `model: opus`, not as the named `~/.claude/agents/` definitions.** The four definitions were written, but the Agent tool did not load them (`Agent type 'oh-core' not found`): a first agent file in a new `agents` directory is not watched mid-session. The effort mapping was carried by restating the depth in each launch prompt; all four executors ran at the session's Opus effort. Gates were unaffected.
- **Two `.oh/skills/` lines and one RFC line were edited** (plan listed `.oh/skills/` as untouched). They instructed the retired `install.tailscale` key and named the deleted provisioner; leaving them contradicts the intent. Recorded in the PRD's Plan Reconciliation before execution.
- **The after image was built from the worktree at `8c898945`**, four commits before the audited head. The later commits touched only knowledge pages, one `AGENTS.md` line, `RESULTS.md`, and the task folder; no file that enters the image's runtime path changed.
- **Additional docs beyond the plan's list** (`docs/integrations/herdr.md`, `docs/README.md`, `docs/intro.md`, `docs/contributing.md`, `docs/runtimes/microsandbox.md`, `README.md:16,231`) instructed a bare `herdr` on a fresh sandbox and were fixed under the same pattern.
- **`AGENTS.md` step 3 lost "inside the sandbox"** to stay under the always-on byte budget (9513 B → 9493 B of 9500 B).
- **The compatibility CI job now installs six harnesses** (every `installable` entry) instead of the four formerly marked `optional`; the job key `optional-harness-install` is unchanged because `sandbox-boot-guard-ci.sh` pins it.
- **Stopped-sandbox exit code for both verbs is now 1**, not 0: with nothing deferred there is nothing to report as done.

## 4. What remains unverified

- **Simplicity residuals (2, non-gating, gate 5 ended on a non-reducing round: prevNetAdded 1315 → 1317):** `harness-one-door.sh:104-127` re-proves the no-bake rule textually that `verify-sandbox-image.sh:110-137` proves against a live image (≈ −28 lines); `harness-one-door.sh:91-102` duplicates the sandbox-user / `NPM_USER_PREFIX` / `sha256sum` rules of `tailscale-tool-boundary.sh:54,112-117` (≈ −12 lines). Left for the operator: the textual check runs in the eval suite without Docker, which CI's probe gate has and the image verifier does not.
- **Pre-existing SKIPPED rows carried forward:** `cc-safety-net-wiring`, `debugmcp-availability`, `next-dev-prod`, `registry-portability` (environmental, unchanged delta).
- **`compose-args.test.ts` fails when `SANDBOX_SSH=true` leaks from the sandbox environment**; unrelated to this diff and pre-existing; every local run above used `env -u SANDBOX_SSH`.
- **The before child's volume carried a managed Python from an earlier session**, so its `provision-python` lines are not first-boot evidence; the five harness and tool installs were observed regardless.
- **Gate 4 helper false positive:** `browser-required` matched a file path in US-005's criteria, not a verification criterion; scored not applicable by reading all seven stories.
- **Follow-ups on #948, not verified here:** `start_period: 600s` retune; `mifunedev/openharness-web` docs sweep; the parent sandbox's own `oh` (0.1.1) and stale `.oh/cli/dist` (0.5.1) predate `oh harness`; the two `.oh/evals/probes` residuals above; the `optional-harness-install` job key rename.
