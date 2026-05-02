# CLAUDE.md

This file is the working contract for AI-assisted changes in this repository.

If you are making or reviewing changes here, treat this repo like a maintained product for Japanese learning and JLPT preparation, not a general codebase and not a toy automation project.

## Product North Star

The product goal is learner outcome:

- clearer Japanese reading
- better retention
- better study sequencing
- better learner trust
- stronger JLPT preparation

Do not optimize for technical cleverness over learner clarity.

## Product Surfaces

There are two separate deck packages.

### Kanji deck

One card per kanji.

Primary responsibility:

- teach the kanji itself clearly
- give a stable learner-facing anchor
- support later word learning

### Word deck

One card per study word.

Primary responsibility:

- cover real JLPT vocabulary
- cover meaningful readings of kanji through example words

The word deck is not only a vocab list and not only a kanji-support list. It must do both.

## Non-Negotiable Level Rules

This product is meant to be usable for JLPT preparation.

That means:

- `jlpt` is the canonical level truth for official JLPT decks
- do not invent a second teaching-level system for the main JLPT decks
- do not silently move kanji or words across JLPT levels for convenience
- if a learner-facing word card shows a JLPT label, that label must come from trusted word-level truth

The canonical taxonomy sources are:

- kanji levels: [templates/jlpt_level_contract.json](templates/jlpt_level_contract.json)
- word levels: [templates/jlpt_word_level_contract.json](templates/jlpt_word_level_contract.json)
- release audio source policy: [templates/audio_source_policy.json](templates/audio_source_policy.json)

Do not bypass those contracts.

For audio specifically:

- do not trust the legacy audio pipeline
- the current shipped audio contract is `VOICEVOX Nemo` with pinned release speaker `女声1` (style id `10005`)
- do not silently switch speakers, mix voices, or weaken provenance in a published deck
- use `npm run doctor:voicevox` before assuming a local machine is actually ready to generate governed audio

## Word Deck Truth Model

Do not assume the word deck is just “best vocab words.”

The word deck has two required completeness goals:

1. cover JLPT vocabulary for the level
2. cover meaningful kanji readings through real example words

Important implications:

- there is no artificial limit on how many words a kanji may need
- multiple words for one kanji are valid when they cover different important readings
- a word may exist because it is JLPT core, reading coverage support, or both
- if a reading-support word for the current deck level needs constituent kanji from another JLPT level, keep the word in the current deck and label those constituent kanji with their actual JLPT level on the learner-facing card
- if a constituent kanji is outside the tracked JLPT contract, label that explicitly on the learner-facing card instead of hiding it
- phrase-like junk must not enter the normal default deck accidentally
- if a phrase-like entry exists, it must be intentional, tagged, and justified

Use the explicit word coverage contract where possible:

- `coverage.role`
- `coverage.focusKanji`
- `coverage.coversReadings`

Do not rely on heuristics when tracked truth should exist.

## Word Deck Sequencing

Do not widen scope just because higher levels exist.

Current posture:

- N5 word work is stabilized and should stay frozen except for regressions or explicit editorial decisions
- N4 word work is active and must use the same governance bar as N5
- higher word levels remain future work until their contracts and review gates are ready

For word-deck expansion:

- do not duplicate rows just to move a metric
- prefer useful, common, learner-friendly cards over raw coverage gain
- keep reading coverage, labels, examples, audio, pitch accent, and card-back fields governed from the first batch

## N5 Word Freeze And N4 Rule

N5 word work is now stabilized.

That means:

- keep N5 word frozen except for regressions or explicit editorial decisions
- do not churn N5 word rows just to move a metric once the active triage backlog is cleared
- use `npm run deck:words:ready -- --levels=5 --require-no-active-triage` as the normal N5 word guard before and after changes that could affect the shared word-deck pipeline

When N4 word work starts, use the full N5 contract from day one:

- no duplicate standalone higher-level kanji cards in lower-level word decks
- cross-level or outside-contract constituent kanji must be visibly labeled on the learner-facing card
- reading coverage must be tracked explicitly where intent matters
- sentence orthography gets a soft editorial audit, not a hard simplistic rule
- deck policy violations are hard-fail build issues, not just review notes

Do not treat N4 word work as a looser experimental surface. Start it under the same policy bar that stabilized N5.

## What “Done” Means

Do not treat a passing script as product completion.

For N5 word work, “done” requires:

- trusted JLPT labels
- no accidental phrase cards in default deck
- explicit coverage tracking where needed
- honest completion reporting
- learner-facing cards that explain why the word exists
- audits and docs aligned with the actual shipped output

## Learner-Facing Quality Rules

Prioritize:

- learner-friendly wording
- natural example sentences
- stable readings
- clean breakdowns
- explicit constituent-level labeling when a word uses kanji from outside the deck's JLPT level
- visible stroke-order animation for every kanji shown in word-card breakdowns
- notes that explain what to remember

Avoid:

- raw internal notation on cards
- brittle heuristics presented as truth
- impressive but confusing content
- whole-compound leakage onto single-kanji breakdowns unless explicitly intended
- generic or mixed-source audio provenance in shipped artifacts

If a card would confuse a beginner, it is not good enough.

## Audio Policy

Do not trust the legacy audio pipeline assumptions.

Treat shipped audio as a governed product surface:

- the release audio source policy controls what counts as acceptable shipped audio
- generated audio must preserve provenance into managed manifests instead of collapsing into generic `local-filesystem`
- a release deck should use one canonical audio source, not a mix of engines or ad hoc imports
- managed audio should carry explicit `source`, `voice`, and `locale` metadata
- word-deck audio is a governed shipped surface and must remain exact to the exported word-reading identity

## Required Audits And Validation

When changes touch JLPT taxonomy, starter curation, word contracts, golden sets, or deck membership, run the relevant audits.

Core commands:

```bash
npm test
npm run lint
npm run data:audit:jlpt
npm run data:audit:jlpt:words -- --json
```

N5 kanji checks:

```bash
npm run deck:review:n5
npm run deck:review:coverage
node scripts/reviewPlatinumKanjiLevel.js --level=5
```

Use `npm run deck:platinum:n5` only when the full N5 kanji platinum manifest is expected to be complete.

N5 word checks:

```bash
npm run deck:words:review:n5
node scripts/reviewPlatinumWordLevel.js --level=5
npm run deck:words:ready -- --levels=5
npm run deck:words:completion:n5 -- --json
npm run deck:words:reading-audit:n5
npm run deck:words:triage:n5
```

Use `npm run deck:words:platinum:n5` only when the full N5 word platinum manifest is expected to be complete.

N4 word startup checks:

```bash
npm run deck:words:ready -- --levels=4
npm run deck:words:completion:n4 -- --json
npm run deck:words:reading-audit:n4 -- --json
npm run deck:words:triage:n4 -- --json
```

If you change exported word behavior, do not trust the deck summary alone. Cross-check:

- built TSV output
- completion audit
- reading audit
- docs

If those disagree, treat it as a product bug.

## Data Handling Rules

Know which data is tracked and which is local.

Tracked contract/source files include:

- [templates/jlpt_level_contract.json](templates/jlpt_level_contract.json)
- [templates/jlpt_word_level_contract.json](templates/jlpt_word_level_contract.json)
- [templates/starter_curated_study_data.json](templates/starter_curated_study_data.json)
- [templates/starter_word_study_data.json](templates/starter_word_study_data.json)
- tracked `starter_curated_study_data_*.json` batch files

Ignored local overlays include:

- `data/kanji_jlpt_only.json`
- `data/curated_study_data.json`
- `data/word_study_data.json`

Do not confuse local runtime copies with tracked product truth.

If a local file and tracked contract disagree, fix the contract/runtime alignment intentionally. Do not hand-wave it.

## No-Assumption Rule

Do not assume product intent when it can affect architecture or learner output.

If the repo contract or user direction is unclear and the choice changes:

- deck membership
- JLPT labeling
- word-vs-phrase treatment
- reading coverage semantics
- learner-facing output

then stop guessing and ask.

Good AI behavior in this repo:

- inspect actual output
- inspect audits
- inspect tests
- verify docs

Bad AI behavior in this repo:

- assuming a summary report is correct without checking the built TSV
- assuming a heuristic is acceptable because tests pass
- assuming “more coverage” is the same as better learning

## Review Expectations

When asked to review:

- focus on learner trust first
- focus on content correctness second
- focus on engineering reliability third

Explicitly call out:

- anything misleading on learner-facing cards
- level-truth drift
- stale derived metadata
- mismatches between build output and audit output
- places where docs promise more than the product currently delivers

## Change Hygiene

When you make a meaningful change:

- update docs if workflow or product truth changed
- keep tests aligned
- prefer durable fixes over narrow patches
- do not rewrite good systems for ego

Professional completion means:

- code or data change
- validation
- docs checked
- professional commit
