# Platinum review policy

Platinum review is the final version 1 content-quality pass. It is stricter than golden review.

Golden review means the exported card surface has been manually reviewed and is protected against regression. Platinum review means the card deserves to ship.

## Product rule

A card only becomes platinum when it is accurate, useful, learner-friendly, and governed. If a card is uncommon, awkward, too advanced for the level, misleading, or only present to chase reading coverage, remove or defer it instead of promoting it.

## Word-card platinum rules

Each platinum word card must pass all rules below:

- The word belongs in the word-deck product and in the reviewed level.
- The word is common enough or useful enough for a version 1 learner deck.
- The written form and reading are correct for the chosen vocabulary item.
- The learner-facing meaning is clear, useful, and not a dictionary dump.
- The example sentence is natural, level-appropriate, and demonstrates the target word clearly.
- The reading breakdown, furigana, constituent-kanji breakdown, and JLPT or outside-JLPT labels are correct.
- Higher-level or outside-JLPT kanji are allowed only when the word itself belongs now and the card labels those kanji visibly.
- Audio and pitch accent are present and governed by approved tracked sources.
- The card does not depend on ignored local files, untracked generated content, or silent fallback behavior.

## Outcomes

Every platinum pass decision must use one explicit outcome:

- `platinum`: ships as reviewed.
- `fixed_then_platinum`: source data or examples were improved during review, then the card ships.
- `deferred`: useful later, but not for the current level or version 1 surface.
- `removed`: not useful enough, not learner-friendly, or not appropriate for this product.
- `needs_review`: blocked until a decision or fix is made.

Only `platinum` and `fixed_then_platinum` count as active platinum cards. `deferred` and `removed` entries must not appear in generated exports. `needs_review` always fails platinum.

## Required manifest fields

Active platinum word entries must include:

- `word`
- `status`
- `readingIncludes`
- `meaningIncludes`
- `jlptLevelIncludes`
- `coverageRoleIncludes`
- `breakdownIncludes`
- `exampleIncludes`
- `reviewedAt`
- `reviewer`
- `sourceEvidence`
- `qualityGates`

Required `qualityGates`:

- `belongsInWordDeck`
- `commonOrUseful`
- `learnerFriendly`
- `japaneseVerified`
- `meaningReleaseQuality`
- `exampleReleaseQuality`
- `levelPlacementVerified`
- `labelsVerified`
- `mediaProvenanceVerified`
- `noSilentFallback`

All gates must be `true`. `fixed_then_platinum` entries must also include `fixSummary`.

Deferred and removed entries must include `word`, `readingIncludes`, and `decisionReason`.

## Commands

```bash
npm run deck:words:platinum:n5
npm run deck:words:platinum:n4
```

The N5 command requires every generated N5 word card to have an active platinum entry. N4 is batch-based while the N4 word review is still in progress.

The platinum command intentionally fails for an empty platinum manifest. Do not use golden coverage as a substitute for platinum review.
