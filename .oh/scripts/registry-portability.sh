#!/usr/bin/env bash

set -euo pipefail
export LC_ALL=C

readonly PROG=registry-portability


readonly UNIX_ROOTS=" bin boot dev etc home lib media mnt opt proc root run sbin srv sys tmp usr var "
readonly META_PREFIXES=(foo bar baz qux)

readonly RE_OH='\.oh/[A-Za-z0-9._/-]+'
readonly RE_SPAN='`([^`]+)`'
readonly RE_REF='^(references|scripts)/[A-Za-z0-9._-]+\.(md|sh)'
readonly RE_NAME='^[a-z][a-z0-9-]*$'
readonly RE_HASH='^[0-9a-f]{12}$'


usage() {
  cat <<'EOF'
Usage: registry-portability.sh --registry <dir> [--allow <file>] [--strict-exceptions]

  --registry <dir>       checkout of the published registry (required)
  --allow <file>         exceptions source; default <script dir>/registry-portability.md
  --strict-exceptions    make a stale exception entry fail the run

Exit codes: 0 all findings suppressed, 1 a finding survived, 2 untrustworthy run.
EOF
}

fatal() {
  printf '%s: %s\n' "$PROG" "$1" >&2
  exit 2
}

warn() {
  printf '%s: %s\n' "$PROG" "$1" >&2
}

TRIMMED=""
trim() {
  local s=$1
  s=${s#"${s%%[![:space:]]*}"}
  s=${s%"${s##*[![:space:]]}"}
  TRIMMED=$s
}


REGISTRY=""
ALLOW_FILE=""
STRICT=0

while (( $# > 0 )); do
  case $1 in
    --registry)
      if (( $# < 2 )); then fatal "--registry needs a directory"; fi
      REGISTRY=$2
      shift 2
      ;;
    --registry=*)
      REGISTRY=${1#*=}
      shift
      ;;
    --allow)
      if (( $# < 2 )); then fatal "--allow needs a file"; fi
      ALLOW_FILE=$2
      shift 2
      ;;
    --allow=*)
      ALLOW_FILE=${1#*=}
      shift
      ;;
    --strict-exceptions)
      STRICT=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fatal "unknown argument: $1"
      ;;
  esac
done

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
if [[ -z $ALLOW_FILE ]]; then
  ALLOW_FILE="$SCRIPT_DIR/$PROG.md"
fi

if [[ -z $REGISTRY ]]; then fatal "--registry <dir> is required"; fi
while [[ $REGISTRY == */ && ${#REGISTRY} -gt 1 ]]; do REGISTRY=${REGISTRY%/}; done
if [[ ! -d $REGISTRY ]]; then fatal "--registry names no directory: $REGISTRY"; fi

SKILLS_DIR="$REGISTRY/skills"
if [[ ! -d $SKILLS_DIR ]]; then fatal "no skills/ directory under: $REGISTRY"; fi

if [[ ! -f $ALLOW_FILE ]]; then fatal "exceptions file not found: $ALLOW_FILE"; fi

WORKDIR=$(mktemp -d "${TMPDIR:-/tmp}/$PROG.XXXXXX")
trap 'rm -rf "$WORKDIR"' EXIT


declare -a SKILL_DIRS=()
declare -A SKILL_SET=()
for candidate in "$SKILLS_DIR"/*/; do
  if [[ ! -d $candidate ]]; then continue; fi
  candidate=${candidate%/}
  SKILL_DIRS+=("$candidate")
  SKILL_SET[${candidate##*/}]=1
done

if (( ${#SKILL_DIRS[@]} == 0 )); then fatal "no skill folder under: $SKILLS_DIR"; fi


declare -a TARGET_FILE=()
declare -a TARGET_BASE=()
LIST="$WORKDIR/targets"
for skill_dir in "${SKILL_DIRS[@]}"; do
  if ! find "$skill_dir" -type f \( -name '*.md' -o -name '*.sh' \) -print0 > "$LIST"; then
    fatal "cannot list files under: $skill_dir"
  fi
  while IFS= read -r -d '' target; do
    TARGET_FILE+=("$target")
    TARGET_BASE+=("$skill_dir")
  done < "$LIST"
done

if (( ${#TARGET_FILE[@]} == 0 )); then
  fatal "no *.md or *.sh file under any skill folder in: $SKILLS_DIR"
fi


declare -A HASH_DONE=()
declare -A LINE_HASH=()
declare -A FILE_HASHES=()

ensure_hashes() {
  local rel=$1
  if [[ -n ${HASH_DONE[$rel]:-} ]]; then return 0; fi
  HASH_DONE[$rel]=1

  local abs="$REGISTRY/$rel"
  if [[ ! -f $abs ]]; then return 0; fi

  local dir count=0 line name sum short base
  dir=$(mktemp -d "$WORKDIR/lines.XXXXXX")
  while IFS= read -r line || [[ -n $line ]]; do
    count=$((count + 1))
    trim "$line"
    printf -v name '%08d' "$count"
    printf '%s' "$TRIMMED" > "$dir/$name"
  done < "$abs"

  if (( count > 0 )); then
    if ! sha256sum "$dir"/* > "$dir.sums"; then fatal "cannot hash lines of: $rel"; fi
    while read -r sum name; do
      short=${sum:0:12}
      base=${name##*/}
      LINE_HASH["$rel:$((10#$base))"]=$short
      FILE_HASHES["$rel|$short"]=1
    done < "$dir.sums"
  fi
  rm -rf "$dir" "$dir.sums"
}

HASH_RESULT=""
line_hash() {
  local rel=$1 lineno=$2
  ensure_hashes "$rel"
  HASH_RESULT=${LINE_HASH["$rel:$lineno"]:-000000000000}
}


is_skill_folder() {
  [[ -n ${SKILL_SET[$1]:-} ]]
}

is_unix_root() {
  [[ $UNIX_ROOTS == *" $1 "* ]]
}

is_placeholder() {
  local name=$1 prefix
  for prefix in "${META_PREFIXES[@]}"; do
    if [[ $name == "$prefix"* ]]; then return 0; fi
  done
  return 1
}

covered_by_oh_path() {
  local token=$1 seen
  if (( ${#OH_TOKENS[@]} == 0 )); then return 1; fi
  for seen in "${OH_TOKENS[@]}"; do
    if [[ $seen == *"$token"* ]]; then return 0; fi
  done
  return 1
}


declare -a FINDINGS=()
declare -a OH_TOKENS=()

scan_line() {
  local rel=$1 lineno=$2 base=$3 line=$4
  local rest token whole span head name ref

  OH_TOKENS=()

  rest=$line
  while [[ $rest =~ $RE_OH ]]; do
    token=${BASH_REMATCH[0]}
    OH_TOKENS+=("$token")
    FINDINGS+=("$rel"$'\t'"$lineno"$'\t'"OH-PATH"$'\t'"$token")
    rest=${rest#*"$token"}
  done

  rest=$line
  while [[ $rest =~ $RE_SPAN ]]; do
    whole=${BASH_REMATCH[0]}
    span=${BASH_REMATCH[1]}
    rest=${rest#*"$whole"}

    head=${span#"${span%%[![:space:]]*}"}
    token=${head%%[[:space:]]*}
    if [[ ${token:0:1} == "/" ]]; then
      name=${token:1}
      if [[ $name =~ $RE_NAME ]] \
        && ! is_skill_folder "$name" \
        && ! is_unix_root "$name" \
        && ! is_placeholder "$name"; then
        FINDINGS+=("$rel"$'\t'"$lineno"$'\t'"HARNESS-SKILL"$'\t'"/$name")
      fi
    fi

    if [[ $span =~ $RE_REF ]]; then
      ref=${BASH_REMATCH[0]}
      if ! covered_by_oh_path "$ref" && [[ ! -e "$base/$ref" ]]; then
        FINDINGS+=("$rel"$'\t'"$lineno"$'\t'"DANGLING-REF"$'\t'"$ref")
      fi
    fi
  done
}

for index in "${!TARGET_FILE[@]}"; do
  file=${TARGET_FILE[$index]}
  base_dir=${TARGET_BASE[$index]}
  rel_path=${file#"$REGISTRY/"}
  lineno=0
  while IFS= read -r source_line || [[ -n $source_line ]]; do
    lineno=$((lineno + 1))
    scan_line "$rel_path" "$lineno" "$base_dir" "$source_line"
  done < "$file"
done


declare -A EXC_CLASS=()
declare -a EXC_PATHS=()
declare -a EXC_RULES=()
declare -a EXC_HASHES=()
declare -a EXC_CLASSES=()

add_exception() {
  local raw=$1 field class rule path hash reason
  local -a parts=()
  local IFS='|'
  read -r -a parts <<< "$raw"
  if (( ${#parts[@]} != 5 )); then
    warn "ignoring exception entry without five fields: $raw"
    return 0
  fi

  local -a clean=()
  for field in "${parts[@]}"; do
    trim "$field"
    clean+=("$TRIMMED")
  done
  class=${clean[0]}
  rule=${clean[1]}
  path=${clean[2]}
  hash=${clean[3],,}
  reason=${clean[4]}

  if [[ $class != "ALLOW" && $class != "KNOWN" ]]; then
    warn "ignoring exception entry with unknown class: $raw"
    return 0
  fi
  if [[ -z $rule || -z $path || -z $reason ]]; then
    warn "ignoring exception entry with an empty field: $raw"
    return 0
  fi
  if [[ ! $hash =~ $RE_HASH ]]; then
    warn "ignoring exception entry whose hash is not 12 hex characters: $raw"
    return 0
  fi

  local key="$path|$rule|$hash"
  if [[ $class == "ALLOW" || -z ${EXC_CLASS[$key]:-} ]]; then
    EXC_CLASS[$key]=$class
  fi
  EXC_PATHS+=("$path")
  EXC_RULES+=("$rule")
  EXC_HASHES+=("$hash")
  EXC_CLASSES+=("$class")
}

in_block=0
seen_block=0
while IFS= read -r source_line || [[ -n $source_line ]]; do
  trim "$source_line"
  entry=$TRIMMED
  if (( in_block == 1 )); then
    if [[ $entry == '```' ]]; then
      in_block=0
      continue
    fi
    if [[ -z $entry ]]; then continue; fi
    if [[ ${entry:0:1} == "#" ]]; then continue; fi
    add_exception "$entry"
    continue
  fi
  if (( seen_block == 0 )) && [[ $entry == '```allow' ]]; then
    in_block=1
    seen_block=1
  fi
done < "$ALLOW_FILE"

if (( seen_block == 0 )); then
  fatal "no fenced block tagged allow in: $ALLOW_FILE"
fi


printf 'registry: %s\n' "$REGISTRY"
printf 'exceptions: %s\n' "$ALLOW_FILE"
printf 'scanned skill folders: %d\n' "${#SKILL_DIRS[@]}"
printf 'scanned files: %d\n' "${#TARGET_FILE[@]}"
printf '\n'

RAW="$WORKDIR/findings.raw"
SORTED="$WORKDIR/findings.sorted"
if (( ${#FINDINGS[@]} > 0 )); then
  printf '%s\n' "${FINDINGS[@]}" > "$RAW"
else
  : > "$RAW"
fi
if ! sort -t $'\t' -k1,1 -k2,2n -k3,3 -k4,4 -u "$RAW" > "$SORTED"; then
  fatal "cannot sort findings"
fi

total=0
allowed=0
known=0
new=0

while IFS=$'\t' read -r rel_path lineno rule token; do
  if [[ -z $rel_path ]]; then continue; fi
  total=$((total + 1))
  line_hash "$rel_path" "$lineno"
  hash=$HASH_RESULT
  verdict=${EXC_CLASS["$rel_path|$rule|$hash"]:-}
  case $verdict in
    ALLOW)
      allowed=$((allowed + 1))
      continue
      ;;
    KNOWN)
      known=$((known + 1))
      printf '%s:%s: %s %s [KNOWN]\n' "$rel_path" "$lineno" "$rule" "$token"
      ;;
    *)
      new=$((new + 1))
      printf '%s:%s: %s %s\n' "$rel_path" "$lineno" "$rule" "$token"
      ;;
  esac
  printf '    %s | %s | %s | %s | %s\n' \
    "<ALLOW-or-KNOWN>" "$rule" "$rel_path" "$hash" "<reason>"
done < "$SORTED"

stale=0
if (( ${#EXC_PATHS[@]} > 0 )); then
  for index in "${!EXC_PATHS[@]}"; do
    exc_path=${EXC_PATHS[$index]}
    exc_hash=${EXC_HASHES[$index]}
    ensure_hashes "$exc_path"
    if [[ -z ${FILE_HASHES["$exc_path|$exc_hash"]:-} ]]; then
      stale=$((stale + 1))
      printf 'stale exception: %s | %s | %s | %s matches no line in that file\n' \
        "${EXC_CLASSES[$index]}" "${EXC_RULES[$index]}" "$exc_path" "$exc_hash"
    fi
  done
fi

printf '\n'
printf 'findings: %d\n' "$total"
printf 'suppressed by ALLOW: %d\n' "$allowed"
printf 'labelled KNOWN: %d\n' "$known"
printf 'neither: %d\n' "$new"
printf 'stale exceptions: %d\n' "$stale"

status=0
if (( new > 0 || known > 0 )); then
  status=1
fi
if (( stale > 0 && STRICT == 1 )); then
  status=1
fi
exit "$status"
