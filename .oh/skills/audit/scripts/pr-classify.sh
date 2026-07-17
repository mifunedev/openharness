#!/usr/bin/env bash
# Pure, deterministic JSON classifier. No network, mutation, clock, or env defaults.
set -euo pipefail
jq -S -c '
def allowed_fail: ["ACTION_REQUIRED","CANCELLED","ERROR","FAILURE","STARTUP_FAILURE","STALE","TIMED_OUT"];
def allowed_pending: ["EXPECTED","IN_PROGRESS","PENDING","QUEUED","REQUESTED","WAITING"];
def allowed_pass: ["SUCCESS","NEUTRAL","SKIPPED"];
def vals($x): [$x[] | if type!="object" then null else
  ([.conclusion,.state,.status] | map(select(type=="string" and length>0)) | unique) as $v
  | if ($v|length)==1 then $v[0] else null end end];
def ci:
  if (.statusCheckRollup|type)!="array" then {value:"UNKNOWN",complete:false}
  elif (.statusCheckRollup|length)==0 then {value:"NONE",complete:true}
  else vals(.statusCheckRollup) as $v
  | if ($v|any(.==null or .=="")) then {value:"UNKNOWN",complete:false}
    elif ($v|any(. as $x|allowed_fail|index($x))) then {value:"FAIL",complete:true}
    elif ($v|any(. as $x|allowed_pending|index($x))) then {value:"PENDING",complete:true}
    elif ($v|all(. as $x|allowed_pass|index($x))) then {value:"PASS",complete:true}
    else {value:"UNKNOWN",complete:false} end end;
def refs:
  (([.closingIssuesReferences[]?.number]
   + [((.headRefName//"")+" "+(.title//"")+" "+(.body//""))
      | [scan("(?i)(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|issue)?[[:space:]]*#([0-9]+)")[] | tonumber]]) | flatten | unique);
def classify($repo;$obs;$opt;$dupes):
  . as $p | ci as $ci
  | (try (((($obs|fromdateiso8601)-((.updatedAt//"")|fromdateiso8601))/86400)|floor) catch null) as $age
  | ((.number|type)=="number" and .number>0 and (.title|type)=="string" and (.baseRefName|type)=="string"
      and (.updatedAt|type)=="string" and ($age!=null) and (.changedFiles|type)=="number"
      and (.isDraft|type)=="boolean" and (.mergeable=="MERGEABLE" or .mergeable=="CONFLICTING")
      and (.mergeStateStatus|type)=="string"
      and (.reviewDecision==null or .reviewDecision=="" or .reviewDecision=="APPROVED"
        or .reviewDecision=="REVIEW_REQUIRED" or .reviewDecision=="CHANGES_REQUESTED") and $ci.complete) as $shape
  | ($shape and $ci.value=="PASS" and .mergeable=="MERGEABLE" and .mergeStateStatus=="CLEAN") as $clean
  | ($clean and .isDraft) as $rfr
  | ($clean and (.isDraft|not) and ((.reviewDecision==null) or .reviewDecision=="" or .reviewDecision=="APPROVED")) as $rtm
  | (refs) as $refs
  | ([if ($age!=null and $age>$opt.staleDays) then "stale" else empty end,
       if ((.title//"")|test("^FROM .+ TO .+$")|not) then "title-convention" else empty end,
       if .baseRefName!=$opt.expectedBase then "base-convention" else empty end,
       if ((.changedFiles|type)!="number" or .changedFiles>$opt.maxChangedFiles) then "size-convention" else empty end,
       if ($refs|any(. as $r|$dupes|index($r))) then "duplicate-issue-reference" else empty end]) as $flags
  | {schemaVersion:1,repo:$repo,number:.number,isDraft:.isDraft,
     primaryState:(if .isDraft==true then "draft" elif $ci.value=="FAIL" then "ci-failing"
       elif (.mergeable=="CONFLICTING" or (.mergeStateStatus as $ms | ["DIRTY","BEHIND"]|index($ms))) then "conflicting-behind"
       elif .reviewDecision=="CHANGES_REQUESTED" then "changes-requested"
       elif .reviewDecision=="REVIEW_REQUIRED" then "needs-review"
       elif $rtm then "ready" else "pending-other" end),
     draftStatus:(if .isDraft==true then (if $rfr then "promotable" else "wip" end) else null end),
     draftLimbo:(.isDraft==true and ($flags|index("stale")!=null)),ci:$ci.value,
     mergeable:(.mergeable//null),mergeStateStatus:(.mergeStateStatus//null),reviewDecision:(.reviewDecision//null),
     flags:$flags,issueReferences:$refs,ageDays:$age,readyForReview:$rfr,readyToMerge:$rtm,
     promotable:($rfr or $rtm),evidenceComplete:$shape};
if (.schemaVersion!=1 or (.observedAt|type)!="string" or (.repo|type)!="string" or (.mode!="pr" and .mode!="prs")
    or (.options|type)!="object" or (.options.staleDays|type)!="number" or (.options.expectedBase|type)!="string"
    or (.options.maxChangedFiles|type)!="number" or (.prs|type)!="array") then error("invalid classifier envelope") else . end
| . as $in | ($in.prs|map(refs)|flatten|group_by(.)|map(select(length>1)|.[0])) as $dupes
| ($in.prs|map(classify($in.repo;$in.observedAt;$in.options;$dupes))) as $out
| if $in.mode=="pr" then
    if ($out|length)!=1 then {schemaVersion:1,repo:$in.repo,evidenceComplete:false,error:"focused acquisition did not return exactly one PR"}
    else $out[0] end
  else {schemaVersion:1,repo:$in.repo,mode:"prs",truncated:($in.truncated//false),evidenceComplete:(($in.truncated//false|not) and ($out|all(.evidenceComplete))),
    counts:($out|group_by(.primaryState)|map({key:.[0].primaryState,value:length})|from_entries),prs:$out} end
'
