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

- kanji levels: [templates/jlpt_level_contract.json](C:\Users\cover\Projects\Active\Fullstack\japanese_kanji_builder\templates\jlpt_level_contract.json)
- word levels: [templates/jlpt_word_level_contract.json](C:\Users\cover\Projects\Active\Fullstack\japanese_kanji_builder\templates\jlpt_word_level_contract.json)

Do not bypass those contracts.

## Word Deck Truth Model

Do not assume the word deck is just “best vocab words.”

The word deck has two required completeness goals:

1. cover JLPT vocabulary for the level
2. cover meaningful kanji readings through real example words

Important implications:

- there is no artificial limit on how many words a kanji may need
- multiple words for one kanji are valid when they cover different important readings
- a word may exist because it is JLPT core, reading coverage support, or both
- phrase-like junk must not enter the normal default deck accidentally
- if a phrase-like entry exists, it must be intentional, tagged, and justified

Use the explicit word coverage contract where possible:

- `coverage.role`
- `coverage.focusKanji`
- `coverage.coversReadings`

Do not rely on heuristics when tracked truth should exist.

## N5 Before N4

Do not widen scope just because higher levels exist.

Current sequencing rule:

- finish N5 properly before expanding N4 word work

That means N4 is blocked until N5 word work is honest and measurable.

For word-deck expansion:

- do not propose “let’s move on to N4” unless N5 gaps are clearly accounted for
- prefer closing N5 reading-coverage and completion gaps first

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
- notes that explain what to remember

Avoid:

- raw internal notation on cards
- brittle heuristics presented as truth
- impressive but confusing content
- whole-compound leakage onto single-kanji breakdowns unless explicitly intended

If a card would confuse a beginner, it is not good enough.

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
```

N5 word checks:

```bash
npm run deck:words:review:n5
npm run deck:words:ready -- --levels=5
npm run deck:words:completion:n5 -- --json
npm run deck:words:reading-audit:n5
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

- [templates/jlpt_level_contract.json](C:\Users\cover\Projects\Active\Fullstack\japanese_kanji_builder\templates\jlpt_level_contract.json)
- [templates/jlpt_word_level_contract.json](C:\Users\cover\Projects\Active\Fullstack\japanese_kanji_builder\templates\jlpt_word_level_contract.json)
- [templates/starter_curated_study_data.json](C:\Users\cover\Projects\Active\Fullstack\japanese_kanji_builder\templates\starter_curated_study_data.json)
- [templates/starter_word_study_data.json](C:\Users\cover\Projects\Active\Fullstack\japanese_kanji_builder\templates\starter_word_study_data.json)
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
