#!/usr/bin/env bash
# tier: A
# source: ADR #929 — subagents are a bounded execution primitive, not a project-role ontology;
#         supersedes rl-delegation-write-worker (#57), whose read-only-worker lesson is kept here
# desc: /delegate prefers the active session for context-sharing phases, keeps bounded
#       provider-native workers for isolated/parallel work, warns that a read-only worker writes
#       nothing, and names no nonexistent project agent roles
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SKILL="$ROOT/.claude/skills/delegate/SKILL.md"

if [[ ! -f "$SKILL" ]]; then
  echo "SKIPPED: delegate skill absent: $SKILL" >&2
  exit 2
fi

fail() { echo "REGRESSION: $*" >&2; exit 1; }

grep -q '^## When a worker is justified$' "$SKILL" || fail "/delegate has no worker-justification section"

boundary="$(awk '/^## When a worker is justified$/{f=1; next} f && /^## /{exit} f{print}' "$SKILL")"
[[ -n "${boundary//[[:space:]]/}" ]] || fail "the worker-justification section is empty"

missing=()
grep -qiF 'self-contained' <<<"$boundary"        || missing+=("the self-contained test")
grep -qiF 'parallelism' <<<"$boundary"           || missing+=("parallelism as a reason")
grep -qiF 'isolated context' <<<"$boundary"      || missing+=("isolated context as a reason")
grep -qiE 'restricted tools|tool .{0,12}restriction' <<<"$boundary" || missing+=("restricted tools as a reason")
grep -qiF 'verbose disposable output' <<<"$boundary" || missing+=("verbose disposable output as a reason")
grep -qiF 'share substantial context' <<<"$boundary"  || missing+=("the keep-it-in-the-active-session rule")
grep -qiF 'iterative refinement' <<<"$boundary"       || missing+=("the iterative-refinement exception")
(( ${#missing[@]} == 0 )) || fail "worker boundary omits: ${missing[*]}"

worker_block="$(awk '/^Worker configuration:/{f=1} f{print} f && /^[[:space:]]*$/{exit}' "$SKILL")"
keyres_block="$(awk '/^### Key Resources/{f=1; next} f && /^(### |## )/{exit} f{print}' "$SKILL")"
region="$(printf '%s\n%s\n' "$worker_block" "$keyres_block")"
[[ -n "${region//[[:space:]]/}" ]] || fail "neither the Worker configuration block nor Key Resources could be located"

missing=()
grep -qi 'read-only' <<<"$region"        || missing+=("the read-only-worker warning")
grep -qi 'general-purpose' <<<"$region"  || missing+=("the general-purpose recommendation for write workers")
grep -qi 'built-in' <<<"$region"         || missing+=("the provider built-in worker vocabulary")
(( ${#missing[@]} == 0 )) || fail "the worker-configuration region omits: ${missing[*]}"

stale="$(grep -nE '\.(oh|claude|codex|pi)/agents/[A-Za-z0-9_-]+\.md' "$SKILL" || true)"
[[ -z "$stale" ]] || fail "/delegate still cites project-agent definition files: $stale"

roles="$(grep -nEi 'subagent_type: *(implementer|critic|pm|council)|`(implementer|critic|pm|council)`' "$SKILL" || true)"
[[ -z "$roles" ]] || fail "/delegate still names retired project-agent roles as worker types: $roles"

echo "PASS: /delegate bounds workers to isolated/parallel work, keeps the read-only warning, and names no project agents" >&2
