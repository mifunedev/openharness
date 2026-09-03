# Critique — prime-rl-integration

Two adversarial critics (integration-correctness lens + operator/scope lens),
two rounds against `.oh/tasks/prime-rl-integration/prd.md`, per the
`spec-plan ⇄ spec-critique` loop (`AGENTS.md § The Workflow`).

**Final verdict: APPROVED** — both critics PASS after two revision cycles; no
unmitigated high-severity findings remain.

---

## Round 1 — initial draft (both critics: FAIL)

### Critic 1 — Integration correctness

| Finding | Severity | Resolution (revision 1) |
|---|---|---|
| Wiki "no orphan findings" criterion could not pass as worded — a brand-new entry with zero inbound `[[slug]]` links is a true-positive orphan finding by design (`.oh/skills/wiki/references/lint.md` § 6) | high | US-006 now requires the reciprocal `[[prime-rl-training]]` backlink in `recursive-language-models.md` in the same change; criterion reworded to "no broken-link findings" |
| Validation build had no `SANDBOX_NAME` isolation — `container_name: ${SANDBOX_NAME:-openharness}` collides with a running sandbox on a shared host | high | US-008 mandates `SANDBOX_NAME=oh-prime-rl-validation` |
| ADR-6 scaffold location left as an open question across memory-less ralph iterations | medium | Pinned to `$HOME/prime-labs/<name>` in ADR-6, with a container-ephemerality/drift note |
| Original US-003 bundled skill + reference + CLAUDE.md registration — exceeded ralph story sizing | medium | Split into US-003 (skill body) + US-004 (reference + registration); stories renumbered US-001..US-008 |
| `verifiers` package + `StatefulToolEnv` pattern + LoRA deployment step not required content anywhere | medium | Now mandatory content items in US-003/US-005/US-006 |
| shellcheck AC didn't cite the exact CI invocation; opt-in path shown env-var-first against the harness.yaml-first convention; US-002 ordering rationale was factually wrong; deny-hook term missing `(^|/)` anchor | low | All fixed in revision 1 |

### Critic 2 — Operator & scope

| Finding | Severity | Resolution (revision 1) |
|---|---|---|
| `.gitignore` fix used a bare mid-slash literal `configs/endpoints.toml` — anchored to repo root per gitignore semantics, defeating the nested-scaffold defense ADR-4 exists for | high | Glob-anchored `**/secrets.env` + `**/configs/endpoints.toml` |
| US-002's real check only tested root-relative paths — would pass with the anchoring bug present | high | Real check now asserts nested `foo/secrets.env` + `foo/configs/endpoints.toml` via `git check-ignore` |
| Guard set is THREE layers, not two: `.oh/hooks/deny-env-dump.sh` (Bash-command guard) had no `.toml` term at all, and `secrets.env` was only caught by an accidental `\.env` substring match | high | Layer 3 added to ADR-4/US-002/US-007; § 6 reframed "three secret guards move together" |
| US-008 pastes verbatim CLI output into a tracked doc — no hook screens pasted prose content, only tool-call paths/commands | high | Mandatory redaction pass + manual token review AC added |
| G3 claimed W&B config paths guarded but no story named a concrete W&B pattern | high | W&B file-guarding explicitly scoped OUT in Non-Goals (no confirmed filename exists); G3 softened to the two confirmed surfaces |
| Unpinned `uv tool install prime` (supply-chain exposure; consistent with DeepAgents/Hermes precedent) | medium | Acknowledged in ADR-1/§ 6 with a follow-up pointer |
| US-003 real check (`link-providers.sh --check`) was vacuous — hardcoded lists don't cover prime-rl | medium | Real check now asserts `.claude/skills/prime-rl/SKILL.md` resolves directly |

## Round 2 — revised draft

- **Critic 1 (correctness): PASS.** Both round-1 highs verified genuinely
  closed against the live lint doc and compose file; all US-00N
  cross-references traced consistent post-renumbering; new ADR-4 layer-3
  content verified factually accurate against the live hook. Residual LOW
  notes only (redundant-but-harmless symlink check; US-006 word-budget
  pressure).
- **Critic 2 (operator/scope): FAIL** — one new high found **in the fix
  itself**: the `$`-anchored `(^|/)secrets\.env$` term is correct for
  `deny-secret-paths.sh` (isolated file-path context) but wrong for
  `deny-env-dump.sh`, which matches the **entire Bash command string** — a
  `$` anchor misses `cat foo/secrets.env | grep TOKEN`-style commands, and
  the prescribed grep real check would not have caught the wrong anchor.

## Round 2.1 — targeted fix (operator critic: PASS)

Applied exactly as specified: ADR-4/US-002 now require `(^|/)secrets\.env\b`
(word-boundary, matching the hook's `\.pem\b` convention) for the
`deny-env-dump.sh` insertion only, with the `$`-anchored form retained for
layer 2 where it is correct; terms must land inside the existing
`SECRET_PATH` outer-paren group; the real check uses
`grep -qF 'secrets\.env\b'` so a mistakenly `$`-anchored term fails the
check. Critic verified `-qF` correctly discriminates the two forms.
Residual: one LOW style nit (no `\b` on the `configs/endpoints\.toml`
sibling term — over-match tolerance only, non-blocking).

---

## Verdict

**APPROVED.** Both lenses PASS; every high-severity finding has a named,
verified mitigation in the PRD itself. Non-blocking residuals (LOW) are
recorded above for the executor's awareness, not as gate conditions.
