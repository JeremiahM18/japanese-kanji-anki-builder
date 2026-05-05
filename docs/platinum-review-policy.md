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

Platinum evidence is field-bound. A source entry that only says "reviewed" is not enough. The evidence text for an active card must explicitly name the reviewed word or kanji, the exported reading, and the learner-facing values it supports. Automated checks enforce that evidence is tied to the generated card surface; human review still owns the judgment that the cited source and final card are correct.

For active word cards, `japanese-source` evidence must cite a non-generated Japanese-language or dictionary source. Generated output, golden review expectations, tracked starter templates, ignored local data, and local caches are useful internal evidence, but they are not Japanese-source verification by themselves.

Existing platinum sample entries created before the current field-bound evidence gate are not trusted release coverage. Re-review them under the current rules before counting them toward version 1.

## Word-card platinum rules

Each platinum word card must pass all rules below:

- The word belongs in the word-deck product and in the reviewed level.
- The word is common enough or useful enough for a version 1 learner deck.
- The written form and reading are correct for the chosen vocabulary item.
- The learner-facing meaning is clear, useful, and not a dictionary dump.
- The example sentence is natural, level-appropriate, and demonstrates the target word clearly.
- The reading breakdown, furigana, constituent-kanji breakdown, and JLPT or outside-JLPT labels are correct.
- Constituent readings are field-bound to the exported `ReadingBreakdown`. Safe per-kanji ruby may count as a kanji reading; whole-word ruby must be labeled as a word reading and must not be counted as a per-kanji coverage claim.
- Higher-level or outside-JLPT kanji are allowed only when the word itself belongs now and the card labels those kanji visibly.
- Exact word-reading audio is present, governed, and artifact-verified for the written word and exported reading. Human listening QA remains part of the release checklist.
- Pitch accent is present, protected by explicit expectation text, tied to the same governed word-reading source entry, and the rendered card output matches that governed source pattern. Generated pitch guidance may ship only when the rendered card visibly labels it as `Generated pitch (unverified)`; generated pitch is not dictionary-backed pitch evidence.
- Source evidence explicitly names the shipped written form, reading, meaning, example sentence, level/label claims, exact audio identity, pitch-accent source pattern, and whether pitch is dictionary-verified or generated guidance.
- The card does not depend on ignored local files, untracked generated content, or silent fallback behavior.

## Kanji-card platinum rules

Each platinum kanji card must pass all rules below:

- The card belongs in the kanji-deck product and in the reviewed JLPT level.
- The front/`Kanji` field is exactly one target kanji.
- `DisplayWord` equals the target kanji. Compound words never become the learner anchor.
- `PrimaryReading` is the most learner-useful, level-appropriate reading for that individual kanji.
- The chosen `PrimaryReading` has a recorded rationale, especially when the kanji has multiple valid readings.
- The rationale must explain why the selected reading is the right learner-facing reading for this level. Do not choose a reading only because it appears first in a dictionary source or because matching audio already exists.
- `MeaningJP` is the meaning tied to that primary reading.
- `KanjiMeanings` preserves the broader useful meaning list without low-value dictionary noise.
- `StudyWordKanji` is blank for kanji cards.
- Example words and sentences are support only; they must not override the individual-kanji anchor.
- Examples are natural enough for release and demonstrate support usage without changing the card anchor.
- Exact kanji-reading audio is present, governed, and artifact-verified for the target kanji and exported `PrimaryReading`. Human listening QA remains part of the release checklist.
- Stroke-order media is present, governed by approved tracked sources, and visually verified to show the reviewed target kanji. The automated gate can verify source policy and target-bound evidence; it does not prove the stroke sequence is correct without human visual review.
- Source evidence explicitly names the target kanji, exported primary reading, primary meaning, broader meanings, exact audio identity, and stroke-order target/provenance review.
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
- `pitchAccentIncludes`
- `selectionRationale`
- `reviewedAt`
- `reviewer`
- `sourceEvidence`
- `qualityGates`

Word `sourceEvidence` must be an array of structured objects. Each object must include:

- `type`
- `source`
- `detail`

Active word entries must include all evidence types below:

- `generated-surface`: the generated word-card surface was inspected.
- `golden-review`: the golden regression expectation was checked.
- `japanese-source`: written form, reading, meaning, and example were checked against a Japanese-language or dictionary source.
- `level-contract`: the word belongs in the reviewed word-product level.
- `example-review`: the example sentence and reading were checked for release quality.
- `media-audit`: governed media provenance was checked.
- `audio-review`: generated audio artifact identity, provenance, and exact word-reading match were reviewed.
- `pitch-accent-review`: pitch-accent value, source identity, source-to-render match, and any generated-pitch label were reviewed.
- `label-review`: JLPT/outside-JLPT labels, focus kanji, coverage role, and reading coverage were reviewed.
- `manual-review`: a final product judgment was made.

Required `qualityGates`:

- `belongsInWordDeck`
- `commonOrUseful`
- `learnerFriendly`
- `writtenFormVerified`
- `readingVerified`
- `japaneseVerified`
- `meaningReleaseQuality`
- `exampleReleaseQuality`
- `exampleReadingVerified`
- `breakdownVerified`
- `levelPlacementVerified`
- `labelsVerified`
- `audioExactWordReading`
- `audioArtifactVerified`
- `pitchAccentVerified`
- `pitchAccentSourceVerified`
- `mediaProvenanceVerified`
- `noSilentFallback`

All gates must be `true`. `fixed_then_platinum` entries must also include `fixSummary`.

Deferred and removed word entries must include `word`, `readingIncludes`, `reviewedAt`, `reviewer`, and `decisionReason`.

Active platinum kanji entries must include:

- `kanji`
- `status`
- `readingIncludes`
- `meaningIncludes`
- `kanjiMeaningsIncludes`
- `levelIncludes`
- `notesIncludes`
- `exampleIncludes`
- `primaryReadingRationale`
- `reviewedAt`
- `reviewer`
- `sourceEvidence`
- `qualityGates`

Kanji `sourceEvidence` must be an array of structured objects. Each object must include:

- `type`
- `source`
- `detail`

Active kanji entries must include all evidence types below:

- `generated-surface`: the generated card surface was inspected.
- `golden-review`: the golden regression expectation was checked.
- `japanese-source`: reading and meaning were checked against a Japanese-language or dictionary source.
- `media-audit`: governed media provenance was checked.
- `audio-review`: generated audio artifact identity, provenance, and exact target-reading match were reviewed.
- `stroke-order-review`: stroke-order media was visually checked for the reviewed target kanji.
- `manual-review`: a final product judgment was made.

Required kanji `qualityGates`:

- `belongsInKanjiDeck`
- `individualKanjiAnchor`
- `displayWordIsTargetKanji`
- `japaneseVerified`
- `primaryReadingVerified`
- `primaryMeaningVerified`
- `broaderMeaningsVerified`
- `exampleReleaseQuality`
- `exampleSupportOnly`
- `studyWordSuppressed`
- `levelPlacementVerified`
- `audioExactPrimaryReading`
- `audioArtifactVerified`
- `strokeOrderVerified`
- `strokeOrderTargetVerified`
- `noSilentFallback`

All kanji gates must be `true`. `fixed_then_platinum` kanji entries must also include `fixSummary`.

Deferred and removed kanji entries must include `kanji`, `reviewedAt`, `reviewer`, and `decisionReason`.

## Commands

```bash
npm run deck:platinum:batch -- --level=5 --limit=12
npm run deck:platinum:batch -- --level=5 --kanji=父,生,男
npm run deck:words:platinum:batch -- --level=5 --limit=8
npm run deck:words:platinum:batch -- --level=5 --words=今日:きょう,八日:ようか
npm run deck:platinum:n5
npm run deck:platinum:n4
npm run deck:platinum:n3
npm run deck:platinum:n2
npm run deck:platinum:n1
npm run deck:words:platinum:n5
npm run deck:words:platinum:n4
```

`deck:platinum:batch` is a read-only kanji pre-review report. It does not create entries or prove release readiness. Use it before editing a platinum manifest to see generated card fields, hard-rule checks, risk flags, existing platinum status, and the next missing queue.

`deck:words:platinum:batch` is the matching read-only word pre-review report. It does not create entries or prove release readiness. Use it before editing a word platinum manifest to see exact written-reading identity, generated card fields, sentence lines, exact word audio, pitch source/render status, source lookup links, risk flags, existing platinum status, and the next missing queue.

Each platinum command requires every generated card for that level and surface to have an active platinum entry.

The platinum command intentionally fails for an empty platinum manifest. Do not use golden coverage as a substitute for platinum review.
