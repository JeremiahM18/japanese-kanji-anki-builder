# Platinum Review Policy

Platinum is the current structural and card-quality gate. It is stricter than Gold regression and separate from Obsidian certification.

Gold regression means the exported card surface is protected against drift. Platinum means the live generated card passes current field-bound evidence and quality requirements. Obsidian means explicit non-mechanical current-version rereview proof exists for the live card.

## Review Layers

| Layer | Purpose | Proves | Does not prove |
| --- | --- | --- | --- |
| Gold | Stabilize current generated card output. | The reviewed export fields match the governed card contract and should not regress silently. | Final release quality, source-truth evidence, Obsidian proof, or version 1 approval. |
| Platinum | Gate current structural and card-quality requirements. | The card is accurate, useful, learner-friendly, sourced, governed, and structurally current. | A replacement for Gold regression or Obsidian proof. |
| Obsidian | Certify substantive current-version rereview. | Explicit non-mechanical rereview proof exists for the live card. | A later fluent/native audit unless that provenance is separately recorded. |

Rules:

- Gold comes first. It protects the generated card surface while product review is still moving.
- Platinum can keep, fix, defer, or remove cards.
- Obsidian is recorded only after actual current-version rereview proof exists.
- A card can be Gold-reviewed and still fail Platinum.
- A level can be Gold-reviewed and still not be release-ready.
- Do not use Gold coverage as a substitute for Platinum.
- Do not use Platinum coverage as a substitute for Gold regression or Obsidian proof.
- Empty Platinum manifests fail intentionally.

## Product rule

A card only becomes Platinum when it is accurate, useful, learner-friendly, and governed. If a card is uncommon, awkward, too advanced for the level, misleading, or only present to chase reading coverage, remove or defer it instead of promoting it.

Platinum evidence is field-bound. A source entry that only says "reviewed" is not enough. The evidence text for an active card must explicitly name the reviewed word or kanji, the exported reading, and the learner-facing values it supports. Automated checks enforce that evidence is tied to the generated card surface; human review still owns the judgment that the cited source and final card are correct.

If a real review attempt cannot verify a non-core or externally unavailable facet, do not silently block forever and do not mark it as verified. Ship only when the card remains accurate and learner-safe, the unresolved facet is visibly labeled or recorded as a known limitation, and the platinum evidence explains the review attempt and limitation. Generated pitch accent guidance is the model precedent: it may ship only with a visible `Generated pitch (unverified)` label and governed provenance, not as dictionary-backed proof. If the unverifiable item is core to the card's written form, reading, meaning, example correctness, or product fit, defer or remove the card instead of promoting it.

For kanji Platinum, record any allowed non-core limitation in `verificationLimitations` instead of burying it in prose. Each limitation must name the exact facet, use an explicit visible label such as `... unverified`, describe the review attempt, appear in the exported `Notes` surface, and be mentioned in `manual-review` evidence. Core truth fields such as the target kanji, `DisplayWord`, `PrimaryReading`, `MeaningJP`, `KanjiMeanings`, example correctness, and product fit cannot use this escape hatch; unresolved uncertainty there still blocks Platinum.

For word Platinum, record any allowed non-core limitation in `verificationLimitations` instead of burying it in prose. Each limitation must name the exact facet, use an explicit visible label such as `... unverified` or `... limited verification`, describe the review attempt, appear in the exported `Notes` surface, and be mentioned in `manual-review` evidence. Core truth fields such as written form, reading, meaning, example correctness, and product fit cannot use this escape hatch; unresolved uncertainty there still blocks Platinum.

For active word cards, `japanese-source` evidence must cite a source registered in `templates/platinum_card_source_manifest.json` for `word-field-verification`. Generated output, Gold regression expectations, tracked starter templates, ignored local data, source-claim lists, and local caches are useful internal evidence, but they are not Japanese-source verification by themselves. Kanji-reference sources may support `single-kanji-word-field-verification` only for one-kanji word cards.

For active word cards, the reviewed deck level must be governed by the written word and learner fit. A card is anchored by kanji from its own deck level; other constituent kanji are support kanji and must be visibly labeled. If the word has no current-level anchor, all-easier-kanji words may ship later only with an explicit learner-fit rationale, and words that depend only on harder support kanji must move, defer, or be removed.

For active kanji cards, `japanese-source` evidence must cite a source registered in `templates/platinum_card_source_manifest.json` for `kanji-field-verification`. Generated output, Gold regression expectations, tracked starter templates, source-governance manifests, source-claim lists, ignored local data, and local caches are useful internal evidence, but they are not Japanese-source verification by themselves. The same source may support both kanji and word product reviews when it directly verifies each card's own fields; the requirement is accuracy and field binding, not source uniqueness across products. This card-field source check is not a JLPT placement proof; placement confidence remains owned by the source-governance layer. Platinum may read JLPT kanji source-governance origin ids only to reject circular field verification against the same source family.

Current word Platinum coverage uses the versioned standard `word-platinum-v3-evidence-lanes`. Active word entries count toward current-standard Platinum coverage only when they include `reviewStandard`, `revalidatedAt`, `revalidationSummary`, `notesIncludes`, `sourceEvidence`, `internalChecks`, and `reviewEvidence`. Word `sourceEvidence` is reserved for governed external Japanese-source truth evidence and must not contain generated-output checks, Gold regression, media checks, or manual judgment. `internalChecks` carries generated-surface, golden-regression, level-contract, media, audio, pitch-accent, and label checks. `reviewEvidence` carries example review, manual product judgment, and current-standard whole-card revalidation. That current-standard review evidence must explicitly bind the generated surface, Japanese-source field check, example sentence, notes/support surface, reading breakdown, level/label surface, exact audio identity, pitch-accent source/render state, media provenance, and verification limitations to the exact written-reading card. It must also record the example sentence judgment: natural, useful, learner-friendly, level-appropriate, and release-quality. Existing active word Platinum entries created before this standard are legacy/unversioned: keep them for historical context, but do not count them as current version 1 release coverage until they are revalidated.

Current kanji Platinum uses the versioned standard `kanji-platinum-v3-evidence-lanes`. Active kanji entries count as Platinum only when they include `reviewStandard`, `revalidatedAt`, `revalidationSummary`, `sourceEvidence`, `internalChecks`, and `reviewEvidence`. Kanji `sourceEvidence` is reserved for governed external Japanese-source card-field truth and must not contain generated-output checks, Gold regression, media checks, or manual judgment. `internalChecks` carries generated-surface, golden-regression, media, audio, and stroke-order checks. `reviewEvidence` carries manual product judgment and current-standard whole-card revalidation. That current-standard review evidence must explicitly bind the generated surface, Japanese-source field check, example sentence, notes/support surface, audio, stroke-order media, and verification limitations to the exact card. It must also record the example sentence judgment: natural, useful, learner-friendly, level-appropriate, release-quality, and support-only. Legacy or unversioned kanji review history must be recorded as `needs_revalidation`; it is non-certifying backlog/history and must not use active Platinum statuses until the card is revalidated under the current standard.

## Word-Card Platinum Rules

Each Platinum word card must pass all rules below:

- The word belongs in the word-deck product and in the reviewed level.
- The written word has a current-level kanji anchor, or an explicit learner-fit rationale explains later placement for an all-easier-kanji word.
- Later/harder placement is justified by learner fit, not by convenience or coverage chasing.
- The word is common enough or useful enough for a version 1 learner deck.
- The written form and reading are correct for the chosen vocabulary item.
- The learner-facing meaning is clear, useful, and not a dictionary dump.
- The example sentence is natural, level-appropriate, and demonstrates the target word clearly.
- The reading breakdown, furigana, constituent-kanji breakdown, and JLPT or outside-JLPT labels are correct.
- Constituent readings are field-bound to the exported `ReadingBreakdown`. Safe per-kanji ruby may count as a kanji reading; whole-word ruby must be labeled as a word reading and must not be counted as a per-kanji coverage claim.
- Higher-level, lower-level, or outside-JLPT support kanji are allowed when the word itself belongs now, the card has a current-level anchor or reviewed later-placement rationale, and the card labels those kanji visibly.
- Exact word-reading audio is present, governed, and artifact-verified for the written word and exported reading. Human listening QA remains part of the release checklist.
- Pitch accent is present, protected by explicit expectation text, tied to the same governed word-reading source entry, and the rendered card output matches that governed source pattern. Generated pitch guidance may ship only when the rendered card visibly labels it as `Generated pitch (unverified)`; generated pitch is not dictionary-backed pitch evidence.
- Evidence lanes explicitly name the shipped written form, reading, meaning, example sentence, level/label claims, exact audio identity, pitch-accent source pattern, and whether pitch is dictionary-verified or generated guidance. `sourceEvidence` proves external Japanese-source card truth only; `internalChecks` and `reviewEvidence` prove generated/release gates and reviewer judgment.
- The card does not depend on ignored local files, untracked generated content, or silent fallback behavior.

## Kanji-Card Platinum Rules

Each Platinum kanji card must pass all rules below:

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
- The `japanese-source` evidence cites a governed `kanji-field-verification` source for the exported primary reading, primary meaning, and broader meanings. It does not certify the JLPT placement or source-governance confidence, and it must be independent from any source-claim origin family used by the source-governance layer for that kanji-level claim.
- The card does not depend on ignored local files, untracked generated content, or silent fallback behavior.

Before adding kanji `rereviewProvenance`, run `deck:platinum:batch` for the target level and use the per-card `reviewRubric` as the square-zero checklist. The rubric is a read-only preflight: it exposes structural blocks, attention risks, and explicit `manual_judgment_required` items for source confirmation, example pedagogy, audio listening, stroke-order visual judgment, and verification limitations. A passing or ready rubric does not itself prove substantive review; provenance may be added only after the reviewer actually checks the card against the rubric and records any limitation instead of silently passing it.

## Tier names

Use the tier names below in product and release discussion:

- **Silver**: generated learner-facing surface exists and can be inspected.
- **Gold**: golden regression protects generated output against tracked expectations.
- **Platinum**: current-standard structural gate passes, including evidence lanes, field bindings, governed source posture, media identity, and required quality gates.
- **Obsidian**: the card has explicit non-mechanical current-version rereview provenance after the reviewer actually performs the substantive review.

## Outcomes

Every platinum pass decision must use one explicit outcome:

- `platinum`: ships as reviewed.
- `fixed_then_platinum`: source data or examples were improved during review, then the card ships.
- `deferred`: useful later, but not for the current level or version 1 surface.
- `removed`: not useful enough, not learner-friendly, or not appropriate for this product.
- `needs_revalidation`: old review history retained for context; it does not certify platinum and remains backlog until current-standard revalidation is completed.
- `needs_review`: blocked until a decision or fix is made.

Only current-standard `platinum` and `fixed_then_platinum` manifest entries count as **Platinum** structural coverage until they also carry explicit substantive rereview provenance for Obsidian. `deferred` and `removed` entries must not appear in generated exports. `needs_revalidation` is allowed as non-certifying history and still counts as missing Platinum coverage. `needs_review` always fails the Platinum gate.

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
- `internalChecks`
- `reviewEvidence`
- `qualityGates`

Current-standard active word entries must also include:

- `reviewStandard`: exactly `word-platinum-v3-evidence-lanes`
- `revalidatedAt`: `YYYY-MM-DD`
- `revalidationSummary`: explicit current-standard revalidation summary covering evidence lanes, generated surface, Japanese-source evidence, example sentence, notes/support surface, reading breakdown, labels, audio, pitch accent, media provenance, and verification limitations
- `notesIncludes`: protected snippets from the exported notes/support surface
- `current-standard-review` review evidence: exact whole-card revalidation evidence covering generated surface, Japanese-source fields, example sentence, natural/useful/learner-friendly/level-appropriate sentence judgment, notes/support surface, reading breakdown, label surface, exact audio identity, pitch-accent source/render state, media provenance, and either explicit verification limitations or `no active limitations`

Active word entries may also include `verificationLimitations` for non-core limitations that remain after real review. This array is countable by the word platinum report; it does not weaken required quality gates or source evidence.

Word `sourceEvidence` must be an array of structured objects. Each object must include:

- `type`
- `source`
- `detail`

Active word `sourceEvidence` must include only the evidence type below:

- `japanese-source`: written form, reading, meaning, and example were checked against a governed `word-field-verification` source; one-kanji word cards may use a registered `single-kanji-word-field-verification` source.

Active word `internalChecks` must include all evidence types below:

- `generated-surface`: the generated word-card surface was inspected.
- `golden-regression`: the separate Gold regression gate was checked and is explicitly not source truth.
- `level-contract`: the word belongs in the reviewed word-product level.
- `media-audit`: governed media provenance was checked.
- `audio-review`: generated audio artifact identity, provenance, and exact word-reading match were reviewed.
- `pitch-accent-review`: pitch-accent value, source identity, source-to-render match, and any generated-pitch label were reviewed.
- `label-review`: JLPT/outside-JLPT labels, focus kanji, coverage role, and reading coverage were reviewed.

Active word `reviewEvidence` must include all evidence types below:

- `example-review`: the example sentence and reading were checked for release quality.
- `manual-review`: a final product judgment was made.
- `current-standard-review`: the whole-card surface was revalidated under `word-platinum-v3-evidence-lanes`.

Gold word regression remains required where applicable, but it is not word Platinum source truth. It must appear as `golden-regression` in `internalChecks` and must not appear in word `sourceEvidence`.

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
- `internalChecks`
- `reviewEvidence`
- `qualityGates`

Current-standard active kanji entries must also include:

- `reviewStandard`: exactly `kanji-platinum-v3-evidence-lanes`
- `revalidatedAt`: `YYYY-MM-DD`
- `revalidationSummary`: explicit current-standard revalidation summary covering evidence lanes, generated surface, Japanese-source evidence, example sentence, notes/support surface, audio, stroke-order media, and verification limitations
- `current-standard-review` review evidence: exact whole-card revalidation evidence covering generated surface, Japanese-source fields, example sentence plus generated reading and translation, natural/useful/learner-friendly/level-appropriate sentence judgment, notes/support surface, exact audio identity, stroke-order media, and either explicit verification limitations or `no active limitations`

Active kanji entries may also include `verificationLimitations` for non-core limitations that remain after real review. This array is countable by `deck:kanji:review-status`; it does not weaken required quality gates or source evidence.

Kanji `sourceEvidence` must be an array of structured objects. Each object must include:

- `type`
- `source`
- `detail`

Active kanji `sourceEvidence` must include only the evidence type below:

- `japanese-source`: reading and meaning were checked against a governed `kanji-field-verification` source for card-field accuracy.

Active kanji `internalChecks` must include all evidence types below:

- `generated-surface`: the generated card surface was inspected.
- `golden-regression`: the separate Gold regression gate was checked and is explicitly not source truth.
- `media-audit`: governed media provenance was checked.
- `audio-review`: generated audio artifact identity, provenance, and exact target-reading match were reviewed.
- `stroke-order-review`: stroke-order media was visually checked for the reviewed target kanji.

Active kanji `reviewEvidence` must include all evidence types below:

- `manual-review`: a final product judgment was made.
- `current-standard-review`: the whole-card surface was revalidated under `kanji-platinum-v3-evidence-lanes`.

Gold kanji regression remains required where applicable, but it is not kanji Platinum source truth. It must appear as `golden-regression` in `internalChecks` and must not appear in kanji `sourceEvidence`.

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

`needs_revalidation` kanji history entries must include `kanji`, `previousStatus`, `reviewedAt`, `reviewer`, and `decisionReason`.

## Commands

```bash
npm run deck:platinum:batch -- --level=5 --limit=12
npm run deck:platinum:batch -- --level=5 --kanji=父,生,男
npm run deck:platinum:rereview-status -- --levels=5,4
npm run deck:platinum:governance-gate
npm run deck:words:platinum:batch -- --level=5 --limit=8
npm run deck:words:platinum:batch -- --level=5 --words=今日:きょう,八日:ようか
npm run deck:words:platinum:rereview-status -- --levels=5,4
npm run deck:words:platinum:source-posture -- --levels=5,4
npm run deck:words:level-anchor-audit -- --level=5
npm run deck:platinum:n5
npm run deck:platinum:n4
npm run deck:platinum:n3
npm run deck:platinum:n2
npm run deck:platinum:n1
npm run deck:kanji:additional:platinum:n5
npm run deck:kanji:additional:platinum:n4
npm run deck:kanji:additional:platinum:n3
npm run deck:kanji:additional:platinum:n2
npm run deck:kanji:additional:platinum:n1
npm run deck:words:platinum:n5
npm run deck:words:platinum:n4
```

`deck:platinum:batch` is a read-only kanji pre-review report. It does not create entries or prove release readiness. By default it queues cards missing explicit substantive rereview proof, not merely cards missing structural current-standard entries. Use it before editing a platinum manifest to see generated card fields, hard-rule checks, risk flags, existing platinum status, and the next square-zero rereview queue.

`deck:platinum:rereview-status` is a read-only kanji rereview provenance report. It separates **Platinum** structural pass from **Obsidian** current-version certification proof. It must not infer proof from `revalidatedAt` or lane-valid `current-standard-review` text alone; missing proof is reported with the searchable marker `missing_substantive_current_standard_rereview_proof`. Use it to classify before rereviewing rather than globally blocking structurally valid cards or silently overclaiming human rereview provenance.

The generated deck-row count is the certification denominator. Platinum counts are diagnostics only; they must not shrink the square-zero Obsidian queue.

`deck:kanji:platinum:certify-status` is the fail-closed kanji Obsidian certification gate. It reuses the rereview-status classifier, then fails if any intended release row is `blocked_or_failing` or `needs_substantive_rereview`. Every failed card is reported with the card, field, expected value, actual state, evidence lane, and reviewer action. Obsidian proof must include structured rereview provenance plus actual example-sentence review evidence for naturalness, learner usefulness, level fit, support-only usage, reading, and translation. Automation can verify the evidence is present and card-bound; the reviewer still owns the language and pedagogy judgment.

`deck:words:platinum:batch` is the matching read-only word pre-review report. It does not create entries or prove release readiness. By default it queues word cards missing explicit substantive rereview proof, not merely cards missing structural current-standard entries. Use it before editing a word platinum manifest to see exact written-reading identity, generated card fields, sentence lines, exact word audio, pitch source/render status, source lookup links, risk flags, existing platinum status, and the next square-zero rereview queue.

`deck:words:platinum:rereview-status` is the read-only word rereview provenance report. It separates **Platinum** structural pass from **Obsidian** current-version certification proof. It must not infer proof from `revalidatedAt` or lane-valid `current-standard-review` text alone; missing proof is reported with the searchable marker `missing_substantive_current_standard_word_rereview_proof`. Generated rows without active current-standard structural word entries are classified as `blocked_or_failing` rather than hidden in the rereview backlog.

`deck:words:platinum:source-posture` is the read-only word source-family posture report. It is scoped to structurally current-standard word entries only. A governed single source can satisfy structural word-field verification, but it does not prove independent source-family corroboration and is marked `word_source_independence_not_proven`. Word source-claim origin independence is marked `word_source_claim_origin_independence_not_evaluated` until a word source-origin manifest exists; do not imply that word placement/source-origin circularity was checked before that data exists. Source-family posture counts are not a rereview selection pool and are not substantive platinum proof.

`deck:platinum:governance-gate` is the local-data real-row governance gate for N5/N4 platinum posture. It fails dirty reviewed entries and missing governed word sources, surfaces bulk-template `revalidationSummary` patterns, marker-only example-quality automation, zero verification-limitations populations, missing Obsidian proof, and word source-family posture. If an explicitly configured incomplete word level has blocked rows, only rows missing active current-standard structural coverage can be allowed; dirty reviewed entries still fail the gate. It does not edit cards or replace level-specific release commands.

Each kanji Platinum command requires every generated card for that level and surface to have an active current-standard structural entry by default. Core kanji commands now fail fast before generated-row construction when `--require-all` is used with an empty Platinum manifest, so unstarted N3/N2/N1 gates do not waste build time. Use `--allow-legacy-standard` only to inspect historical field-bound entries while planning revalidation; it must not be used as version 1 release evidence.

Each word Platinum command requires every generated word card for that level and surface to have an active current-standard structural entry by default. Use `--allow-legacy-standard` only to inspect historical field-bound entries while planning revalidation; it must not be used as version 1 release evidence.

Additional Platinum commands apply only to the optional `additional_unverified_Nx` surface. They do not move the core JLPT kanji contract, certify source-evidence confidence, or satisfy core kanji Platinum coverage. The npm aliases pass `--allow-empty` because the governed default currently suppresses all already-core source claims from the physical additional decks, leaving `0` selected additional cards. An empty generated additional surface is valid only when `deck:kanji:additional:ready` and `deck:kanji:review-status` prove the source claims were suppressed rather than silently skipped.

Core kanji and word Platinum commands intentionally fail for an empty manifest. Do not use Gold regression coverage as a substitute for Platinum, and do not use Platinum coverage as a substitute for Obsidian certification.
