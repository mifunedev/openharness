# Decision Record — cc-safety-net Adoption (#654)

Fate-of-hooks decisions for adopting cc-safety-net as the cross-provider
destructive-command guard. Authoritative inputs: `prd.md` (v2.1),
`install-decision.md` (US-001 spike).

## Verdicts

| # | Asset / question | Verdict | One-line rationale |
|---|---|---|---|
| 1 | cc-safety-net package | **ADOPT `@1.0.6` (exact pin)** | Deterministic destructive-command guard is the only enforcement layer under `bypassPermissions`/`approval_policy=never`; exact pin + zero boot-time registry access avoids the #639 boot crash-loop class. |
| 2 | `.oh/hooks/{deny-env-dump,deny-secret-paths,warn-devtcp,notify_slack}.sh` | **KEEP, untouched (all 4)** | Secret-exposure/notify domain — complementary to, not overlapping with, cc-safety-net's command-semantics domain. |
| 3 | `path-guard.ts` `SENSITIVE_PATHS` write/edit branch | **KEEP** | Real interactive-mode value; its pre-existing headless no-op (same `!ctx.hasUI` gate) is out of scope here — see Future Work. |
| 4 | `path-guard.ts` `RISKY_BASH` array + bash branch | **RETIRE** | Dead code in headless AND TUI modes today (two early returns: `!ctx.hasUI` and `ctx.mode === "tui"`); superseded by cc-safety-net's fail-closed pi extension. |
| 5 | Hermes provider | **DOCUMENT GAP** | No hook surface and no upstream cc-safety-net support — no code change possible; recorded gap only. |

## ADOPT details — pin + integrity

Pin: `cc-safety-net@1.0.6` (latest; published 2026-06-15). One runtime dep
(`shell-quote`), Node >=18, bin `cc-safety-net`. Tarball integrity documented
**for manual re-pin audits only** (no automated hash verification is built —
npm audit posture is degraded repo-wide per #639):

```
sha512-uc2EmRXPXb08cfN1eGnr+h3tWHqxA20fJGZoGBgW6wFl+Nubmmy6jug18vc7WrOW7dGBMPxz4VuU8srfjHtWlw==
```

Committed pin surfaces: `.devcontainer/Dockerfile` (global binary),
`.claude/settings.json` + `.codex/hooks.json` (hook command), and
`.pi/settings.json` (`npm:cc-safety-net@1.0.6`). Note: `.pi/npm/package.json`
is **boot-generated runtime state (gitignored)** — `.pi/settings.json` alone is
the committed source of truth for the pi pin.

## Update policy — manual re-pin ONLY, with re-validation

No automated version bumps (explicit non-goal). A manual re-pin MUST re-run:

1. Block-matrix smoke via the `cc-safety-net-wiring` eval probe (deny for
   `git reset --hard HEAD`, benign passes).
2. Pi extension load (`dist/pi/index.js` auto-registers on `tool_call`).
3. `cc-safety-net doctor`.

## Accepted risk — script-file evasion route

Inline destructive git is blocked; `bash .oh/scripts/foo.sh` is **not analyzed**,
so the same script-file path that keeps harness automation working
(`git-maintenance.sh`) is also the model's evasion route. **Accepted:** Docker
is the real security boundary; cc-safety-net is a footgun net (its own README's
framing), not a sandbox.

## Future Work (out of scope here)

- Pi headless SENSITIVE_PATHS gap: the retained secret-path write guard is a
  headless no-op today (same `!ctx.hasUI` gate). Real, pre-existing, not fixed
  in this change.
- Hermes destructive-command coverage: blocked upstream (no hook surface).
