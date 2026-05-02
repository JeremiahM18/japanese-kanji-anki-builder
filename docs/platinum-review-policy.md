# Platinum review policy

Platinum review is the final version 1 content-quality pass. It is stricter than golden review.

Golden review means the exported card surface has been manually reviewed and is protected against regression. Platinum review means the card deserves to ship.

## Golden vs platinum

| Layer | Purpose | Proves | Does not prove |
| --- | --- | --- | --- |
| Golden | Stabilize current generated card output. | The reviewed export fields match the governed card contract and should not regress silently. | Final release quality, common/useful learner value, source-evidence review, or version 1 approval. |
| Platinum | Lock version 1 content. | The card is accurate, useful, learner-friendly, sourced, governed, and should ship. | A replacement for golden export regression coverage. |

Rules:

- Golden comes first. It protects the generated card surface while product review is still moving.
- Platinum comes last. It can keep, fix, defer, or remove cards.
- A card can be golden-reviewed and still fail platinum.
- A level can be golden-reviewed and still not be release-ready.
- Do not use golden coverage as a substitute for platinum review.
- Do not use platinum review as a substitute for golden regression coverage.
- Empty platinum manifests fail intentionally.

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

## Kanji-card platinum rules

Each platinum kanji card must pass all rules below:

- The card belongs in the kanji-deck product and in the reviewed JLPT level.
- The front/`Kanji` field is exactly one target kanji.
- `DisplayWord` equals the target kanji. Compound words never become the learner anchor.
- `PrimaryReading` is the learner-facing reading for that individual kanji.
- `MeaningJP` is the meaning tied to that primary reading.
- `KanjiMeanings` preserves the broader useful meaning list without low-value dictionary noise.
- `StudyWordKanji` is blank for kanji cards.
- Example words and sentences are support only; they must not override the individual-kanji anchor.
- Exact kanji-reading audio is present for the target kanji and exported `PrimaryReading`.
- Stroke-order media is present and governed by approved tracked sources.
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

Active platinum kanji entries must include:

- `kanji`
- `status`
- `readingIncludes`
- `meaningIncludes`
- `kanjiMeaningsIncludes`
- `levelIncludes`
- `notesIncludes`
- `exampleIncludes`
- `reviewedAt`
- `reviewer`
- `sourceEvidence`
- `qualityGates`

Required kanji `qualityGates`:

- `belongsInKanjiDeck`
- `individualKanjiAnchor`
- `displayWordIsTargetKanji`
- `primaryReadingVerified`
- `primaryMeaningVerified`
- `broaderMeaningsVerified`
- `exampleSupportOnly`
- `studyWordSuppressed`
- `levelPlacementVerified`
- `audioExactPrimaryReading`
- `strokeOrderVerified`
- `noSilentFallback`

All kanji gates must be `true`. `fixed_then_platinum` kanji entries must also include `fixSummary`.

Deferred and removed kanji entries must include `kanji` and `decisionReason`.

## Commands

```bash
npm run deck:platinum:n5
npm run deck:platinum:n4
npm run deck:platinum:n3
npm run deck:platinum:n2
npm run deck:platinum:n1
npm run deck:words:platinum:n5
npm run deck:words:platinum:n4
```

The N5 kanji and N5 word commands require every generated N5 card to have an active platinum entry. Other levels are batch-based until their platinum passes are complete.

The platinum command intentionally fails for an empty platinum manifest. Do not use golden coverage as a substitute for platinum review.
