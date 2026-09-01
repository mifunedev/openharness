# `.oh/logs/`

`CLAUDE.md` is a provider-compatibility symlink to this file. Edit `AGENTS.md`.

Durable operational records written by unattended sessions. Everything here is
gitignored except this file: a log is evidence for the next session and for the
operator, never repository content.

| File | Written by | Holds |
| ---- | ---------- | ----- |
| `escalations.jsonl` | `.oh/skills/escalate/scripts/escalate.sh` | One JSON object per escalation attempt — delivered and not delivered alike |

Use this directory when a session must leave a record that outlives it: an
escalation the operator has not answered, a decision made without consent because
none could be obtained, a finding that would otherwise exist only in a tmux
scrollback.

Do not use it for process logs a service already owns (`/tmp/cron-*.log`,
`/tmp/client-slack-*.log`), for anything a probe or `RESULTS.md` already asserts,
or as a substitute for `evidence.md` in a task folder.

Each record is one line of JSON so the file stays append-only and greppable
without a parser:

```bash
jq -c 'select(.ok == false)' .oh/logs/escalations.jsonl   # what never reached a human
```

Write here only when the record must survive the session. A session that can
still act on a finding acts on it; a session that cannot leaves the record and
says so where a human looks.

Rotation is manual. These files are small and are read by humans after something
went wrong; truncate them when they stop being useful, and never rewrite a record
in place.
