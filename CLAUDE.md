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

- N5 word work has strict current word Obsidian v2.5 certification for `588/588` current generated rows. Gold, Sapphire, and current-standard Platinum are complete at `588/588`; no N5 rows remain in the current v2.5 Obsidian backlog. Legacy N5 Obsidian history remains audit-visible, but it is not current v2.5 certification.
- N4 word work has `0/889` current word Obsidian v2.5 certification. The `700` older N4 Obsidian proof targets are legacy history, not current v2.5 certification; the 189 current word v2 Silver additions still need Gold, Sapphire, Platinum, and Obsidian.
- N3 word work has a complete Silver generated surface plus partial Gold (`1081/1099`), current-standard Sapphire structural review in progress (`1038/1099`), and Platinum (`8/1099`); N3 word Obsidian proof is not recorded. N2/N1 word work has Silver generated surfaces only until their Gold, Sapphire, Platinum, and Obsidian lanes are populated

For word-deck expansion:

- do not duplicate rows just to move a metric
- prefer useful, common, learner-friendly cards over raw coverage gain
- keep reading coverage, labels, examples, audio, pitch accent, and card-back fields governed from the first batch

## Gold, Sapphire, Platinum, and Obsidian

Keep the review layers separate.

- Read [docs/review-tier-governance.md](docs/review-tier-governance.md) before making tier claims.
- Gold regression protects generated card output from drift. It checks reviewed learner-facing fields against the current governed contract.
- Gold regression does not mean a card deserves to ship in version 1.
- Sapphire is the current structural gate.
- Native Sapphire commands and manifests own core-kanji and word structural review. Current `platinum` commands and manifests are compatibility names only for legacy/proof-provider inputs or unmigrated additional surfaces.
- Platinum is the current card-surface inspection lane after matching Gold and active current-standard Sapphire.
- Sapphire requires source evidence, explicit quality gates, and a keep/fix/defer/remove decision.
- Obsidian requires explicit non-mechanical current-version rereview proof.
- Deck Ready is mechanical artifact readiness only. It is not Silver, Gold, Sapphire, Platinum, Obsidian, source truth, release readiness, APKG import QA, accessibility QA, mobile QA, or listening QA.
- A card can be Gold-reviewed and still fail Sapphire.
- A level can be Gold-reviewed and still not be release-ready.
- Do not use Gold coverage as a substitute for Sapphire.
- Do not use Sapphire or compatibility Platinum coverage as a substitute for Platinum content certification, Gold regression, or Obsidian proof.
- For Obsidian batch work, follow [docs/obsidian-batch-workflow.md](docs/obsidian-batch-workflow.md) and [docs/word-obsidian-v2.5-workflow.md](docs/word-obsidian-v2.5-workflow.md): run status and batch commands as the work queue, refresh the generated surface, run governed NLP support only as support, perform observable card-by-card Obsidian rereview, fix weak sentences before audio, run structural/reading/media verification, then run the fail-closed certification command only when the selected scope should be complete.

## N5/N4 Word Freeze

Current word Obsidian v2.5 certification covers `588/1477` across current N5/N4 generated rows, with N5 at `588/588` and N4 at `0/889`; older word Obsidian proof is legacy history, not current v2.5 certification. Lower-lane prerequisites are complete for the `588` certified N5 rows; the `700` older N4 proof targets need Obsidian v2.5, and the 189 current N4 word v2 Silver additions still need Gold, Sapphire, Platinum, and Obsidian before any downstream certification claim.

That means:

- keep legacy N5/N4 word proof history audit-visible, but do not treat it as current v2.5 certification or churn rows just to preserve old claims
- do not churn word rows just to move a metric once the active triage backlog is cleared
- use `npm run deck:words:ready -- --levels=5 --require-no-active-triage` as the normal N5 word guard before and after changes that could affect the shared word-deck pipeline
- use `npm run deck:words:ready -- --levels=5,4 --require-no-active-triage` as the normal N4 word guard before and after changes that could affect the shared word-deck pipeline
- readiness alone is not sufficient for frozen N4 word rows; it does not validate Gold protected snippets, current-standard native Sapphire protected snippets, or strict Obsidian certification proof
- when a change can affect generated word-card fields, kanji breakdown text, shared curated meanings, review snapshots, the proof-provider path, or N4 frozen-row certification, run the N4 frozen-row proof bundle serially:
  - `npm run deck:words:review:n4`
  - `npm run deck:words:sapphire:n4`
  - `npm run data:obsidian:proof:reconcile -- --deck-kind=word --levels=5,4`
  - `npm run deck:words:obsidian:certify-status -- --levels=5,4`

N4 word work uses the same contract bar as N5:

- no duplicate standalone higher-level kanji cards in lower-level word decks
- cross-level or outside-contract constituent kanji must be visibly labeled on the learner-facing card
- reading coverage must be tracked explicitly where intent matters
- sentence orthography gets a soft editorial audit, not a hard simplistic rule
- deck policy violations are hard-fail build issues, not just review notes

Do not treat N4 word work as a looser experimental surface.

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
npm run deck:words:sapphire:n5
npm run deck:words:ready -- --levels=5
npm run deck:words:completion:n5 -- --json
npm run deck:words:reading-audit:n5
npm run deck:words:triage:n5
```

Use `npm run deck:words:sapphire:n5` when the full N5 word Sapphire manifest is expected to be complete. Use legacy word Platinum commands only for compatibility/proof-provider checks.

N4 word guard checks:

```bash
npm run deck:words:review:n4
npm run deck:words:sapphire:n4
npm run deck:words:ready -- --levels=5,4 --require-no-active-triage
npm run data:obsidian:proof:reconcile -- --deck-kind=word --levels=5,4
npm run deck:words:obsidian:certify-status -- --levels=5,4
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
- tracked `starter_word_study_data_n*.json` per-level files
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
