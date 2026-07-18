# Local Data Guide

## Purpose

This folder contains workstation-local datasets, editorial overlays, cached media, and media source files used by local builds.

## Scope

This guide covers ignored JLPT data, local curation, managed media, media imports, and bootstrap commands. It does not define tracked product truth, source-governance consensus, release readiness, or generated release artifacts.

## Authority Boundary

Tracked contracts under `templates/` are the repository source of truth. Files under `data/` are local inputs unless a tracked contract explicitly promotes a fact. This guide does not certify generated rows, Sapphire, Platinum, Obsidian, media QA, source truth, or release readiness.

## Source Of Truth

Use these tracked contracts for governed behavior:

- JLPT kanji: [../templates/jlpt_level_contract.json](../templates/jlpt_level_contract.json)
- JLPT words: [../templates/jlpt_word_level_contract.json](../templates/jlpt_word_level_contract.json)
- Kanji components: [../templates/kanji_component_contract.json](../templates/kanji_component_contract.json)
- Kanji readings: [../templates/kanji_reading_reference_contract.json](../templates/kanji_reading_reference_contract.json)
- Kanji card-field sources: [../templates/kanji_card_field_source_contract.json](../templates/kanji_card_field_source_contract.json) and [../templates/kanji_card_field_source_contracts](../templates/kanji_card_field_source_contracts)
- Audio policy: [../templates/audio_source_policy.json](../templates/audio_source_policy.json)
- Stroke-order policy: [../templates/stroke_order_source_policy.json](../templates/stroke_order_source_policy.json)

The ignored `kanji_jlpt_only.json` file is required at runtime but must align with the tracked JLPT contract.

## Inputs And Outputs

Required local input:

- `kanji_jlpt_only.json`

Optional local inputs:

- `KRADFILE` for local fallback component data
- `sentence_corpus.json`
- `curated_study_data.json`
- `word_study_data.json`, keyed by exact `written|reading`

Managed output and acquisition roots:

- `media/`
- `media_sources/stroke-order/images/`
- `media_sources/stroke-order/animations/`
- `media_sources/audio/`

## Setup

Use bootstrap commands before hand-editing local files:

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

Use `--merge` to preserve local editorial work while adding starter content. Use `--refresh-starter` to refresh stale starter-derived rows. Run `npm run data:sync:jlpt` after a local JLPT copy drifts.

## Curation

Curated kanji data pins learner-facing display forms, meanings, notes, preferred words, blocked words, and examples. Curated word data defines exact study identities and keeps the `jlpt` field aligned with the tracked word-level contract.

Runtime loading uses tracked starter data first, then local ignored overrides. Starter improvements should flow into builds without overwriting intentional local edits.

## Media

Use reviewed local files, KanjiVG imports, or the configured animation mirrors. The animation priority is:

1. `REMOTE_STROKE_ORDER_ANIMATION_BASE_URL`
2. `REMOTE_STROKE_ORDER_ANIMCJK_BASE_URL`
3. local imported files

Recommended names are `<kanji>.svg`, `<kanji>-order.gif`, `<kanji>.mp3`, or an equivalent codepoint/reading name accepted by the import scripts. Preserve attribution, license, source id, voice, locale, and category metadata.

Media commands:

```bash
npm run media:report -- --limit=50
npm run media:sync -- --level=5 --limit=25
npm run media:import:stroke-order -- --input-dir=/path/to/files
npm run media:import:kanjivg -- --input-dir=/path/to/extracted-kanjivg/kanji --level=4
npm run media:import:audio -- --input-dir=/path/to/audio --level=5
npm run media:voicevox -- --list-speakers
npm run media:voicevox:words -- --level=5 --speaker-id=10005
npm run media:sync:words -- --level=5
```

VOICEVOX should remain local. Run `npm run doctor:voicevox` before governed audio work. The audio policy expects VOICEVOX Nemo, release speaker `女声1` (style id `10005`), explicit provenance, and no remote release-audio provider.

## Verification

Run the focused checks for changed local data:

```bash
npm run data:verify:jlpt
npm run data:audit:jlpt
npm run data:audit:jlpt:words
npm run data:audit:audio -- --json
npm run data:audit:stroke-order -- --json
```

Use [../docs/verification.md](../docs/verification.md) for deck, word, source, media, and release gates. Local-data checks do not replace review-lane or manual QA evidence.

## Failure Semantics

Bootstrap and audit commands are read-only unless their command explicitly offers a write or merge mode. A failing local-data check is a local input or contract-alignment problem; it is not permission to lower a review standard or shrink a product denominator.

## Update Triggers

Update this guide when local paths, bootstrap commands, tracked contracts, audio or stroke-order policy, media naming, VOICEVOX requirements, or local-data verification commands change.

Keep original attribution and license information with external source assets. Use the top-level [README](../README.md) for product, review, packaging, and release workflows.
