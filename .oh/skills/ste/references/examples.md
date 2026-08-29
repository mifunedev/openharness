# STE Examples

This reference pairs weak source text with a controlled rewrite. Each specimen sits in a fenced block whose info string ends in `before` or `after`.

The `before` blocks act as the committed regression fixture for `scripts/ste-check.sh`. Every `before` block must produce at least one finding. Every `after` block must produce none. The narrative prose here, including each `Why:` line, follows the standard named in `SKILL.md`, so `scripts/ste-check.sh` reports no findings on this file in default mode.

## Contents

- [CLI help text](#cli-help-text)
- [Docker](#docker)
- [Linux administration](#linux-administration)
- [API documentation](#api-documentation)
- [Configuration files](#configuration-files)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Warnings and cautions](#warnings-and-cautions)
- [Prerequisites](#prerequisites)
- [Git](#git)
- [Coding-agent instructions](#coding-agent-instructions)
- [Architecture documents](#architecture-documents)
- [End-user documentation](#end-user-documentation)

## CLI help text

**Domain:** CLI help text
**Rules:** no hedge, named object
```text before
--force    This will basically remove the various files that are no longer needed, so you can just run it if things are broken.
```

```text after
--force    Delete the cache directory without a confirmation prompt.
```

**Why:** The rewrite names the target directory and removes every hedge.

**Domain:** CLI help text
**Rules:** named subject, measured behavior
```text before
-v, --verbose    Turn on verbose output. It is usually helpful when something is failing and you want to see what the tool is doing under the hood.
```

```text after
-v, --verbose    Print one log line for each HTTP request.
```

**Why:** The rewrite states what the flag prints, so the reader needs no guess.

## Docker

**Domain:** Docker
**Rules:** active voice, named actor, explicit condition
```text before
You should probably make sure that Docker socket support is turned on before you go ahead and run the container.
```

```text after
Set `DOCKER_SOCKET=true` before you start the container.
```

**Why:** The rewrite names the exact variable and gives the operator one action.

**Domain:** Docker
**Rules:** one action per step
```text before
1. Stop the container and then remove the volume and start the container again.
```

```text after
1. Stop the `openharness` container.
2. Delete the `openharness_data` volume.
3. Start the `openharness` container.
```

**Why:** One action per step lets the operator stop after any step.

## Linux administration

**Domain:** Linux administration
**Rules:** active voice, named actor, measured schedule
```text before
The log files are rotated by the system periodically, and old archives will be deleted if necessary in order to free up disk space.
```

```text after
`logrotate` compresses `/var/log/harness.log` every night at 00:00 UTC and deletes each archive after 14 days.
```

**Why:** The rewrite names the actor, the schedule, and the retention window.

**Domain:** Linux administration
**Rules:** one action per step, named object
```text before
- Check the disk usage and remove the old logs and restart the service if things look bad.
```

```text after
- Run `df -h /` to read the free space on the root filesystem.
- Delete `/var/log/harness.log.1` when the free space drops below 2 GB.
- Restart `harness.service` after the deletion.
```

**Why:** Three bullets carry three actions, so the reader can stop after any bullet.

## API documentation

**Domain:** API documentation
**Rules:** active voice, named actor, short sentence
```text before
The request payload is validated by the server, and a response object is created which is then returned to the caller once all of the various downstream checks have completed successfully.
```

```text after
The server validates the request payload against `schemas/request.json`. The server returns HTTP 400 when a required field has no value.
```

**Why:** Two active sentences name the actor and the exact failure code.

**Domain:** API documentation
**Rules:** measured value, no vague noun
```text before
Endpoint responses are typically cached for a while, so if necessary you might want to add a header in order to prevent the caching behavior.
```

```text after
The CDN caches each response for 300 seconds. Send `Cache-Control: no-store` to skip the cache.
```

**Why:** The rewrite gives a measured cache window and one header.

## Configuration files

**Domain:** Configuration files
**Rules:** explicit condition, named file
```text before
The application might not start if the configuration is not set up in the proper way.
```

```text after
The application does not start if `config.yaml` has no `database_url` key.
```

**Why:** The rewrite states the exact file and the exact missing key.

**Domain:** Configuration files
**Rules:** active voice, named object, short sentence
```text before
Various settings can be configured as needed, and the defaults are usually fine for most users, so you probably do not need to change anything unless something breaks.
```

```text after
`config.yaml` holds three keys: `database_url`, `port`, and `log_level`. Set `port` to 8080 for a local run.
```

**Why:** The rewrite lists the real keys and one concrete value.

## Deployment

**Domain:** Deployment
**Rules:** approved word, one action per step
```text before
Prior to deployment, the build artifacts are uploaded and the release notes are updated, and then the team is notified via Slack.
```

```text after
1. Upload the build artifacts to the `releases` bucket.
2. Update `CHANGELOG.md` with the release notes.
3. Post the release link in the `#deploys` Slack channel.
```

**Why:** Each numbered step carries one action and one named target.

**Domain:** Deployment
**Rules:** named actor, no hedge, short sentence
```text before
The deploy script will basically handle everything, so just run it and the rest of the stuff is handled automatically by the system whilst you wait.
```

```text after
`deploy.sh` builds the image, pushes the image to GHCR, and restarts the container. The script prints each step to standard output.
```

**Why:** The rewrite lists the three real actions and the visible output.

## Troubleshooting

**Domain:** Troubleshooting
**Rules:** named subject, one action per step
```text before
The `harness-api` service is started by `systemd`. If it doesn't work, try restarting it and check the logs again.
```

```text after
1. Check the status of `harness-api` with `systemctl status harness-api`.
2. Read the last 50 lines of `/var/log/harness-api.log`.
3. Restart `harness-api` with `systemctl restart harness-api`.
```

**Why:** The rewrite names the service and gives one action per step.
**Condition:** Use this rewrite only when the source text names the application near the pronoun. Without that evidence, mark the pronoun and ask the author.

**Domain:** Troubleshooting
**Rules:** named object, measured duration
```text before
Restart it after a while.
```

```text after
Restart <component> after <duration>.
```

**Why:** The rewrite keeps the gap visible instead of inventing a component or a delay.
**Placeholder:** The source states no duration and no component. Ask the author for both values, and never invent a number.

**Domain:** Troubleshooting
**Rules:** approved word, one action per step, short sentence
```text before
Due to the fact that the cache is sometimes corrupted, you should probably clear it and then restart the service in order to get things working again.
```

```text after
1. Delete `~/.cache/harness/`.
2. Restart `harness-api`.
```

**Why:** Two steps replace one long sentence, and each step names its target.

## Warnings and cautions

**Domain:** Warnings and cautions
**Rules:** warning before command, named loss
```text before
Run `oh destroy` to reset the sandbox. Note that this will also remove the volumes and the data in them is deleted permanently, so make sure you have a backup of anything important before you go ahead.
```

```text after
**WARNING:** `oh destroy` deletes the `openharness_postgres` volume and every row in the database. The deletion is permanent.

1. Back up the database with `pg_dump`.
2. Run `oh destroy`.
```

**Why:** The warning precedes the command and names the volume and the rows.

**Domain:** Warnings and cautions
**Rules:** named file, no hedge, measured value
```text before
Note: The token is stored in plain text, so it should probably be protected as appropriate.
```

```text after
**CAUTION:** `.env` holds the API token in plain text.

Set the file mode of `.env` to 600. Never commit `.env` to git.
```

**Why:** The rewrite names the file, the risk, and the exact file mode.

## Prerequisites

**Domain:** Prerequisites
**Rules:** named version, measured floor, short sentence
```text before
Before you begin, make sure that several prerequisites are installed and that the system is configured properly, since otherwise the installer may fail for reasons that are hard to diagnose.
```

```text after
The sandbox needs Docker 24 or later, `make`, and 8 GB of free disk space.
```

**Why:** The rewrite lists each prerequisite with a version and a measured floor.

**Domain:** Prerequisites
**Rules:** one action per step, named object
```text before
- Install the dependencies and then configure the environment as needed.
```

```text after
1. Install the dependencies with `npm ci`.
2. Copy `.env.example` to `.env`.
3. Set `DATABASE_URL` in `.env`.
```

**Why:** Three numbered steps replace one compound instruction.

## Git

**Domain:** Git
**Rules:** active voice, named actor, one action per step
```text before
Changes are committed by the developer and then the branch is pushed, after which a pull request is opened whenever it seems appropriate.
```

```text after
1. Commit the change with `git commit`.
2. Push the branch with `git push -u origin HEAD`.
3. Open a pull request against `development`.
```

**Why:** Each numbered step carries one git command.

**Domain:** Git
**Rules:** named subject, approved word
```text before
It is recommended that you utilize a feature branch prior to merging your work into development.
```

```text after
Create a `feat/<slug>` branch before you merge into `development`.
```

**Why:** The rewrite gives the branch shape and drops the impersonal opener.

## Coding-agent instructions

**Domain:** Coding-agent instructions
**Rules:** approved word, named file, testable instruction
```text before
The agent should leverage the available tools in order to facilitate the completion of the various tasks, and it should ask if something is unclear.
```

```text after
Read `AGENTS.md` before you edit a file. Ask the operator when a requirement has no answer in `AGENTS.md`.
```

**Why:** The rewrite gives the agent two testable instructions with a named file.

## Architecture documents

**Domain:** Architecture documents
**Rules:** active voice, named actor, measured budget
```text before
The pipeline is essentially a robust and seamless design in which events are processed by several workers, and the results are then written to the store for downstream consumers.
```

```text after
Four workers read events from the queue. Each worker writes its result to `results/` within 200 ms.
```

**Why:** The rewrite gives a count, a named actor, and a latency budget.

## End-user documentation

**Domain:** End-user documentation
**Rules:** named control, measured window, no hedge
```text before
Simply click the button and your report will be created, and it will be emailed to you soon.
```

```text after
1. Select **Generate report**.
2. Wait for the report link in your inbox. The link arrives within 10 minutes.
```

**Why:** The rewrite names the control and gives a measured arrival window.
