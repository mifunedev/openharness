# STE Rules

This file holds the writing rules for the `/ste` controlled-language standard, which governs technical prose in the Open Harness repo. The rules follow the published shape of ASD-STE100: a numbered rule set plus a controlled dictionary of approved words. Every rule statement below carries original wording, quotes no published text, and claims no compliance or certification. The linter `scripts/ste-check.sh` enforces the mechanical subset of these rules, and `SKILL.md` holds the entry procedure.

Source: https://www.asd-ste100.org/

## Contents

- [1. Words and terminology](#1-words-and-terminology)
- [2. Noun phrases and identifiers](#2-noun-phrases-and-identifiers)
- [3. Verbs and voice](#3-verbs-and-voice)
- [4. Sentences](#4-sentences)
- [5. Procedures and steps](#5-procedures-and-steps)
- [6. Descriptive and explanatory text](#6-descriptive-and-explanatory-text)
- [7. Warnings, cautions, and irreversible actions](#7-warnings-cautions-and-irreversible-actions)
- [8. Code, commands, and literals](#8-code-commands-and-literals)
- [9. Ambiguity, missing information, and placeholders](#9-ambiguity-missing-information-and-placeholders)

The rules serve five goals in this priority order:

1. Technical correctness
2. Unambiguous meaning
3. Consistent terminology
4. Explicit sequencing
5. Concision

A longer sentence wins when the extra words remove an ambiguity. A shorter sentence loses when the cut drops a fact.

## 1. Words and terminology

Word choice carries the largest share of ambiguity. Fix the vocabulary before you fix the sentence.

### 1. One word carries one meaning

Give each word exactly one meaning for the whole repo. Fix the meaning at first use and hold that meaning everywhere. A word with two meanings forces the reader to guess.

```text
Wrong: Mount the drive, then mount the response body on the router.
Right: Mount the drive. Attach the response body to the router.
```

### 2. One meaning carries one word

Pick one word per concept and repeat that word. Never rotate synonyms for variety. A synonym reads as a second concept.

### 3. Prefer the short approved word

Choose the shortest approved word that keeps the meaning. Replace a long Latin word with a short verb: `utilize`, `commence`, `terminate`, and `ascertain` each map to a shorter English verb.

```text
Wrong: Utilize the helper prior to the build.
Right: Use the helper before the build.
```

### 4. No idiom and no slang

Write the literal action. Drop figures of speech, metaphors, and shorthand from spoken English. A non-native reader and a translation engine both fail on an idiom.

```text
Wrong: Kick off the run and keep an eye on the logs.
Right: Start the run. Read the log output every 30 seconds.
```

### 5. No marketing language

State a measured property instead of a claim of quality. The linter rejects `seamless`, `robust`, `powerful`, and `best in class`, because none of them carries a measurement.

```text
Wrong: The provisioner gives a seamless, robust startup.
Right: The provisioner starts the container in under 12 seconds.
```

### 6. No hedge and no filler

Delete a qualifier that changes no fact. The linter rejects `basically`, `simply`, `just`, `obviously`, `essentially`, `typically`, and `probably`. When a claim holds under a condition, write the condition.

```text
Wrong: You can basically just restart the container.
Right: Restart the container after you edit the config file.
```

### 7. One verb beats a phrasal verb

Replace a verb plus particle with a single verb when a single verb exists. A phrasal verb carries an idiomatic meaning a reader can miss.

```text
Wrong: Bring up the stack, then take down the old one.
Right: Start the stack. Stop the previous stack.
```

### 8. Avoid a word with two software meanings

Reject a word that reads two ways in a software context. Name the exact object instead. The words `run`, `image`, `key`, `host`, `build`, and `state` each need a qualifier.

```text
Wrong: Check the image before the run.
Right: Check the container image digest before the test run.
```

## 2. Noun phrases and identifiers

A noun phrase names the object of the action. Keep the name short, exact, and stable.

### 9. Cap a noun cluster at three words

Use at most three nouns in a row. Break a longer cluster with a preposition or a relative clause. A four-noun cluster hides the head noun.

```text
Wrong: sandbox container image build cache directory
Right: the build cache directory for the sandbox container image
```

### 10. Keep the article

Write `the`, `a`, or `an` before every countable noun. A dropped article turns a noun into a modifier and changes the reading.

### 11. One name per object

Call the same object by the same name in every sentence, heading, table cell, and diagram label. A rename applies to the whole document at once.

```text
Wrong: the worktree ... the checkout ... the branch dir
Right: the worktree ... the worktree ... the worktree
```

### 12. Name the component

Name the exact component instead of a placeholder noun. Phrases such as `the system`, `the tool`, and `the thing` hide the target of the instruction.

```text
Wrong: The system rejects the token.
Right: The auth middleware in `apps/api` rejects the token.
```

### 13. Copy an identifier exactly

Copy every file path, package name, environment variable, function name, and label character for character. Keep the case, the separators, and the extension. A near-miss identifier costs the reader a failed search.

```text
Wrong: the oh scripts ralph script
Right: `.oh/scripts/spec-build.sh`
```

## 3. Verbs and voice

The verb carries the actor and the tense. Keep both visible in every clause.

### 14. Write in the active voice

Put the actor before the verb in every sentence. The active voice names who acts and shortens the sentence.

```text
Wrong: The volume is mounted at container start.
Right: The runtime mounts the volume at container start.
```

### 15. Use the imperative for an instruction

Start an instruction with the bare verb. Drop `you should`, `you can`, and `the user must`. An imperative removes the question of who acts.

```text
Wrong: You should probably restart the worker.
Right: Restart the worker.
```

### 16. Hold one tense family

Write instructions and descriptions in the present tense. Use the past tense only for a recorded event, and the future tense only for a scheduled event.

```text
Wrong: The runner had fetched the branch and will then verify it.
Right: The runner fetches the branch. The runner verifies the checksum.
```

### 17. Prefer an infinitive to an -ing form

Replace a gerund or a participle with an infinitive or a finite verb. An `-ing` form hides the tense and the actor.

```text
Wrong: Running the probe before merging catches the regression.
Right: Run the probe before you merge. The probe catches the regression.
```

### 18. Name the actor

Name the person, process, or service that performs each action. Write `the operator`, `the cron job`, or `the CI runner` instead of an unnamed subject.

```text
Wrong: The branch gets rebased overnight.
Right: The nightly cron job rebases the branch at 03:00 UTC.
```

### 19. Avoid a linking verb plus a past participle

Delete constructions of `be` plus a past participle. Rewrite the clause with the actor as the subject. This pattern hides more actors than any other pattern in the repo.

```text
Wrong: The cache was cleared before the build was started.
Right: The install script clears the cache. The script starts the build.
```

### 20. Keep the subject

Write a subject in every sentence except an imperative. A headless clause forces the reader to carry the subject from an earlier sentence.

```text
Wrong: Returns 0 on success, otherwise exits 1.
Right: The script returns 0 on success. The script exits 1 on failure.
```

## 4. Sentences

A sentence holds one unit of meaning. Keep the unit small enough to hold in one reading.

### 21. One idea per sentence

Carry one fact or one action in each sentence. Split a sentence at the conjunction when both halves stand alone.

### 22. Cap an instruction at 25 words

Keep every instruction sentence at 25 words or fewer. The linter `scripts/ste-check.sh` reports a longer sentence as a LONG finding.

```text
Wrong: Before you start the container, check that the host has 4 GB of free memory, and if the check fails, prune the build cache and retry.
Right: Check the free host memory before you start the container. Prune the build cache when the host has under 4 GB free.
```

### 23. Cap a description at 30 words

Keep a descriptive sentence at 30 words or fewer. Run the linter with `--max-words 30` on a file of pure description. Instructions keep the 25-word cap.

### 24. Put the condition before the action

Write the condition first and the action second. The reader then knows whether to read the action at all.

```text
Wrong: Prune the build cache if the disk has under 10 GB free.
Right: When the disk has under 10 GB free, prune the build cache.
```

### 25. Prefer a positive instruction

State the action to perform rather than the action to avoid. Use a negative form only for a prohibition that guards a loss.

```text
Wrong: Do not forget to pass the branch name.
Right: Pass the branch name as the first argument.
```

### 26. No bare pronoun subject

Never open a clause with `it`, `this`, `that`, `these`, or `those` as the whole subject. Attach the pronoun to a noun, or repeat the noun.

```text
Wrong: This breaks the build.
Right: The missing lockfile breaks the build.
```

### 27. Use a list for more than two conditions

Move three or more conditions out of the sentence and into a bulleted list. Keep the shared lead-in clause above the list.

```text
Wrong: The gate passes when CI is green, the PR has no draft flag, and two reviewers have approved the change.
Right: The gate passes when each of the following holds:
       - CI reports success on the head commit.
       - The pull request carries no draft flag.
       - Two reviewers approved the change.
```

## 5. Procedures and steps

A procedure runs in order. Write the order, the actor, and the place of execution.

### 28. Start a step with its verb

Open every step with the imperative verb. Move context, rationale, and cross-references to a sentence after the verb.

```text
Wrong: For the cache to warm, the build should be run twice.
Right: Run the build twice. The second run reads the warm cache.
```

### 29. Number an ordered procedure

Number the steps whenever order matters. Use a bulleted list only when the reader may perform the items in any order.

### 30. One primary action per step

Keep one action in each step. Split a step of two verbs into two numbered steps. The linter reports a two-verb step as a COMPOUND finding.

```text
Wrong: 3. Stop the container and remove the volume.
Right: 3. Stop the container.
       4. Remove the volume.
```

### 31. State a prerequisite above the step that consumes it

List every prerequisite above the first step that consumes it. A prerequisite buried inside step 7 arrives too late for a reader at step 1.

```text
Wrong: 7. Run the migration. The migration needs DATABASE_URL.
Right: Prerequisite: export DATABASE_URL before step 1.
       7. Run the migration.
```

### 32. State the expected result

End each step with the observable result. Give the exact output line, exit code, or UI state. A reader without an expected result cannot detect a partial failure.

```text
Wrong: 2. Start the stack.
Right: 2. Start the stack. `docker compose ps` lists three containers in state `running`.
```

### 33. Name the actor and the execution context

State who runs each step and where the step runs. Mark each command as host, container, local, or remote. A command in the wrong context damages the wrong machine.

```text
Wrong: Run `make destroy`.
Right: On the host, run `make destroy`. Never run this command inside the container.
```

### 34. Expose every hidden sequence

Write each implied action as its own numbered step. A reader performs the written steps only.

```text
Wrong: 1. Deploy the branch.        (the build and the migration stay implied)
Right: 1. Build the image.
       2. Run the migration.
       3. Deploy the branch.
```

### 35. Put the warning above the step it guards

Place a warning on the line before the step, never after. A warning below the step arrives after the loss.

```text
Wrong: 4. Run `docker compose down -v`.
       Warning: the flag deletes every named volume.
Right: Warning: `-v` deletes every named volume of this project.
       4. Run `docker compose down -v`.
```

## 6. Descriptive and explanatory text

Descriptive prose records the current behavior of the code. Bound every claim you write.

### 36. State a fact, not an intent

Describe observed behavior in the present tense. Move a plan, a wish, or a roadmap item to an issue. Prose in this repo describes the code at the current commit.

```text
Wrong: The runner will eventually support parallel waves.
Right: The runner runs one wave at a time. Issue #412 tracks parallel waves.
```

### 37. Cap a paragraph at six sentences

Keep each paragraph at six sentences or fewer. Split a longer paragraph at the first topic change.

### 38. State units, paths, and identifiers

Write the unit with every number. Write the absolute path or the repo-relative path with every file reference. Write the exact identifier with every named object.

```text
Wrong: The timeout is large. Edit the config in the scripts folder.
Right: The timeout is 600000 ms. Edit `.oh/scripts/spec-build.sh` at line 42.
```

### 39. A heading is not an antecedent

Repeat the subject in the first sentence under a heading. A pronoun in that sentence has no antecedent in the prose.

```text
Wrong: (heading) Provisioner startup
       It runs at container start.
Right: (heading) Provisioner startup
       The provisioner runs at container start.
```

### 40. State the scope of a claim

Bound every claim by version, path, branch, or environment. An unbounded claim becomes false at the next change.

```text
Wrong: The probe suite runs in CI.
Right: On `development`, the workspace-and-postgres job runs the probe suite.
```

## 7. Warnings, cautions, and irreversible actions

A warning prevents a loss. Place the warning where the reader still holds a choice.

### 41. Put the warning before the action

Write the warning above the command, the step, or the code block it guards. A reader executes the first command on the page.

```text
Wrong: Run `git clean -xfd`. This deletes untracked files.
Right: Warning: `git clean -xfd` deletes every untracked file, with no undo.
       Run `git clean -xfd`.
```

### 42. State the consequence and the blast radius

Name the exact loss and the exact scope. Name the volume, branch, account, host, or dataset the action touches. A warning without a scope reads as noise.

```text
Wrong: Warning: this step is destructive.
Right: Warning: `make destroy` removes the `openharness` container and every
       named volume of this project. Other Docker projects on the host survive.
```

### 43. Write a warning in full prose

Write every warning as complete sentences. Never compress a warning with an output-compression mode, an abbreviation, or a fragment. Compression of a warning drops the actor, the object, or the condition.

```text
Wrong: WARN: destroy = data gone
Right: Warning: `make destroy` deletes the Postgres data volume. The deletion
       removes every local row.
```

### 44. State whether the action reverses

Name the recovery path for the action. Declare the absence of a recovery path in the same warning. Give the exact restore command when a backup exists.

```text
Wrong: Careful with the reset.
Right: `git reset --hard` discards every uncommitted change, with no undo.
       `git reflog` recovers a committed state only.
```

### 45. Name every object the action destroys

List each file, volume, branch, table, and remote reference the action removes. A reader cannot audit a warning that names no object.

```text
Wrong: The teardown cleans up.
Right: `make destroy` removes the container `openharness`, the volume
       `harness_node_modules`, and the network `harness_default`.
```

## 8. Code, commands, and literals

Code carries no controlled vocabulary. Copy the literal, and mark the boundary with backticks.

### 46. Never simplify code or a command

Copy every command, code sample, API name, filename, path, configuration key, and quoted literal exactly. These rules govern prose only. A shortened command breaks on paste.

```text
Wrong: Run the compose up command.
Right: Run `docker compose up -d --build`.
```

### 47. Copy an error string exactly

Reproduce an error message, log line, or stack frame character for character. Never paraphrase, translate, or shorten an error string. A reader searches for the exact string.

```text
Wrong: The build fails with a missing-module error.
Right: The build fails with `Error: Cannot find module 'zod'`.
```

### 48. Keep flags and versions verbatim

Write each flag, each argument, and each version number exactly as the program accepts them. Keep the leading dashes, the equals sign, and the full version string.

```text
Wrong: Pass the max words flag with a value of thirty. Install Node 22.
Right: Pass `--max-words 30`. Install Node `v22.14.0`.
```

### 49. Mark inline code with backticks

Wrap every identifier, path, flag, command, and literal in backticks. `scripts/ste-check.sh` strips a backtick span before it applies a detector, so a marked literal never triggers a false finding.

```text
Wrong: Set the log level env var to debug.
Right: Set `LOG_LEVEL=debug`.
```

### 50. State the working directory

Name the directory each command runs from. Give an absolute path or a repo-relative path above the command block.

```text
Wrong: Run `pnpm test`.
Right: From the repo root `/home/sandbox/harness`, run `pnpm test`.
```

## 9. Ambiguity, missing information, and placeholders

An unknown value stays unknown in the prose. Mark the gap where the reader meets it.

### 51. Mark a missing value with a placeholder

Never invent a value. Write an angle-bracket placeholder such as `<duration>`, `<component>`, or `<branch>` in place of the unknown value. A guessed value reads as a verified fact.

```text
Wrong: The watchdog waits 15 minutes before it kills the pane.
Right: The watchdog waits `<timeout>` before it kills the pane.
```

### 52. Write the open question beside the placeholder

Write the open question in the same paragraph as the placeholder. Name the owner of the answer and the file for the answer.

```text
Wrong: The cron runs every `<interval>`.
Right: The cron runs every `<interval>`. OPEN: confirm the interval in
       `.oh/crons/heartbeat.md`. Owner: the harness orchestrator.
```

### 53. Never trade accuracy for brevity

Keep the longer sentence when the shorter sentence loses a fact or admits a second reading. Concision ranks last of the five goals. Delete a word only when the deletion changes no meaning.

```text
Wrong: Reset the branch.
Right: Reset the local `development` branch to `origin/development`.
```
