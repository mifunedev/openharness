# Evidence — remove the `.oh/context/` always-on context tier (#868)

Five protected paths are deleted here. `.claude/protected-paths.txt` requires each
to be named and justified, never removed silently.

## `.oh/context/SOUL.md`

Deleted. 1,648 B of voice guidance with no consumer. Every reference to it was
machinery that existed to measure or protect it — the `AGENTS.md` read-list, the
tier size-budget probe, the ablation allowlist, and its own entry in
`.claude/protected-paths.txt`. Nothing read it to make a decision. The voice
content it carried is already expressed in `AGENTS.md` § A note from the
maintainer and § Taste.

## `.oh/context/IDENTITY.md`

Deleted. This was the only genuinely load-bearing file of the five: it was
`/retro`'s single write target, holding an append-only list of dated lessons.
It goes because a lesson that matters must graduate to a **probe**, not to
prose — the repository's own non-negotiable that code, tests, and probes are the
evidence. `/retro` is now strictly report-only and nominates candidate probes
under `.oh/evals/probes/` instead. The dated lessons it held that concern guard
and probe discipline are already honoured by existing probes.

## `.oh/context/TOOLS.md`

Deleted. 1,644 B instructing agents to prefer local CLI tools after verifying
they are installed. No consumer, and the guidance is already carried by the
skills that actually invoke tools.

## `.oh/context/USER.md`

Deleted. 3,277 B of collaboration preferences. No consumer. The single-developer,
single-project framing it supplied to `/critique` and `/ship-spec` is now stated
inline at those two call sites, so the framing survives the file.

## `.oh/context/REPO_MAP.md`

Deleted. 12,220 B — 47% of the tier — removed as **unproven**, not disproven.
Its A/B benchmark (`CB-004`, the `repo-orientation` manifest, and the scorer)
landed 2026-07-03 and the paired workload was never run once in the roughly two
months they stood, which is why the row held at `delta +0.00 machinery-added`:
no measurement was ever taken. Its guard asserted about fifteen literal prose
strings and passed green while the routing table it guarded pointed readers at
`.pi/skills/*` provider mirrors rather than the canonical `.oh/skills/*`.

## `.oh/skills/retro/scripts/check-identity-duplicates.sh`

Deleted. It deduplicated `/retro`'s promotion candidates against
`.oh/context/IDENTITY.md`. With that file gone and `/retro` report-only, it has
no subject. The deduplication rule survives as a stated constraint: discard a
hypothesis already guarded by an existing probe.

## Why the whole tier goes

There was no loader. No `SessionStart` hook exists, so the tier was read only
because `AGENTS.md` asked for it in prose, and the probe guarding that asked
whether the *instruction* was present — never whether the read happened. The
tier is not loaded consistently across coding harnesses, so it cannot be a
standard practice. `AGENTS.md` remains, auto-loaded mechanically through the
`CLAUDE.md` symlink, which makes the surviving always-on context guaranteed
rather than requested.

`.oh/context/directory-readme.md` is **not** deleted — it is relocated to
`.oh/skills/harness-context/references/directory-readme.md`.
