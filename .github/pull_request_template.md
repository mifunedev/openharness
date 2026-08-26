<!--
Title format (literal): FROM <source-branch> TO <target-branch>
Example:                FROM feat/42-slack-thread-replies TO development
-->

Closes #<issue-number>

<!--
Put a closing keyword — Closes, Fixes or Resolves — in this body or in the title,
one per issue. When this PR merges into `development`, the
`close-issues-on-development` workflow closes each referenced issue as completed.
A bare `#42` links the issue but does not close it.
-->

## Summary

<!-- What changed, and why. Rationale and rejected alternatives belong here. -->

## Verification

<!-- The commands you ran and what they proved. -->

## Checklist

- [ ] Base branch is `development`
- [ ] Title is `FROM <source-branch> TO <target-branch>`
- [ ] Closing keyword links every issue this PR completes
- [ ] `CHANGELOG.md` has an `## [Unreleased]` entry, or this is a pure chore
