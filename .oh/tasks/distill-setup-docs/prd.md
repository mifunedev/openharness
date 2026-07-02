# PRD — Distill README, docs, and wiki around the validated fresh-machine setup flow

**Issue**: #559
**Branch**: `feat/559-distill-setup-docs`
**Source plan**: `.claude/plans/context-we-just-swift-hennessy.md` (advisor → pm-agent gap audit → synthesis)

## Problem

An operator completed a full fresh-machine Open Harness setup on an OVHcloud host
(2026-07-01) and it worked — but several steps they had to perform are undocumented,
wrong, or scattered across nine files with no continuous start-to-finish narrative. A
new operator cannot go from a bare Linux host to a fully-authed multi-agent sandbox
using only the docs today.

## Goal

Distill the three doc surfaces — root `README.md`, `.oh/docs/`, and the wiki corpus at
`.oh/skills/wiki/corpus/` — around the validated 13-step flow so the next operator
reproduces it using only the docs. Docs-only change; no scripts, no code.

## Validated flow (ground truth, 13 steps)

1. Host reqs: **docker, git, build-essential (make)**
2. Clone to `~/.openharness`
3. Edit `harness.yaml` (`sandbox.name`, `sandbox.timezone`, `git.user_name`, `git.user_email`, optional installs)
4. `cd ~/.openharness && make sandbox`, then `make shell`
5. In sandbox: `gh auth login` — SSH protocol, generate SSH key, paste token
6. `gh repo create` a **private** `<gituser>/openharness`
7. Remotes: private repo → `origin`; `mifunedev/openharness` → `upstream` over SSH
8. Auth Claude
9. Auth Codex (`codex login --device-auth`) + microsoft/debugmcp VS Code extension on the remote machine
10. Auth Pi (port-1455 OAuth)
11. Auth Hermes (`hermes setup`)
12. Configure Slack for Pi and Hermes
13. Run + verify gateways (`make gateway pi|hermes`, `gateway status`, read-only `tmux attach -r`)

## Gap audit (file:line-cited)

| Step | Where documented today | Verdict |
|---|---|---|
| 1 | `README.md:7,38`, `quickstart.md:7`, `installation.md:9-16`, `intro.md:17` say "Docker + Git" only; only `contributing.md:20-24` includes `make` | WRONG everywhere operator-facing |
| 3 | `quickstart.md:108-119` and `README.md:107-116` omit the `git:` keys (real, allowlisted per `harness-config.sh:63-64`); README duplicates quickstart's table | MISSING + DUPLICATED |
| 5 | `integrations/github.md:9-18` covers only PAT/HTTPS; entrypoint auto ssh-keygen (`entrypoint.sh:275-309`) + interactive SSH path absent | MISSING |
| 6 | `gh repo create` appears nowhere | MISSING |
| 7 | `README.md:49-55` Option C / `installation.md:41-54` re-point origin only — no upstream, no SSH URLs, no private repo creation | PARTIAL |
| 8 | `harnesses/claude-code.md:27-33` documents bare `claude` only; `claude auth login` unconfirmed | DISCREPANCY — verify live |
| 9 | Codex correct (`codex.md:37-41`); `integrations/debugmcp.md` facts confirmed but written as feasibility analysis, no runbook | PARTIAL |
| 10, 11 | `harnesses/pi.md:15-28`, `harnesses/hermes.md:76-102` | CORRECT |
| 12 | Pi: `integrations/slack.md` canonical. Hermes: `hermes.md:146-149` claims full independence while `slack.md:151-152` describes the sibling `client-slack-hermes` session | WORDING DRIFT |
| 13 | `gateway status` hint prints `tmux attach -t` (no `-r`); no doc teaches read-only verify/detach | MISSING |

`ryaneggz/mifune` reference sites to remove: `README.md:10,137`, `.oh/docs/intro.md:19`,
`.oh/docs/contributing.md:78`, `.oh/docs/harnesses/overview.md:9`, `AGENTS.md:80`
(CLAUDE.md is a symlink → one edit). Keep historical mentions in `CHANGELOG.md` and
`.oh/tasks/mifune-repo-extraction/*`.

## Target doc architecture (one canonical home per fact)

| Topic | Canonical owner | Others |
|---|---|---|
| Host prerequisites (incl. `make`) | `installation.md` Prerequisites | README/quickstart/intro: 1-line + link |
| `harness.yaml` key reference (incl. `git:`) | `quickstart.md` config table | README "Configure" shrinks to a pointer |
| Install paths | `installation.md` | README keeps an abbreviated menu |
| Private-origin + upstream pattern | `installation.md` (enriched) | README leads with it |
| GitHub auth incl. SSH | `integrations/github.md` | — |
| Per-harness auth | `harnesses/*.md` | — |
| DebugMCP runbook | `integrations/debugmcp.md` (new top section) | — |
| Slack Pi / Hermes + gateway lifecycle | `integrations/slack.md` (Pi) + `hermes.md` (Hermes), both aligned to `gateway.sh` | `connecting.md` session-naming stays |
| E2E ordered walkthrough | `quickstart.md` | — |
| LLM-readable synthesis | new wiki entity page | — |

> **Named exception to "one canonical home per fact".** The `quickstart.md` E2E walkthrough
> (US-009) deliberately *inlines* each step's command so it is copy-paste runnable end-to-end;
> the canonical docs remain the authoritative depth/troubleshooting home. This is an accepted
> read-path trade-off, not accidental duplication. The wiki entity page (US-010) avoids the
> drift surface entirely by holding only synthesis + a doc-handoff map (no literal commands).
> An optional fast-follow probe (`quickstart-command-consistency.sh`) could enforce parity;
> it is out of scope for this PR.

## Requirements (user stories → see prd.json)

- Host-deps `make` fix across all operator-facing docs.
- `harness.yaml` `git:` key reference in the quickstart config table; README "Configure" shrinks to a pointer.
- Private-origin + upstream pattern (private `gh repo create`, SSH remote URLs, upstream remote) in installation.md + README.
- GitHub SSH auth path documented in `integrations/github.md` (interactive `gh auth login` + entrypoint auto-keygen).
- DebugMCP "Confirmed setup" runbook prepended to `integrations/debugmcp.md`.
- Claude auth command verified live and corrected in `harnesses/claude-code.md`.
- Slack/gateway alignment across `slack.md` + `hermes.md` + a "Run and verify" subsection with read-only `tmux attach -r` + detach.
- Remove all `ryaneggz/mifune` references from the 6 sites.
- End-to-end 13-step quickstart walkthrough linking each step to its canonical doc.
- New wiki entity page `fresh-machine-setup.md`.

## Non-goals

- Script/code changes: `install.sh`, `Makefile`, `entrypoint.sh`, `gateway.sh` (mismatches are findings only).
- `openharness-web` Docusaurus site; `_category_.json` restructuring.
- Other harness/integration docs not implicated by the 13 steps.
- Scrubbing `CHANGELOG.md` or `.oh/tasks/mifune-repo-extraction/*` history.
- Merge/release mechanics; no auto-merge.

## Verification

1. `grep -rn "Docker + Git" README.md .oh/docs/` → 0 hits (DIRECTORY arg — true recursion; a `.oh/docs/*.md` glob would silently skip `harnesses/` and `integrations/`).
2. `grep -rn "ryaneggz/mifune" README.md AGENTS.md .oh/docs/` → 0 hits.
3. **Preserve-check (US-008), per-path (not aggregate)**: the live `.oh/tasks/mifune-repo-extraction/` was archived by the cleanup-tasks cron to `.oh/tasks/archive/2026-07-02/mifune-repo-extraction/`. Baselines to hold UNCHANGED: `CHANGELOG.md` = 14, `.oh/tasks/archive/2026-07-02/mifune-repo-extraction/` = 64 (`grep -rc "ryaneggz/mifune"` per path). `CHANGELOG.md` is the git-tracked audit trail; the archive is gitignored working-tree history.
4. **Railway/curl retention (US-003)**: the FULL markdown blocks survive, not just substrings — Railway `[![Deploy on Railway](…button.svg)](…)` image+link and the exact fenced `curl -fsSL https://oh.mifune.dev/install.sh | bash` command both still present after the reorder.
5. **Option-letter cross-ref (US-003)**: `grep -n "Option [A-Z]" README.md` — every letter reference (esp. README.md:154 "Option B above") points to the intended content.
6. Live-sandbox check (THIS sandbox) for the Claude auth command and `gateway status` / read-only `tmux attach -r`. Unverifiable facts get a `> Unverified — ...` prose admonition, not an asserted command.
7. `bash .oh/evals/probes/wiki-readme-index.sh` green after the wiki entry; `/wiki lint` reports no broken links.
8. Docs-only dry-run: all 13 steps reproducible from the `quickstart.md` walkthrough ALONE (it inlines every command); each command also agrees with its canonical doc.

## Execution order & reversibility

- **Strict priority order.** US-001..US-008 are the canonical-fact edits; US-009 (walkthrough) and US-010 (wiki) are a **final serial pass** after US-001..US-008 land, since both consume the final doc state. Do not fan out US-009/US-010 in parallel with earlier stories.
- **README ordering decision is reversible.** Leading the Install section with the private-origin+upstream path (demoting Railway/curl) is an editorial reorder, not a deletion — both the Railway button and the curl one-liner stay present and functional (US-003 AC). Trivial to soften back to "enrich Option C only" if the maintainer prefers.
- **Live-verification environment** for US-006/US-007 is this sandbox (docker exec into the `openharness` container / `gateway status`). "Provisional" in prose docs = an explicit `> Unverified — ...` blockquote, never the wiki `confidence:` field.

## Wiki Alignment

**Impact: REQUIRED**

- **Local entries today**: the corpus holds only `recursive-language-models.md` and
  `sandbox-dependency-installs.md` (+ generated `README.md` index). Neither covers the
  fresh-machine setup flow.
- **Spec alignment**: this PRD adds one canonical entity page,
  `.oh/skills/wiki/corpus/fresh-machine-setup.md`, synthesizing the validated 13-step flow
  with a Mermaid diagram mapping each step to its canonical doc handoff. It must follow
  `.oh/skills/wiki/references/schema.md` (frontmatter + ordered sections, ≤900 words for an
  architecture/harness entry), carry `confidence: provisional` on any step not verified
  live, and be whitelisted with `git add -f` (corpus is gitignored-by-default).
- **DeepWiki comparison**: the public DeepWiki for `mifunedev/openharness` has no
  operator-onboarding page at this granularity; this entry is net-new synthesis, not a
  duplication of an existing DeepWiki page.
- **Acceptance criteria the story must carry**: the new entry passes
  `bash .oh/evals/probes/wiki-readme-index.sh` (README index regenerated to include the
  new row, sorted by `updated` desc), and `/wiki lint` reports no broken links.
