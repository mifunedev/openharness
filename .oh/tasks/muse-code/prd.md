# Muse Code first-class installation

Add `oh harness install muse-code` under the current catalog and persistent-home model.
The operator clarified that #952 describes retired machinery. Preserve #948 and #950.

## Architecture Brief

Classification: ARCHITECTURAL. The decision affects provider discovery and secret configuration.
Reuse the current installable catalog entry, home volume, canonical linker, and secret allowlist.
Do not add a provider subsystem, boot provisioner, or instruction owner.

Scores are judgments on a 1–10 scale. All ten criteria have equal weight.
Columns: architecture consistency, simplicity, reproducibility, home compatibility, portability, runtime cost, maintenance, upstream independence, testability, user experience.

| Approach | Scores | Mean | Decision |
|---|---|---|---|
| Current first-class installable entry and standard skills | 10,10,8,10,10,10,9,8,10,9 | 9.4 | Select |
| Historical optional entry with install intent | 2,3,9,10,8,8,4,8,8,7 | 6.7 | Reject: reverses #948 |
| On-demand only | 8,9,6,8,8,9,8,7,8,7 | 7.8 | Reject: weaker installation contract |
| Default installation | 1,4,8,9,8,2,5,7,8,5 | 5.7 | Reject: reverses #948 |
| Generic external-harness framework | 5,2,8,9,9,8,3,7,6,6 | 6.3 | Reject: no demonstrated need |
| Muse-specific provider/config subsystem | 3,2,7,9,3,8,2,3,6,5 | 4.8 | Reject: duplicates standards |

The installer supports `MUSE_INSTALL_DIR`, `MUSE_NO_MODIFY_PATH=1`, and `MUSE_LOGIN=0`.
Official sources: https://dev.meta.ai/install.sh and https://api.meta.ai/muse-launcher.sh.
Auth, configuration, and extending documents live under https://dev.meta.ai/docs/muse-code/ with `.md` suffixes.
Real installation and unauthenticated discovery remain experimental verification tasks.

## User stories

1. Register Muse as installable, sandbox-owned, home-local, with its version probe. Prove live install, idempotence, stopped refusal, failure reporting, and unchanged configuration.
2. Expose `.agents/skills` through the canonical linker. Prove creation, repair, collision preservation, clean-clone resolution, and no retired project-agent catalogs.
3. Support `META_API_KEY` in the existing secret mechanism. Document interactive authentication, explicit process environment injection, context, skills, persistence, uninstall, and limitations.
4. Verify the real installer, version and skill discovery. Run relevant tests, probes, build, typecheck, and CI. Record evidence and reconcile affected knowledge.

## Files and acceptance mapping

| Criteria from #952 | Implementation and evidence |
|---|---|
| Official upstream, prefix, shell side effects, version | Catalog; disposable-home real installer; official source evidence |
| First-class optional support | `catalog.ts`: current `kind: installable`; catalog tests |
| Live install and idempotence | Existing harness command; Muse lifecycle tests and real CLI execution |
| Persisted intent, stopped intent, automatic restoration, provisioning tests | Superseded by operator: preserve config; stopped install fails; fresh home requires verb |
| No Muse package list | Provisioner remains absent; harness-one-door probe |
| Standard skill link and validation | `link-providers.sh`, tracked `.agents/skills`, skills-vendored probe, behavioral linker tests |
| oh init provider link | Superseded: bootstrap calls canonical linker; init remains absent |
| AGENTS and skill consumption | Upstream sources, `muse skills` runtime experiment; no new instruction file |
| Auth and persistence | `secrets.ts`, config-secret tests, Muse guide; home-local real binary checks |
| Documentation | Muse guide, overview, configuration, installation, quickstart, directory layout, changelog |
| Catalog/schema/command tests | Catalog and command tests; secret tests; config remains without install fields |
| Existing suites and no parallel architecture | Relevant Vitest, typecheck/build, eval and review |

## Affected surfaces

| Surface | Disposition |
|---|---|
| Host and sandbox | Applied: catalog works through existing execution targets; installer runs as sandbox |
| Lifecycle door | Applied: only harness install/list/status |
| Canonical and provider surfaces | Applied: canonical linker and .agents symlink |
| Root and scaffold | Applied: root link plus sandbox linker; retired scaffold remains absent |
| Interactive and headless processes | Applied: document Herdr; no service introduced |
| Local and remote operation | Applied: upstream no-login installation; home persistence |
| Parallel operation | Applied: isolated feature worktree; explorers read only |
| Public documentation | Applied: mirror relevant guide pages in separate website checkout if permitted by its ownership instructions |
| Verification | Applied: behavioral tests, runtime experiment, probes and CI |

## Knowledge Context

- **Base commit**: `372581cd96ba2931b8328cff59cbdeeae9a9043f`
- **Queries**: `cli sandbox lifecycle` and patterns for those terms
- **Knowledge used**: `[[oh-cli-portable-lifecycle]]`, `[[sandbox-dependency-installs]]`, `[[fresh-machine-setup]]`
- **Grounded against**: `.oh/cli/src/lib/harnesses/catalog.ts`, `.oh/cli/src/commands/harness.ts`, `.oh/scripts/link-providers.sh`, `.oh/cli/src/lib/secrets.ts`, `.oh/evals/probes/harness-one-door.sh`, `.devcontainer/docker-compose.yml`
- **Conflicts discovered**: Issue requires features intentionally removed by #948 and #950. Operator resolved the conflict.

## Expected Knowledge Impact

- **Impact**: REQUIRED
- **Expected entries**: `oh-cli-portable-lifecycle`, `fresh-machine-setup`
- **Affected source paths**: catalog, linker, secrets, harness docs
- **Reason**: Reverify dependencies against the actual diff; no new lifecycle mechanism.

## Plan Reconciliation

- **Source plan**: `.oh/tasks/muse-code/execution-prompt.md` and issue #952
- **Intent preserved**: YES
- **Material deviations**: Operator approved current first-class installation and confirmed oh init retirement.
- **Constraints discovered during grounding**: No install keys or boot provisioning; Muse auth instructions differ from the ticket.
