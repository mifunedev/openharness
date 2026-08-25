# Preserved decision — why no detector was added

Shipped in `[0.1.0] - 2026-08-23`. Moved here verbatim from `CHANGELOG.md` when
that file was reformatted to one-sentence entries; it carried no PR or issue link,
so this was the only record.

It documents a deliberate **non**-implementation: the two escapes are named in the
checker's clean-exit text rather than detected, because a detector for either one
reddens specimens the repo already ships as correct.

> Make the `/ste` checker's clean exit name the two defects it cannot see. Measured on the skill's first production use: `ste-check.sh` exited `0` with zero findings on prose carrying a condition placed after the action it guards and a sentence opening with a pronoun that names no antecedent — questions 4 and 7 of the skill's own 10-question check, both caught by hand seconds later. A green run reads as approval, so the exit-`0` line now states both escapes and points at `SKILL.md`, and the "checker misses" paragraph names them alongside missing actors and invented values. **No detector was added, deliberately.** A question-4 detector fires on approved `after` specimens in `references/examples.md` (lines 58, 86, 99, 140, 310, 324) and would turn `--blocks after` red, breaking the committed regression fixture; a question-7 detector cannot separate a bare pronoun from one whose antecedent sits in the previous sentence, because the checker reads one line at a time, and it would flip `references/rules.md` red too. `ste-checker-contract.sh` gains a section-7 assertion pinning the disclaimer, verified by rejection against three mutations — the bare pre-change line, and each half removed on its own. `references/examples.md`, `references/rules.md`, and `references/dictionary.md` are untouched, and no new rule identifier joins the six.
