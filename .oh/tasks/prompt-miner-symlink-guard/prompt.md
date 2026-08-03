# Standing prompt — prompt-miner symlink guard (#663)

Scope is **narrow by council ruling**. Two elements were refuted by construction
during the adversarial pass and must not be reintroduced:

1. **No `else` branch on the entrypoint guard.** An `else { process.exit(70) }`
   kills any host process that imports `mine-traces.mjs` for its named exports,
   before the importer's next line runs, and `process.exit()` is not catchable
   around a static or dynamic import.
2. **Do not repoint `SKILL.md:92` off `${CLAUDE_SKILL_DIR}`.** The premise that
   the variable is unset was measured in a bare shell, which never exercises
   skill-body injection. The variable is documented as CLI-injected at
   `.oh/skills/builder/references/skill.md:112` and is used by ~7 skills.

Do not touch `rlm/scripts/query-context.mjs` or `weigh/scripts/score-trajectories.mjs`
— both already carry the correct guard and the comment naming this bug. They are
the precedent, not the work.

Do not widen scope to the four companion engine defects (`withinWindow` firstTs,
hardcoded project dir, absent `isSidechain`, `AUTOPILOT_LOG_ROOT` log-loss). They
are real, verified, and belong in their own issues — bundling them would let this
PR read as "prompt-miner is fixed," which is the specific misreading US-004 exists
to prevent.

Every commit carries a `Submitted-by:` trailer. Push to **`upstream`**
(mifunedev) only — `origin` (ryaneggz) is a stale fork. No auto-merge; the human
owns the merge gate.
