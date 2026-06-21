# prompt-miner — Pi provider parity

US-008 asks: if `.pi/skills/` mirrors `.claude/skills/` as an invariant, create
`.pi/skills/prompt-miner/` as a byte-identical copy; otherwise record why parity
is not required.

**No byte copy is required — parity is structural.** In this repo `.pi/skills` is a
tracked symlink, not a copied tree:

```
$ readlink .pi/skills
../.claude/skills
$ git ls-files -s .pi/skills
120000 454b8427cd757f30dc7fdb9a325d19c399770417 0	.pi/skills
```

Git mode `120000` is a symlink object whose blob is the link target
`../.claude/skills`. Every skill authored under `.claude/skills/<name>/` is
therefore visible at `.pi/skills/<name>/` automatically and can never drift —
`.pi/skills/prompt-miner/` resolves to `.claude/skills/prompt-miner/` byte-for-byte
with zero maintenance and no second copy to keep in sync.

This is why the two `.pi`-aware eval probes
(`evals/probes/locked-append-critical-path.sh`,
`evals/probes/ship-spec-ready-finalization.sh`) read `.pi/skills/<name>/SKILL.md`
directly and find the same content the `.claude` side has: the symlink makes them
the same file. A per-skill byte-copy parity probe would be redundant here.

If a future provider layout ever replaces the `.pi/skills` symlink with a real
directory of copies, this note (and the parity assumption) must be revisited.
