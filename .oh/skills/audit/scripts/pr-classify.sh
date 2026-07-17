#!/usr/bin/env bash
# Pure, deterministic JSON classifier. No network, mutation, clock, or env defaults.
set -euo pipefail
jq -S -c '
def fail_values: ["ACTION_REQUIRED","CANCELLED","ERROR","FAILURE","STARTUP_FAILURE","STALE","TIMED_OUT"];
def pending_values: ["EXPECTED","IN_PROGRESS","PENDING","QUEUED","REQUESTED","WAITING"];
def pass_values: ["SUCCESS","NEUTRAL","SKIPPED"];
def known_values: fail_values + pending_values + pass_values + ["COMPLETED"];
def strings($item): [$item.conclusion,$item.state,$item.status | select(type=="string" and length>0)];
def malformed_item:
  type!="object"
  or ([.conclusion,.state,.status] | any(. != null and type!="string"))
  or (strings(.) | any(. as $v | known_values | index($v) | not));
def terminal_item:
  . as $item | strings($item) as $values
  | (($item.state // null) as $state
     | ($item.conclusion // null) as $conclusion
     | ($item.status // null) as $status
     | (($state != null and (pass_values | index($state)) != null)
        or ($conclusion != null and (pass_values | index($conclusion)) != null
            and ($status == null or $status == "COMPLETED")))
       and ($values | any(. as $v | fail_values | index($v)) | not)
       and ($values | any(. as $v | pending_values | index($v)) | not));
def ci:
  if (.statusCheckRollup|type)!="array" then {value:"UNKNOWN",complete:false}
  elif (.statusCheckRollup|length)==0 then {value:"NONE",complete:true}
  else .statusCheckRollup as $items
  | ($items | any(if type=="object" then (strings(.) | any(. as $v | fail_values | index($v))) else false end)) as $failed
  | ($items | any(if type=="object" then (strings(.) | any(. as $v | pending_values | index($v))) else false end)) as $pending
  | ($items | any(malformed_item)) as $malformed
  | if $failed then {value:"FAIL",complete:($malformed|not)}
    elif $pending then {value:"PENDING",complete:($malformed|not)}
    elif $malformed then {value:"UNKNOWN",complete:false}
    elif ($items|all(terminal_item)) then {value:"PASS",complete:true}
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
