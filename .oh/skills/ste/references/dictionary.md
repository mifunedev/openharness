# STE Dictionary

Word-choice reference for the `/ste` writing standard. Each row names one word to avoid, one plainer replacement, and a short reason.

## Scope and status

- **Software documentation only**. Every row targets README files, runbooks, command help, API reference pages, and pull-request text.
- **Not the ASD-STE100 controlled dictionary**. No row here comes from that copyrighted word list. No row copies, filters, or approximates an entry of the published standard.
- **Authored from software-documentation practice**. Every row starts from words that appear in real repository prose, never from a published word list.
- **No certification claim**. The `/ste` skill claims no ASD-STE100 certification and no complete compliance with the published standard. For the authoritative standard, see https://www.asd-ste100.org/

The published standard lists about one thousand words in each column of its dictionary. This map stays much smaller on purpose. The rows below form a curated software-scoped subset, with no attempt at that scale.

## Contents

- [Verbs](#verbs)
- [Hedges and qualifiers](#hedges-and-qualifiers)
- [Vague nouns and quantities](#vague-nouns-and-quantities)
- [Wordy phrases](#wordy-phrases)
- [Marketing and filler](#marketing-and-filler)
- [Time and frequency](#time-and-frequency)
- [Software-specific terms](#software-specific-terms)
- [Words with more than one meaning](#words-with-more-than-one-meaning)
- [How to use this map](#how-to-use-this-map)

## Verbs

Long verbs with one plain replacement.

| Do not use | Use | Note |
|---|---|---|
| `utilize` | `use` | Shorter, one meaning. |
| `utilise` | `use` | British spelling of the same long verb. |
| `leverage` | `use` | Keep the noun for finance text. |
| `facilitate` | `help` | Plain verb, same meaning. |
| `commence` | `start` | Plain verb. |
| `terminate` | `stop` | Or `end` for a time span. |
| `ascertain` | `find` | Plain verb. |
| `endeavor` | `try` | Plain verb. |
| `initiate` | `start` | Plain verb. |
| `finalize` | `finish` | Plain verb. |
| `obtain` | `get` | Shorter. |
| `possess` | `have` | Shorter. |
| `require` | `need` | Shorter. |
| `demonstrate` | `show` | Shorter. |
| `indicate` | `show` | Shorter. |
| `modify` | `change` | Shorter. |
| `transmit` | `send` | Shorter. |
| `locate` | `find` | Shorter. |
| `generate` | `create` | One verb per action. |
| `eliminate` | `remove` | Shorter. |
| `perform` | `do` | Drop the empty helper verb. |
| `execute` | `run` | Keep `execute` for a process call. |
| `purge` | `delete` | One verb per action. |
| `abort` | `cancel` | Plain verb. |

## Hedges and qualifiers

Words that soften a claim without adding a fact.

| Do not use | Use | Note |
|---|---|---|
| `simply` | `delete` | Adds no information. |
| `basically` | `delete` | Adds no information. |
| `just` | `delete` | Hides the real cost of a step. |
| `obviously` | `delete` | The reader lacks the writer context. |
| `essentially` | `delete` | State the exact behavior. |
| `generally` | `delete` | Or name the exception. |
| `actually` | `delete` | Adds no information. |
| `really` | `delete` | Adds no information. |
| `quite` | `delete` | Or give the number. |
| `fairly` | `delete` | Or give the number. |
| `somewhat` | `delete` | Or give the number. |
| `a bit` | `delete` | Or give the measured amount. |
| `kind of` | `delete` | Or name the exact class. |
| `sort of` | `delete` | Or name the exact class. |
| `probably` | `delete` | Or state the deciding condition. |
| `perhaps` | `delete` | Or state the deciding condition. |
| `maybe` | `delete` | Or state the deciding condition. |
| `arguably` | `delete` | Or cite the evidence. |
| `presumably` | `delete` | Or cite the evidence. |
| `roughly` | `delete` | Give the number with a tolerance. |
| `of course` | `delete` | The reader lacks the writer context. |
| `needless to say` | `delete` | Drop the whole sentence. |
| `typically` | `delete` | Or give the frequency. |
| `usually` | `delete` | Or give the frequency. |
| `normally` | `delete` | Or name the standard case. |
| `ideally` | `delete` | State the requirement or drop the line. |
| `should probably` | `must` | Pick a requirement or advice. |
| `might want to` | `we recommend` | Pick a requirement or advice. |
| `feel free to` | `delete` | State the option as a fact. |

## Vague nouns and quantities

Nouns and amounts that name no object and no number.

| Do not use | Use | Note |
|---|---|---|
| `things` | `files`, `flags`, `records` | Name the class of object. |
| `stuff` | `files`, `packages` | Name the class of object. |
| `something` | `the exact object` | Name the object. |
| `someone` | `the on-call engineer` | Name the role. |
| `anything` | `any file`, `any flag` | Name the class of object. |
| `various` | `three` | Give the count. |
| `several` | `four` | Give the count. |
| `a number of` | `six` | Give the count. |
| `a large number of` | `1,200` | Give the count. |
| `a small number of` | `three` | Give the count. |
| `the majority of` | `most` | Or give the percentage. |
| `the vast majority` | `92%` | Give the measured share. |
| `appropriate` | `matching`, `listed` | Name the rule for the choice. |
| `proper` | `documented` | Name the rule for the choice. |
| `adequate` | `enough for 200 users` | Give the measure. |
| `sufficient` | `enough for 200 users` | Give the measure. |
| `as needed` | `on every failed run` | Name the trigger. |
| `if necessary` | `if the port answers` | Name the condition. |
| `and so on` | `list every item` | Truncated lists hide requirements. |
| `etc.` | `list every item` | Truncated lists hide requirements. |
| `the system` | `the scheduler` | Name the component. |
| `the tool` | `the checker` | Name the program. |

## Wordy phrases

Phrases that spend many words on one idea.

| Do not use | Use | Note |
|---|---|---|
| `in order to` | `to` | Three words for one. |
| `for the purpose of` | `to` | Four words for one. |
| `prior to` | `before` | Plain preposition. |
| `subsequent to` | `after` | Plain preposition. |
| `at this point in time` | `now` | Five words for one. |
| `due to the fact that` | `because` | Five words for one. |
| `in the event that` | `if` | Four words for one. |
| `in the process of` | `during` | Plain preposition. |
| `until such time as` | `until` | Four words for one. |
| `in spite of the fact that` | `although` | Six words for one. |
| `with the exception of` | `except` | Four words for one. |
| `in the absence of` | `without` | Four words for one. |
| `by means of` | `by` | Three words for one. |
| `in conjunction with` | `with` | Three words for one. |
| `has the ability to` | `can` | Four words for one. |
| `is able to` | `can` | Three words for one. |
| `is capable of` | `can` | Three words for one. |
| `provides support for` | `supports` | One verb, not three words. |
| `performs a check on` | `checks` | One verb. |
| `makes use of` | `uses` | One verb. |
| `gives consideration to` | `considers` | One verb. |
| `takes into consideration` | `considers` | One verb. |
| `in terms of` | `for`, `about` | Pick the exact relation. |
| `with regard to` | `about` | Three words for one. |
| `with respect to` | `about` | Three words for one. |
| `as far as X is concerned` | `for X` | Five extra words. |
| `aforementioned` | `the same file` | Name the object again. |
| `hereinafter` | `from here on` | Legal register, not documentation. |
| `whilst` | `during`, `although` | Pick the time or the contrast. |
| `amongst` | `among` | Modern spelling. |

## Marketing and filler

Claims and politeness that carry no measurement.

| Do not use | Use | Note |
|---|---|---|
| `best in class` | `fastest of the four` | Name the comparison set. |
| `world-class` | `delete` | Give a measured claim. |
| `industry-leading` | `delete` | Give a measured claim. |
| `cutting-edge` | `delete` | Give the release date. |
| `seamless` | `no manual step` | Name the removed step. |
| `robust` | `retries three times` | State the exact behavior. |
| `powerful` | `reads 12 formats` | State the exact behavior. |
| `blazing fast` | `40ms median` | Give the measured latency. |
| `rock solid` | `no crash in 90 days` | Give the measured record. |
| `enterprise-grade` | `delete` | Name the exact feature. |
| `comprehensive` | `covers all 14 commands` | Give the count. |
| `out of the box` | `by default` | Name the default. |
| `please` | `delete` | Commands need no politeness. |
| `note that` | `delete` | Start with the fact. |
| `it is recommended that` | `we recommend` | Name the recommender. |
| `you may want to` | `we recommend` | Pick advice or a requirement. |
| `make sure` | `confirm` | One verb. |
| `be sure to` | `delete` | Write the plain imperative. |
| `keep in mind` | `delete` | Write the fact as a sentence. |
| `simply put` | `delete` | Write the short form once. |

## Time and frequency

Time words that name no date, no duration, and no rate.

| Do not use | Use | Note |
|---|---|---|
| `going forward` | `from version 2.0` | Name the start point. |
| `currently` | `since 2026-01` | Give the date or delete. |
| `soon` | `by 2026-09-01` | Give the date. |
| `shortly` | `within 5 minutes` | Give the duration. |
| `a while` | `20 minutes` | Give the duration. |
| `eventually` | `after the retry limit` | Name the condition. |
| `in the near future` | `in the 2026-09 release` | Give the release. |
| `at the present time` | `now` | Four words for one. |
| `on a regular basis` | `every day at 03:00 UTC` | Give the schedule. |
| `periodically` | `every 5 minutes` | Give the interval. |
| `from time to time` | `each Monday` | Give the schedule. |
| `in a timely manner` | `within 10 minutes` | Give the deadline. |
| `frequently` | `three times per hour` | Give the rate. |
| `rarely` | `under once per month` | Give the rate. |
| `in most cases` | `in 9 of 10 runs` | Give the measured share. |
| `more often than not` | `in 6 of 10 runs` | Give the measured share. |

## Software-specific terms

Jargon and short forms from repository prose. A short form stays fine inside a code span. Prose needs the full word.

| Do not use | Use | Note |
|---|---|---|
| `spin up a container` | `start the container` | Plain verb for a runtime action. |
| `spin up` | `start` | Plain verb. |
| `stand up` | `create` | Plain verb. |
| `kick off` | `start` | Plain verb. |
| `fire off` | `send` | Plain verb. |
| `tear down` | `delete` | Plain verb. |
| `bring up` | `start` | Plain verb. |
| `bring down` | `stop` | Plain verb. |
| `nuke the volume` | `delete the volume` | Name the destructive action. |
| `blow away` | `delete` | Name the destructive action. |
| `bounce the service` | `restart the service` | Plain verb. |
| `hit the endpoint` | `call the endpoint` | Plain verb. |
| `grab` | `copy` | Plain verb. |
| `drop in` | `add` | Plain verb. |
| `wire up` | `connect` | Plain verb. |
| `roll out` | `release` | Plain verb. |
| `roll back` | `revert` | Plain verb. |
| `reach out` | `ask` | Name the receiver. |
| `dig into` | `read` | Name the file. |
| `take a look at` | `read` | Name the file. |
| `the box` | `the host` | Name the machine. |
| `the repo` | `the repository` | Spell out in formal documentation. |
| `k8s` | `Kubernetes` | Spell out in prose; keep `k8s` in a label. |
| `env var` | `environment variable` | Spell out in prose. |
| `config` | `configuration` | Spell out in prose; keep `config` in commands. |
| `auth` | `authentication` | Spell out in prose; `authorization` differs. |
| `prod` | `production` | Spell out in prose; keep `prod` in a hostname. |
| `db` | `database` | Spell out in prose; keep `db` in commands. |
| `deps` | `dependencies` | Spell out in prose; keep `deps` in a path. |
| `whitelist` | `allowlist` | Plain noun, no color metaphor. |
| `blacklist` | `denylist` | Plain noun, no color metaphor. |
| `sanity check` | `verify` | Plain verb, no ableist idiom. |
| `flaky` | `intermittent` | Give the failure rate. |

## Words with more than one meaning

Every row below names a word that carries more than one meaning in software text. Pick one meaning for a document. Keep that meaning in every sentence.

| Do not use | Use | Note |
|---|---|---|
| `once` | `after`, `one time` | Time order vs. a count. |
| `since` | `after`, `because` | Time order vs. cause. |
| `as` | `because`, `during` | Cause, time, and role collide. |
| `while` | `during`, `although` | Time span vs. contrast. |
| `may` | `can`, `we permit` | Permission vs. possibility. |
| `should` | `must`, `we recommend` | Requirement vs. advice. |
| `follow` | `come after`, `obey` | Order vs. compliance. |
| `run` | `start`, `one execution` | Verb vs. noun. |
| `key` | `the map key`, `the secret key` | Lookup name vs. secret. |
| `service` | `the process`, `the Compose service` | Running process vs. Compose entry. |
| `image` | `the container image`, `the picture` | Two unrelated objects. |
| `container` | `the running container`, `the layout box` | Runtime instance vs. page element. |
| `host` | `the machine`, `the hostname` | Machine, name, and verb collide. |
| `client` | `the client program`, `the customer` | Program vs. person. |
| `build` | `compile`, `the artifact` | Action vs. artifact. |
| `release` | `publish`, `the version` | Action vs. artifact. |
| `deploy` | `install`, `the deployment` | Action vs. artifact. |
| `check` | `verify`, `inspect` | Confirm vs. inspect vs. mark. |
| `test` | `the test file`, `try` | Automated file vs. manual trial. |
| `master` | `main`, `the primary node` | Branch name vs. replication role. |
| `log` | `the log file`, `record` | Noun vs. verb. |
| `state` | `the saved data`, `say` | Data vs. verb. |
| `mount` | `attach the volume`, `the mount point` | Action vs. location. |
| `load` | `read into memory`, `the request rate` | Action vs. measure. |

## How to use this map

Read the left column as a ban list for prose. Read the middle column as the replacement. The right column carries the reason.

A `delete` in the middle column means one action. Remove the word from the sentence.

Three rules hold everywhere:

- A banned word inside a code span stays fine. `config` in a command line names a real flag.
- A banned word in prose needs the replacement from the middle column.
- A row with two replacements needs a choice. Pick one meaning per document.

The checker at `scripts/ste-check.sh` enforces a subset of the rows here. The checker strips code spans before a detector runs, so this file names every banned word inside backticks. The full standard lives in `SKILL.md`.
