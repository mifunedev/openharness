# Memory

Long-term lessons distilled from session experience. Append-only. See `context/rules/memory.md` for the Memory Improvement Protocol.

## Lessons Learned

<!-- Append entries below. Each entry: bullet with date and one-sentence lesson. Append-only. -->

- (2026-05-09) When `npx <pkg>` exits silently with code 1, scan the npm debug log (default `~/.npm/_logs/`, latest `*-debug-0.log`) for `install { code: 1` — npm/npx swallow install-script stderr. See [`memory/t3-npx-silent-install.md`](t3-npx-silent-install.md) and upstream [pingdotgg/t3code#2621](https://github.com/pingdotgg/t3code/issues/2621).
