# Workflows

This document collects the common local workflows for setup, preview, build, media, word expansion, and output review.

The commands here are operational tools. They do not replace Gold regression, Platinum gates, Obsidian proof, release QA, or manual Anki import review.

## Setup

```bash
npm run doctor
npm run voicevox:status
npm run voicevox:start
npm run doctor:voicevox
npm run voicevox:stop
npm run deck:readiness
```

- `doctor` checks datasets, local files, media folders, managed media, tooling, and next steps.
- `voicevox:status`, `voicevox:start`, and `voicevox:stop` manage the local Docker container named `voicevox-nemo`.
- `voicevox:start:fresh` recreates the container with `-p 127.0.0.1:50021:50121` when an old local container exists without the required local-only port mapping.
- `doctor:voicevox` verifies the local VOICEVOX Nemo engine and pinned release speaker.
- `deck:readiness` reports per-level deck readiness.

## Bootstrap local data

```bash
npm run corpus:init
npm run curated:init
npm run words:init
npm run media:init
```

Useful variants:

```bash
npm run corpus:init -- --merge
npm run curated:init -- --merge
npm run curated:init -- --refresh-starter
npm run words:init -- --merge
npm run words:init -- --refresh-starter
```

Tracked starter files are the baseline. Local ignored files may add workspace overrides. Runtime loaders refresh stale starter-derived local rows in memory before builds and audits.

## Preview and review

```bash
npm run deck:preview -- --level=5 --limit=5
npm run deck:preview -- --kanji=日,本,学
npm run deck:platinum:batch -- --level=5 --limit=12
npm run deck:platinum:batch -- --level=5 --kanji=父,生,男
npm run deck:words:platinum:batch -- --level=5 --limit=8
npm run deck:words:platinum:batch -- --level=5 --words=今日:きょう,八日:ようか
npm run deck:words:level-anchor-audit -- --level=5
npm run deck:review:n5
npm run deck:review:n4
npm run deck:review:n3
npm run deck:review:n2
npm run deck:review:n1
npm run deck:kanji:review-status
npm run deck:review:coverage
npm run deck:review:coverage -- --level=1
node scripts/reviewPlatinumKanjiLevel.js --level=5
npm run deck:words:review:n5
npm run deck:words:review:n4
node scripts/reviewPlatinumWordLevel.js --level=5
```

Tier names: Silver means generated surface, Gold means regression protection, Platinum means current-standard structural gate, and Obsidian means explicit non-mechanical current-version rereview proof.

`deck:platinum:batch` and `deck:words:platinum:batch` are read-only pre-review reports. They do not create entries or prove release readiness. Use `--queue=missing-current-standard` only when intentionally inspecting structural coverage gaps.

The `npm run deck:platinum:n5` and `npm run deck:words:platinum:n5` commands are full-level Platinum gates. They fail unless every generated N5 card has an active current-standard structural entry.

## Build kanji decks

```bash
npm run deck:ready -- --levels=5
npm run deck:apkg -- --levels=5
npm run deck:kanji:additional:ready
```

`deck:ready` validates setup, syncs media, builds exports, packages files under `out/build/package`, rebuilds from a clean package directory, reports managed manifest coverage and exported card media completeness, and fails on export fallbacks by default.

Exported card media completeness is the release-critical signal for kanji deck media readiness. Use `--allow-export-fallbacks` only for an explicitly degraded local artifact.

`deck:kanji:additional:ready` writes separate `additional_unverified_Nx` exports under `out/build/additional_unverified` and packages them as a separate `kanji-additional` APKG. The governed default currently writes empty `0`-row exports because all raw additional source claims are already-core source-claim collisions and are suppressed from the physical surface.

Do not merge additional rows into the core deck or treat additional Gold manifests as source-evidence proof.

## Build word decks

```bash
npm run deck:words:ready -- --levels=5
npm run deck:words:apkg -- --levels=5
```

Run separate `deck:words:ready` invocations serially. The command writes through the shared `out/word-build` package directory, so parallel per-level runs can collide during media cleanup or package creation.

Word readiness reports:

- shipped row governance
- canonical inventory counts
- source-only exclusions
- word-level placement violations
- explicit reading-coverage contract counts
- selected-level reading coverage
- active triage backlog
- deck-policy violations
- sentence orthography review
- reading-breakdown review
- card-back field readiness
- pitch-accent review
- true looping animation coverage
- word-audio review where enabled

Use the N5 guard when changing stabilized N5 word content:

```bash
npm run deck:words:ready -- --levels=5 --require-no-active-triage
```

## Plan word reading coverage

```bash
npm run deck:words:gap-plan:n4 -- --limit=50
npm run deck:words:gap-plan:n4 -- --only=contract-extensions --quality=strong --limit=15 --suggestions=3
npm run deck:words:expansion-support:n4
```

The gap planner ranks open reading coverage work and suggests candidate support words from:

- tracked word entries
- sentence corpus rows
- local kanjiapi word cache evidence

Planner output is advisory. A suggested card still needs canonical contract coverage, explicit reading intent, cross-level labels, media, sentence review, and deck-policy validation before shipping.

`deck:words:expansion-support:n4` adds the governed NLP expansion layer for the same level: tokenization, embeddings, example reranking, sense-fit warnings, reading-gap candidate discovery, review packets, draft proposals, validation, and the NLP governance gate.

## Plan word inventory expansion

```bash
npm run deck:words:expansion-candidates:n5 -- --source=downloads/n5-vocab.tsv --source-label=jlptstudy.net-n5 --limit=50
npm run deck:words:expansion-candidates:n5 -- --source=downloads/n5-vocab.tsv --source-label=jlptstudy.net-n5 --kanji-scope=target-level --require-source-level
npm run deck:words:expansion-candidates:n4 -- --limit=50
npm run deck:words:expansion-support:n4
npm run data:normalize:tanos-jlpt-words -- --level=3
npm run deck:words:expansion-candidates:n3 -- --limit=50
npm run deck:words:expansion-support:n3
npm run data:normalize:tanos-jlpt-words -- --level=2
npm run deck:words:expansion-candidates:n2 -- --limit=50
npm run deck:words:expansion-support:n2
npm run data:normalize:tanos-jlpt-words -- --level=1
npm run deck:words:expansion-candidates:n1 -- --limit=50
npm run deck:words:expansion-support:n1
```

The expansion candidate report is a read-only post-coverage tool. Use it after the current reading-coverage pass to compare an explicit sourced vocabulary list against the governed word contract.

It filters for written-reading rows that contain target-level kanji, are not already governed or excluded, and fit the requested kanji scope:

- `at-or-below` keeps words whose kanji are all target-level or easier.
- `target-level` keeps only words whose kanji are all from the requested level.
- `known-jlpt` allows harder known JLPT kanji but reports them for review.
- `any` allows outside-JLPT kanji but reports them for review.

Expansion candidates are not product truth. Every promoted word still needs source/commonness review, level-fit review, examples, reading breakdowns, kanji labels, audio, pitch policy compliance, Gold regression, Platinum evidence, and readiness validation.

Rows that contain known JLPT kanji but no current-level kanji are reported separately as cross-level routing rows. They are not current-level promotion candidates and do not make the current level active by themselves. Physical movement still requires explicit target-level contract and starter-data review.

Tracked triage decisions live in [../templates/word_inventory_expansion_triage.json](../templates/word_inventory_expansion_triage.json). These decisions are read-only planning metadata, not card approvals.

When `--source` is omitted, the report resolves the single active `candidate-discovery` source for the requested level from [../templates/word_source_manifest.json](../templates/word_source_manifest.json), applies its source label, format, candidate policy, and local integrity pins, then fails instead of trusting a mismatched ignored TSV.

## Check word expansion signals

```bash
npm run deck:words:expansion-signals -- --levels=5,4
```

The expansion signal command answers the narrow "fully expanded under current restraints?" question for each selected word level.

It has three separate signals:

- Reading signal: `exhausted` only when active reading-gap triage is cleared.
- Enhancement signal: `exhausted` only when the configured source vocabulary list has no remaining `keep_candidate` rows and no untriaged review candidates.
- Placement signal: `resolved` only when canonical word rows either have a current-level kanji anchor or carry a tracked learner-fit reason for later all-easier-kanji placement.

The configured source TSVs under `downloads/` are ignored local inputs. The signal source config pins their source URL, source label, SHA-256, byte size, and parsed row count.

The signal is deliberately not a release claim. It does not replace Gold regression, Platinum gates, Obsidian proof, APKG import QA, accessibility checks, media/listening QA, or readiness gates.

## Stroke order

```bash
npm run media:plan -- --level=5 --limit=25
npm run media:import:stroke-order -- --input-dir=/path/to/files
npm run media:import:kanjivg -- --input-dir=/path/to/extracted-kanjivg/kanji --level=4
npm run media:sync -- --level=5 --limit=25
npm run media:report:animations -- --level=5 --limit=25
npm run data:audit:stroke-order -- --json
```

Managed animation priority:

1. `REMOTE_STROKE_ORDER_ANIMATION_BASE_URL`
2. `REMOTE_STROKE_ORDER_ANIMCJK_BASE_URL`
3. local source files

True animation coverage requires real looping animation assets. Static images and SVG fallbacks do not satisfy that rule. Use the configured GitHub animation mirrors or reviewed local source files.

Stroke-order release provenance is governed by [../templates/stroke_order_source_policy.json](../templates/stroke_order_source_policy.json). The automated gate verifies approved source policy, managed manifests, and target-bound review evidence. It does not prove stroke-sequence correctness by itself.

Platinum evidence must state that the stroke-order media was visually checked for the target kanji.

## Audio

```bash
npm run voicevox:status
npm run voicevox:start
npm run doctor:voicevox
npm run media:voicevox -- --list-speakers
npm run media:voicevox -- --level=5 --speaker-id=10005 --concurrency=4
npm run media:voicevox:words -- --level=5 --speaker-id=10005 --concurrency=4
npm run voicevox:stop
npm run media:sync -- --level=5 --limit=100
npm run media:sync:words -- --level=5
npm run media:review:audio -- --level=5 --limit=25
npm run media:review:word-audio -- --level=5 --limit=25
npm run data:audit:audio -- --json
```

Use the npm scripts for governed audio work. The word-audio generator is `scripts/generateWordVoicevoxAudio.js` behind `npm run media:voicevox:words`; `scripts/generateVoicevoxWordAudio.js` is not a repo path.

The release audio policy requires:

- VOICEVOX Nemo
- pinned release speaker `女声1`, style id `10005`
- local engine reachable at `http://127.0.0.1:50021`
- host `127.0.0.1:50021` mapped to Nemo container port `50121`
- explicit source, voice, locale, and category provenance
- one release audio source
- no remote-audio release provider

Generated audio must pass review before release.
