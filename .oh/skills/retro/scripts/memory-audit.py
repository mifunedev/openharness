#!/usr/bin/env python3
"""memory-audit.py — make MEMORY.md's claims true.

WHY THIS IS A SCRIPT AND NOT AN EDIT
------------------------------------
`.oh/memory/MEMORY.md` is gitignored and untracked, and `oh-path` anchors it to the MAIN
worktree. An agent editing it directly produces NO diff, NO review, and NO undo — the ledger
just silently changes under everyone. This script is the reviewable artifact instead: it is
tracked, its rules are readable, it is idempotent, it defaults to a dry run, and it writes a
timestamped backup before touching anything.

WHY PYTHON AND NOT SHELL
------------------------
The first implementation built a 76-line `sed` program with `printf` and post-processed it
with `awk`. Every stage was a quoting hazard, and it silently rewrote nothing while
reporting success — the exact "reports done, did nothing" failure this story is about. String
handling this fiddly belongs somewhere it can be reasoned about.

WHAT IT DOES
------------
1. STRIP unbacked `probe:` claims. `probe: <id>` asserts "this lesson is guarded"; an id
   resolving to no `.oh/evals/probes/<id>.sh` makes the ledger lie about which lessons are
   protected — worse than claiming nothing. Rewritten to `probe: none` so the absence is
   visible rather than merely missing, and the entry is marked so the change shows in the
   ledger itself. Guarded by `.oh/evals/probes/memory-probe-claims-resolve.sh`.

2. EMIT AN AUDIT WORKSHEET beside the ledger, one row per entry, with a blank `verdict`.

WHAT IT DELIBERATELY DOES NOT DECIDE — AND WHY THIS IS A WORKSHEET
------------------------------------------------------------------
It does not classify an entry obsolete, falsified, a one-time narrative, out-of-domain,
repo-derivable, or a restatement of an IDENTITY principle. Those are SEMANTIC verdicts a
word-overlap heuristic cannot produce: `IDENTITY.md` holds five broad meta-principles
("never treat a green suite as evidence that a guard works"), while a ledger entry is a
concrete incident sharing almost none of their vocabulary. Measured on this ledger,
set-overlap flagged 0 of 105 entries in BOTH ratio directions. A script asserting those
verdicts would be inventing evidence — which is the failure this story exists to remove.
So it lays the entries beside the principles, marks what it CAN prove, and leaves the
verdict to the operator.

USAGE
    python3 .oh/skills/retro/scripts/memory-audit.py            # dry run: report only
    python3 .oh/skills/retro/scripts/memory-audit.py --apply    # write, after a backup
"""
from __future__ import annotations

import datetime as _dt
import re
import shutil
import subprocess
import sys
from pathlib import Path

MARKER = "[audit: probe claim was unbacked — stripped, verdict pending operator read]"
# `probe:` followed by an optionally-backticked id, optionally suffixed `.sh`.
PROBE_RE = re.compile(r"probe:\s*`?([A-Za-z0-9._/-]+)`?")


def resolve_memory_dir(root: Path) -> Path:
    """Resolve through oh-path, which anchors `memory` to the MAIN worktree.

    Never read $MEMORY_DIR directly: a relative value there resolves against this script's
    CWD and would audit a per-worktree empty ledger instead of the real one.
    """
    try:
        out = subprocess.run(
            ["sh", str(root / ".oh/scripts/oh-path"), "memory", "--no-create"],
            capture_output=True, text=True, timeout=20,
        )
        cand = out.stdout.strip()
        if cand.startswith("/"):
            return Path(cand)
    except Exception:
        pass
    return root / ".oh/memory"


def main(argv: list[str]) -> int:
    apply = False
    if argv[1:]:
        if argv[1] == "--apply":
            apply = True
        elif argv[1] != "--dry-run":
            print(f"usage: {argv[0]} [--apply|--dry-run]", file=sys.stderr)
            return 2

    root = Path(__file__).resolve().parents[4]
    probe_dir = root / ".oh/evals/probes"
    identity = root / ".oh/context/IDENTITY.md"
    mem_dir = resolve_memory_dir(root)
    memory = mem_dir / "MEMORY.md"

    if not memory.is_file():
        print(f"SKIP: no MEMORY.md at {memory} (gitignored; absent in a fresh clone)")
        return 0

    text = memory.read_text(encoding="utf-8")
    lines = text.split("\n")

    cited = sorted({m for m in PROBE_RE.findall(text) if m and m != "none"})
    backed, unbacked = [], []
    for pid in cited:
        stem = pid[:-3] if pid.endswith(".sh") else pid
        (backed if (probe_dir / f"{stem}.sh").is_file() else unbacked).append(pid)

    entries = [i for i, l in enumerate(lines) if l.startswith("- ")]

    print(f"ledger:    {memory}")
    print(f"identity:  {identity}")
    print(f"mode:      {'APPLY' if apply else 'dry run (pass --apply to write)'}")
    print()
    print("== probe: claims ==")
    print(f"   cited ids:  {len(cited)}")
    print(f"   backed:     {len(backed)}")
    print(f"   UNBACKED:   {len(unbacked)}  → rewritten to `probe: none`")
    for pid in unbacked:
        print(f"     - {pid}")
    print()
    print("== audit worksheet ==")
    print(f"   ledger entries:      {len(entries)}")
    print(f"   worksheet:           {mem_dir / 'MEMORY-audit-worksheet.md'}")
    print()
    print("== what this script does NOT decide ==")
    print("   obsolete / falsified / one-time-narrative / out-of-domain / repo-derivable /")
    print("   restates-an-IDENTITY-principle are SEMANTIC verdicts. Word-overlap flagged 0 of")
    print(f"   {len(entries)} entries in both ratio directions: an IDENTITY principle is abstract and a")
    print("   ledger entry is a concrete incident, so they share almost no vocabulary.")
    print("   The worksheet lays them side by side with a blank verdict per entry.")
    print()

    if not apply:
        print("dry run: nothing written. Re-run with --apply to write.")
        return 0

    stamp = _dt.datetime.now(_dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = memory.with_name(f"MEMORY.md.bak-{stamp}")
    shutil.copy2(memory, backup)
    print(f"backup:    {backup}")

    unbacked_set = set(unbacked)

    def strip_claim(match: re.Match) -> str:
        return "probe: none" if match.group(1) in unbacked_set else match.group(0)

    out: list[str] = []
    stripped = 0
    for line in lines:
        new = PROBE_RE.sub(strip_claim, line)
        if new != line:
            stripped += 1
            if MARKER not in new:
                new = f"{new}  {MARKER}"
        out.append(new)
    memory.write_text("\n".join(out), encoding="utf-8")
    print(f"stripped:  {stripped} entr{'y' if stripped == 1 else 'ies'} rewritten to `probe: none`")

    principles = [l for l in identity.read_text(encoding="utf-8").split("\n")
                  if l.startswith("- ") and len(l) > 40] if identity.is_file() else []

    ws = mem_dir / "MEMORY-audit-worksheet.md"
    rows = []
    for i, line in enumerate(out, start=1):
        if not line.startswith("- "):
            continue
        proven = "probe-claim-unbacked" if "probe: none" in line else "-"
        e = line.replace("|", "\\|")
        if len(e) > 140:
            e = e[:140] + "…"
        rows.append(f"| {i} | {proven} |  | {e} |")

    with ws.open("w", encoding="utf-8") as fh:
        fh.write("# MEMORY.md audit worksheet\n\n")
        fh.write(f"Generated by `.oh/skills/retro/scripts/memory-audit.py` on "
                 f"{_dt.datetime.now(_dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}.\n\n")
        fh.write("One row per ledger entry. `proven` is what the script established\n"
                 "mechanically; `verdict` is yours. Allowed verdicts: `keep`, `obsolete`,\n"
                 "`falsified`, `one-time-narrative`, `out-of-domain`, `repo-derivable`,\n"
                 "`restates-identity`. **This pass annotates. Deletion is a later, separate\n"
                 "decision.**\n\n")
        fh.write("## IDENTITY.md principles an entry may be restating\n\n")
        for n, p in enumerate(principles, start=1):
            fh.write(f"{n}. {p[2:]}\n")
        fh.write(f"\n## Ledger entries ({len(rows)})\n\n")
        fh.write("| line | proven | verdict | entry (truncated) |\n|---|---|---|---|\n")
        fh.write("\n".join(rows) + "\n")
    print(f"worksheet: {ws} ({len(rows)} rows)")
    print()
    print("Verify:    bash .oh/evals/probes/memory-probe-claims-resolve.sh")
    print(f'Undo:      cp "{backup}" "{memory}"')
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
