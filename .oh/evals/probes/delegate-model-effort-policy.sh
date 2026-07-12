#!/usr/bin/env bash
# tier: A
# source: conversation 2026-07-11 (delegate model inheritance and thinking policy)
# desc: /delegate inherits the session model and passes bounded, complexity-adjusted Agent thinking without routine model routing
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SKILL="$ROOT/.oh/skills/delegate/SKILL.md"

if [[ ! -f "$SKILL" ]]; then
  echo "SKIPPED: delegate skill absent: $SKILL" >&2
  exit 2
fi

problems=()

# Default worker routing inherits the active session model by leaving model unset.
if ! grep -Eiq 'omit(ted)? (the )?(Agent )?`?model`? (argument|parameter).*(inherit|parent|session)|inherit.*(parent|session).*(omit|omitted|unset).*(model|`model`)' "$SKILL"; then
  problems+=("default policy does not inherit the parent/session model through an omitted Agent model argument")
fi

# The real Agent argument is `thinking`, not an invented `effort` argument.
if ! grep -Eiq 'Agent( tool)?[^.]*`thinking` parameter|pass Agent `thinking`|call Agent with `thinking:' "$SKILL"; then
  problems+=("policy does not explicitly use the Agent thinking parameter")
fi
if grep -Eiq '`effort` (argument|parameter)|`effort:|with `effort:|\*\*Effort\*\*' "$SKILL"; then
  problems+=("policy still presents effort as an Agent parameter or task-schema field")
fi

# Keep every complexity mapping independently recognizable.
if ! grep -Eiq 'simple.*mechanical.*`?low`?' "$SKILL"; then
  problems+=("thinking matrix is missing simple/mechanical -> low")
fi
if ! grep -Eiq 'standard.*`?medium`?' "$SKILL"; then
  problems+=("thinking matrix is missing standard -> medium")
fi
if ! grep -Eiq 'complex.*`?high`?' "$SKILL"; then
  problems+=("thinking matrix is missing complex -> high")
fi
if ! grep -Eiq 'architecture.*(debugging|debug).*(substantial uncertainty|uncertainty.*substantial).*`?xhigh`?' "$SKILL"; then
  problems+=("thinking matrix is missing architecture/debugging with substantial uncertainty -> xhigh")
fi
if ! grep -Eiq 'supported levels are.*`off`.*`minimal`.*`low`.*`medium`.*`high`.*`xhigh`' "$SKILL"; then
  problems+=("policy does not list the Agent tool's supported thinking levels")
fi
if ! grep -Eiq 'never (pass|use|set).*`?max`?' "$SKILL"; then
  problems+=("policy does not explicitly forbid max thinking")
fi
if ! grep -Eiq 'nearest supported (thinking )?level' "$SKILL" ||
   ! grep -Eiq 'do not switch models|never a model switch|without changing models' "$SKILL"; then
  problems+=("unsupported thinking does not fall back to the nearest supported level without switching model")
fi
if ! { grep -Eiq 'override.*model|model.*override' "$SKILL" && grep -Eiq 'record (that|the) reason|reason.*(task graph|written|documented)' "$SKILL"; }; then
  problems+=("model overrides do not require a recorded explicit reason")
fi

# Routine named-tier routing is incompatible with inherited-model routing.
for tier in luna terra sol haiku sonnet opus; do
  if grep -Eiq "(^|[^[:alnum:]_-])${tier}([^[:alnum:]_-]|$)" "$SKILL"; then
    problems+=("legacy routine model-routing tier remains: $tier")
  fi
done

# DeepSWE is external evidence about coding performance, not proof of harness
# inheritance or simple-task routing; keep that volatile claim out of this policy.
if grep -Eiq 'DeepSWE|leaderboard' "$SKILL"; then
  problems+=("volatile external benchmark language appears in durable delegate policy")
fi

if (( ${#problems[@]} > 0 )); then
  echo "REGRESSION: /delegate model/thinking policy contract is broken; issues:" >&2
  printf '  - %s\n' "${problems[@]}" >&2
  exit 1
fi

echo "PASS: /delegate inherits the session model and passes bounded, complexity-adjusted Agent thinking" >&2
exit 0
