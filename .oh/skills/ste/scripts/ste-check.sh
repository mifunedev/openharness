#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
readonly SKILL_ROOT="${SCRIPT_DIR%/scripts}"

usage() {
  cat >&2 <<'USAGE'
Usage: ste-check.sh [--blocks <tag>] [--max-words <n>] <file> [<file>...]

Options:
  --blocks <tag>     Scan only the lines inside fenced blocks whose info string
                     ends in <tag>. Example: --blocks after
  --max-words <n>    Set the sentence word cap. Default: 25.
  -h, --help         Print this message and exit 0.

Default behaviour scans narrative prose. It skips YAML frontmatter, fenced
blocks, HTML comments, and headings. It strips inline code spans, link targets,
and bare URLs before it applies a detector.

Rule identifiers:
  HEDGE     a hedge or a qualifier that carries no information
  VAGUE     a vague noun, an unresolved pronoun, or an unmeasured condition
  PASSIVE   a passive-voice marker
  LONG      a sentence above the word cap
  COMPOUND  more than one action in one step
  WORD      a non-approved word that the dictionary maps to a replacement
  FENCE     an unclosed fenced block, which left later lines unscanned

A --blocks tag that matches no fenced block exits 2 rather than 0, so a typo in
the tag cannot pass as a clean scan.
USAGE
}

blocks=""
blocks_set=0
max_words=25
files=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --blocks)
      [ "$#" -ge 2 ] || { printf 'ste-check: --blocks needs a value\n' >&2; usage; exit 2; }
      blocks="$2"; blocks_set=1; shift 2 ;;
    --blocks=*) blocks="${1#*=}"; blocks_set=1; shift ;;
    --max-words)
      [ "$#" -ge 2 ] || { printf 'ste-check: --max-words needs a value\n' >&2; usage; exit 2; }
      max_words="$2"; shift 2 ;;
    --max-words=*) max_words="${1#*=}"; shift ;;
    --) shift; while [ "$#" -gt 0 ]; do files+=("$1"); shift; done ;;
    -*) printf 'ste-check: unknown option: %s\n' "$1" >&2; usage; exit 2 ;;
    *) files+=("$1"); shift ;;
  esac
done

case "$max_words" in
  ''|*[!0-9]*) printf 'ste-check: --max-words needs a whole number, got: %s\n' "$max_words" >&2; exit 2 ;;
esac
[ "$max_words" -gt 0 ] || { printf 'ste-check: --max-words must be above 0\n' >&2; exit 2; }

if [ "$blocks_set" -eq 1 ] && [ -z "$blocks" ]; then
  printf 'ste-check: --blocks needs a non-empty tag\n' >&2
  exit 2
fi

if [ "${#files[@]}" -eq 0 ]; then
  printf 'ste-check: give at least one file\n' >&2
  usage
  exit 2
fi

for f in "${files[@]}"; do
  if [ ! -f "$f" ]; then
    printf 'ste-check: not a readable file: %s\n' "$f" >&2
    exit 2
  fi
done

findings=0
blocks_matched=0
for f in "${files[@]}"; do
  has_front=0
  if [ "$(head -n 1 "$f")" = "---" ] \
     && awk 'NR>1 && $0=="---"{found=1; exit} END{exit !found}' "$f"; then
    has_front=1
  fi

  count=$(
    awk -v want_tag="$blocks" -v cap="$max_words" -v has_front="$has_front" '
    function trim(s) { gsub(/^[ \t]+|[ \t]+$/, "", s); return s }

    function report(lineno, rule, msg) {
      printf "%s:%d: %s %s\n", FILENAME, lineno, rule, msg
      hits++
    }

    function has(padded, phrase) {
      return index(padded, " " phrase " ") > 0
    }

    BEGIN {
      hits = 0
      blocks_seen = 0
      SEP = sprintf("%c", 1)
      in_front = 0
      in_fence = 0
      fence_mark = ""
      fence_tag = ""
      fence_open_line = 0

      split("basically|simply|obviously|essentially|probably|perhaps|maybe|somewhat|fairly|quite|really|actually|typically|usually|normally|ideally|arguably|presumably|roughly|more or less|of course|needless to say|kind of|sort of|it seems|i think|we think|should probably|might want to|feel free to", HEDGE, "|")
      split("things|stuff|something|someone|somehow|anything|various|several|a while|soon|appropriate|proper|adequate|sufficient|reasonable|as needed|as appropriate|if necessary|as required|and so on|the system|the tool|the thing", VAGUE, "|")
      split("utilize|utilise|utilizes|utilises|leverage|leverages|facilitate|facilitates|in order to|prior to|subsequent to|at this point in time|due to the fact that|in the event that|a number of|the majority of|commence|terminate|ascertain|endeavor|endeavour|aforementioned|hereinafter|whilst|amongst|going forward|best in class|seamless|robust|powerful|simply put", WORD, "|")
      split("run|start|stop|restart|open|close|add|remove|delete|create|install|uninstall|configure|set|unset|enable|disable|check|verify|confirm|copy|move|rename|edit|update|upgrade|build|deploy|push|pull|commit|merge|rebase|clone|fetch|click|select|choose|enter|type|save|load|read|write|send|wait|apply|revert|reset|mount|unmount|export|import|replace|append|prepend|attach|detach|record|report|print|log", VERB, "|")

      # Auxiliaries that can head a passive clause.
      split("is|are|was|were|be|been|being", AUXLIST, "|")
      for (i in AUXLIST) AUX[AUXLIST[i]] = 1
      # Words that end in "ed" but are not past participles. Without this set
      # the passive regex fires on "is indeed", "is speed", "is seed".
      split("indeed|speed|seed|need|feed|deed|breed|greed|creed|hundred|sacred|naked|wicked|embed|inbred|shred", NVLIST, "|")
      for (i in NVLIST) NONVERB[NVLIST[i]] = 1
      split("done|made|built|sent|set|put|written|given|taken|shown|kept|held|left|found|lost|chosen|driven|known|thrown|drawn|grown|torn|worn|run|read|cut|split|shut|hit|let|spread|cast|rebuilt|overwritten|rewritten", IRLIST, "|")
      for (i in IRLIST) IRREG[IRLIST[i]] = 1

      # "just" needs a guard. The word is a hedge next to a verb, and a
      # legitimate adverb next to a time word.
      hedge_n = 0
      for (i in HEDGE) hedge_n++
      vague_n = 0
      for (i in VAGUE) vague_n++
      word_n = 0
      for (i in WORD) word_n++
      for (i in VERB) VERBSET[VERB[i]] = 1
    }

    # ---- YAML frontmatter -------------------------------------------------
    # has_front is 0 when no closing delimiter exists, so an opening horizontal
    # rule never swallows the document.
    has_front == 1 && NR == 1 && $0 == "---" { in_front = 1; next }
    in_front == 1 && $0 == "---" { in_front = 0; next }
    in_front == 1 { next }

    # ---- fenced blocks ----------------------------------------------------
    {
      stripped = $0
      sub(/^[ \t]+/, "", stripped)
    }
    in_fence == 0 && stripped ~ /^(```+|~~~+)/ {
      match(stripped, /^(`+|~+)/)
      fence_mark = substr(stripped, RSTART, RLENGTH)
      info = trim(substr(stripped, RLENGTH + 1))
      n = split(info, parts, /[ \t]+/)
      fence_tag = (n > 0 ? parts[n] : "")
      in_fence = 1
      fence_open_line = NR
      if (want_tag != "" && fence_tag == want_tag) blocks_seen++
      next
    }
    in_fence == 1 && stripped ~ /^(```+|~~~+)[ \t]*$/ {
      match(stripped, /^(`+|~+)/)
      closer = substr(stripped, RSTART, RLENGTH)
      # A closer must use the same marker character as the opener, not merely
      # the same length. A ``` line inside a ~~~ block does not close it.
      if (substr(closer, 1, 1) == substr(fence_mark, 1, 1) \
          && length(closer) >= length(fence_mark)) {
        in_fence = 0
        fence_tag = ""
        fence_open_line = 0
        next
      }
    }

    {
      # Decide whether this line is in scope.
      if (want_tag != "") {
        if (in_fence == 0 || fence_tag != want_tag) next
      } else {
        if (in_fence == 1) next
      }
    }

    # ---- lines that carry no sentence -------------------------------------
    /^[ \t]*#/ { next }                      # heading
    /^[ \t]*<!--/ { next }                   # HTML comment
    /^[ \t]*\[[^]]+\]:[ \t]/ { next }        # link reference definition
    /^[ \t]*\|?[ \t]*:?-{3,}/ { next }       # table separator row

    {
      line = $0

      # Strip the constructs a prose detector must never read.
      gsub(/`[^`]*`/, " ", line)             # inline code spans
      gsub(/\]\([^)]*\)/, "] ", line)        # link targets
      gsub(/https?:\/\/[^ )>]+/, " ", line)  # bare URLs
      gsub(/(^|[ (])www\.[^ )>]+/, " ", line) # bare hostnames
      gsub(/<!--.*-->/, " ", line)           # inline HTML comments
      gsub(/<[^ >]+>/, " ", line)            # placeholder angle brackets

      probe = tolower(line)
      gsub(/[^a-z0-9]+/, " ", probe)
      padded = " " probe " "

      is_step = ($0 ~ /^[ \t]*([-*+]|[0-9]+[.)])[ \t]+/)

      # ---- HEDGE ----------------------------------------------------------
      for (i = 1; i <= hedge_n; i++) {
        if (has(padded, HEDGE[i])) report(NR, "HEDGE", "remove the hedge \"" HEDGE[i] "\"")
      }
      if (padded ~ / just (run|use|add|set|call|do|open|check|edit|change|delete|remove|restart|start|stop) /) {
        report(NR, "HEDGE", "remove the hedge \"just\"")
      }

      # ---- WORD -----------------------------------------------------------
      for (i = 1; i <= word_n; i++) {
        if (has(padded, WORD[i])) report(NR, "WORD", "replace the non-approved word \"" WORD[i] "\"")
      }

      # ---- VAGUE ----------------------------------------------------------
      for (i = 1; i <= vague_n; i++) {
        if (has(padded, VAGUE[i])) report(NR, "VAGUE", "name the object instead of \"" VAGUE[i] "\"")
      }
      if (padded ~ / (it|this|that|these|those) (is|are|was|were|will|would|should|shall|can|could|must|may|might|does|do|did|has|have|had|gets|get|becomes|become|needs|need) /) {
        report(NR, "VAGUE", "start the sentence with a named subject, not a bare pronoun")
      }
      if (padded ~ / (restart|run|start|stop|delete|remove|check|enable|disable|configure|update|install|verify|open|close|save|read|write) (it|them|this|that) /) {
        report(NR, "VAGUE", "name the object of the verb instead of a pronoun")
      }

      # ---- PASSIVE --------------------------------------------------------
      # Scan word by word so a non-participle such as "indeed" or "speed"
      # after an auxiliary does not read as passive voice.
      np = split(probe, W, " ")
      for (i = 1; i < np; i++) {
        if (!(W[i] in AUX)) continue
        w = W[i + 1]
        if ((w ~ /^[a-z][a-z]+ed$/ && !(w in NONVERB)) || (w in IRREG)) {
          report(NR, "PASSIVE", "rewrite in the active voice with a named actor")
          break
        }
      }

      # ---- LONG -----------------------------------------------------------
      text = line
      gsub(/\|/, " . ", text)
      n = split(text, sentences, /[.!?]+[")]*([ \t]|$)/)
      for (i = 1; i <= n; i++) {
        s = trim(sentences[i])
        if (s == "") continue
        wc = split(s, words_of, /[ \t]+/)
        if (wc > cap) {
          report(NR, "LONG", "split this sentence: " wc " words, cap is " cap)
        }
      }

      # ---- COMPOUND -------------------------------------------------------
      if (has(padded, "and then")) {
        report(NR, "COMPOUND", "split \"and then\" into two numbered steps")
      } else if (is_step) {
        body = $0
        sub(/^[ \t]*([-*+]|[0-9]+[.)])[ \t]+/, "", body)
        body = tolower(body)
        gsub(/`[^`]*`/, " ", body)
        gsub(/,? +(and|then) +/, SEP, body)
        gsub(/; +/, SEP, body)
        m = split(body, clauses, SEP)
        verbs = 0
        for (i = 1; i <= m; i++) {
          c = trim(clauses[i])
          gsub(/^[^a-z]+/, "", c)
          split(c, head, /[^a-z]/)
          if (head[1] != "" && (head[1] in VERBSET)) verbs++
        }
        if (verbs >= 2) {
          report(NR, "COMPOUND", "state one action per step; this step holds " verbs)
        }
      }
    }

    END {
      # An unclosed fence exempts the rest of the file. Report it rather than
      # exiting clean, so a truncated document can never pass silently.
      if (in_fence == 1) {
        report(fence_open_line, "FENCE",
               "unclosed fenced block; lines after this one were not scanned")
      }
      printf "##STE## %d %d\n", hits, blocks_seen
    }
    ' "$f"
  ) || {
    printf 'ste-check: failed to scan %s\n' "$f" >&2
    exit 2
  }
  summary=$(printf '%s\n' "$count" | tail -n 1)
  case "$summary" in
    '##STE## '*) : ;;
    *) printf 'ste-check: internal error scanning %s\n' "$f" >&2; exit 2 ;;
  esac
  file_hits=${summary#'##STE## '}; file_blocks=${file_hits#* }; file_hits=${file_hits%% *}
  printf '%s\n' "$count" | sed '$d' | { grep . || true; }
  findings=$(( findings + file_hits ))
  blocks_matched=$(( blocks_matched + file_blocks ))
done

if [ "$blocks_set" -eq 1 ] && [ "$blocks_matched" -eq 0 ]; then
  printf 'ste-check: no fenced block tagged "%s" in %d file(s); nothing was scanned\n' \
    "$blocks" "${#files[@]}" >&2
  exit 2
fi

if [ "$findings" -gt 0 ]; then
  printf 'ste-check: %d finding(s) in %d file(s). Standard: %s/SKILL.md\n' \
    "$findings" "${#files[@]}" "$SKILL_ROOT" >&2
  exit 1
fi

printf 'ste-check: no findings in %d file(s). Two defects escape every detector: a condition that trails the action it guards (question 4), and a sentence that opens with a pronoun naming no antecedent (question 7). Run the 10-question check in %s/SKILL.md.\n' \
  "${#files[@]}" "$SKILL_ROOT" >&2
exit 0
