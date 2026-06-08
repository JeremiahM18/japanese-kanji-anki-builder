# Platinum Review Policy

This document governs the current Platinum policy boundary plus compatibility surfaces that still carry `platinum` names. For program-wide lane authority, start with [Review System Forward Contract](review-system-forward-contract.md), then use [Review Tier Governance](review-tier-governance.md) as the summary.

Core kanji and word structural/card-quality work now use first-class Sapphire files, statuses, and commands. Core kanji and word expert content certification now uses first-class native Platinum content manifests and commands. Additional-unverified surfaces and older proof-provider/status commands still carry `platinum` names as compatibility names until their own migration is implemented. Existing current-standard compatibility entries remain valid migration inputs where no native Sapphire surface exists; they do not automatically claim Platinum content certification.

Sapphire is the current structural/card-quality gate. It is stricter than Gold regression and separate from Obsidian certification. Platinum content certification must inherit Sapphire and add stronger human content-review evidence under the native Platinum schema.

Gold regression means the exported card surface is protected against drift. Sapphire means the live generated card passes current field-bound evidence and quality requirements. Platinum means the stronger content-certification lane after Sapphire, under the native Platinum content schema. Obsidian means explicit non-mechanical current-version rereview proof exists for the live card.

For the binding operating contract that agents must follow before any Platinum or Obsidian batch, start with [Platinum And Obsidian Review Contract](platinum-obsidian-review-contract.md).

## Review Layers

| Layer | Purpose | Proves | Does not prove |
| --- | --- | --- | --- |
| Gold | Stabilize current generated card output. | The reviewed export fields match the governed card contract and should not regress silently. | Final release quality, source-truth evidence, Obsidian proof, or version 1 approval. |
| Sapphire | Gate current structural/card-quality requirements. | The card passes the governed product contract against live generated rows, including field-bound source evidence, explicit quality gates, media identity, limitation handling, and reviewer judgment. Core kanji and words use native Sapphire commands; additional surfaces still use compatibility names until migrated. | Platinum content certification, Gold regression, Obsidian proof, release readiness, or manual QA. |
| Platinum | Certify stronger expert content review after Sapphire. | The Platinum schema records higher human content judgment for learner value, reading and meaning choice, example usefulness, level fit, source interpretation, and limitation decisions. | Obsidian proof, release readiness, manual QA, or structure-only cleanup. |
| Obsidian | Certify substantive current-version rereview. | Explicit non-mechanical rereview proof exists for the live card. | A later fluent/native audit unless that provenance is separately recorded. |

Rules:

- Gold comes first. It protects the generated card surface while product review is still moving.
- Sapphire or compatibility structural review can keep, fix, defer, or remove cards.
- Obsidian is recorded only after actual current-version rereview proof exists.
- A card can be Gold-reviewed and still fail Sapphire.
- A level can be Gold-reviewed and still not be release-ready.
- Do not use Gold coverage as a substitute for Sapphire.
- Do not use Sapphire or compatibility Platinum coverage as a substitute for Gold regression, Platinum content certification, or Obsidian proof.
- Empty native Platinum manifests fail intentionally.

## Product rule

A card only reaches Sapphire coverage, or compatibility structural coverage on unmigrated surfaces, when it is accurate, useful, learner-friendly, and governed under the current command family. If a card is uncommon, awkward, too advanced for the level, misleading, or only present to chase reading coverage, remove or defer it instead of promoting it. Platinum content certification requires Sapphire first and must not be claimed unless the native Platinum schema and gate pass for that exact card.

Sapphire evidence is field-bound. A source entry that only says "reviewed" is not enough. The evidence text for an active card must explicitly name the reviewed word or kanji, the exported reading, and the learner-facing values it supports. Automated checks enforce that evidence is tied to the generated card surface; human review still owns the judgment that the cited source and final card are correct.

If a real review attempt cannot verify a non-core or externally unavailable facet, do not silently block forever and do not mark it as verified. Ship only when the card remains accurate and learner-safe, the unresolved facet is visibly labeled or recorded as a known limitation, and the platinum evidence explains the review attempt and limitation. Generated pitch accent guidance is the model precedent: it may ship only with a visible `Generated pitch (unverified)` label and governed provenance, not as dictionary-backed proof. If the unverifiable item is core to the card's written form, reading, meaning, example correctness, or product fit, defer or remove the card instead of promoting it.

For core-kanji Sapphire, record any allowed non-core limitation in `verificationLimitations` instead of burying it in prose. Each limitation must name the exact facet, use an explicit visible label such as `... unverified`, describe the review attempt, appear in the exported `Notes` surface, and be mentioned in `manual-review` evidence. Core truth fields such as the target kanji, `DisplayWord`, `PrimaryReading`, `MeaningJP`, `KanjiMeanings`, example correctness, and product fit cannot use this escape hatch; unresolved uncertainty there still blocks Sapphire.

For word Sapphire, record any allowed non-core limitation in `verificationLimitations` instead of burying it in prose. Each limitation must name the exact facet, use an explicit visible label such as `... unverified` or `... limited verification`, describe the review attempt, appear in the exported `Notes` surface, and be mentioned in `manual-review` evidence. Core truth fields such as written form, reading, meaning, example correctness, and product fit cannot use this escape hatch; unresolved uncertainty there still blocks Sapphire.

For active word cards, `japanese-source` evidence must cite a source registered in `templates/platinum_card_source_manifest.json` for `word-field-verification`. Generated output, Gold regression expectations, tracked starter templates, ignored local data, source-claim lists, and local caches are useful internal evidence, but they are not Japanese-source verification by themselves. Kanji-reference sources may support `single-kanji-word-field-verification` only for one-kanji word cards.

For active word cards, the reviewed deck level must be governed by the written word and learner fit. A card is anchored by kanji from its own deck level; other constituent kanji are support kanji and must be visibly labeled. If the word has no current-level anchor, all-easier-kanji words may ship later only with an explicit learner-fit rationale, and words that depend only on harder support kanji must move, defer, or be removed.

For active core-kanji Sapphire cards, `japanese-source` evidence must cite a source registered in `templates/platinum_card_source_manifest.json` for `kanji-field-verification`. Generated output, Gold regression expectations, tracked starter templates, source-governance manifests, source-claim lists, ignored local data, and local caches are useful internal evidence, but they are not Japanese-source verification by themselves. The same source may support both kanji and word product reviews when it directly verifies each card's own fields; the requirement is accuracy and field binding, not source uniqueness across products. This card-field source check is not a JLPT placement proof; placement confidence remains owned by the source-governance layer. Sapphire may read JLPT kanji source-governance origin ids only to reject circular field verification against the same source family.

Current word Sapphire coverage uses the versioned standard `word-sapphire-v1-evidence-lanes`. Active word entries count toward current-standard Sapphire coverage only when they include `reviewStandard`, `revalidatedAt`, `revalidationSummary`, `notesIncludes`, `sourceEvidence`, `internalChecks`, and `reviewEvidence`. Word `sourceEvidence` is reserved for governed external Japanese-source truth evidence and must not contain generated-output checks, Gold regression, media checks, or manual judgment. `internalChecks` carries generated-surface, golden-regression, level-contract, media, audio, pitch-accent, and label checks. `reviewEvidence` carries example review, manual product judgment, and current-standard whole-card revalidation. That current-standard review evidence must explicitly bind the generated surface, Japanese-source field check, example sentence, notes/support surface, reading breakdown, level/label surface, exact audio identity, pitch-accent source/render state, media provenance, and verification limitations to the exact written-reading card. It must also record the example sentence judgment: natural, useful, learner-friendly, level-appropriate, and release-quality. Existing active word entries created before this standard are legacy/unversioned: keep them for historical context, but do not count them as current version 1 structural lock evidence until they are revalidated. Legacy word Platinum manifests remain compatibility/proof-provider inputs and do not certify Platinum content.

Current core-kanji Sapphire uses the versioned standard `kanji-sapphire-v1-evidence-lanes`. Active core-kanji entries count as Sapphire only when they include `reviewStandard`, `revalidatedAt`, `revalidationSummary`, `sourceEvidence`, `internalChecks`, and `reviewEvidence`. Kanji `sourceEvidence` is reserved for governed external Japanese-source card-field truth and must not contain generated-output checks, Gold regression, media checks, or manual judgment. `internalChecks` carries generated-surface, golden-regression, media, audio, and stroke-order checks. `reviewEvidence` carries manual product judgment and current-standard whole-card revalidation. That current-standard review evidence must explicitly bind the generated surface, Japanese-source field check, example sentence, notes/support surface, audio, stroke-order media, and verification limitations to the exact card. It must also record the example sentence judgment: natural, useful, learner-friendly, level-appropriate, release-quality, and support-only. Legacy core-kanji `platinum_n*_review_set.json` manifests are read-only migration inputs; they are non-certifying Platinum compatibility history and must not be used as native Sapphire output after migration.

## Word-Card Sapphire Rules

Each Sapphire word card must pass all rules below:

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

## Kanji-Card Sapphire Rules

Each Sapphire kanji card must pass all rules below:

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

Before adding kanji Sapphire entries, run `deck:sapphire:batch` for the target level and use the per-card rubric as the square-zero checklist. The rubric is a read-only preflight: it exposes structural blocks, attention risks, and explicit `manual_judgment_required` items for source confirmation, example pedagogy, audio identity, stroke-order target/provenance judgment, and verification limitations. A passing or ready rubric does not itself create Sapphire entries; promote only reviewed Sapphire candidates through `deck:sapphire:promote` after the actual card-data review has happened.

## Tier names

Use the tier names below in product and release discussion:

- **Silver**: generated learner-facing surface exists and can be inspected.
- **Gold**: golden regression protects generated output against tracked expectations.
- **Sapphire**: current-standard structural/card-quality gate passes, including evidence lanes, field bindings, governed source posture, media identity, actual card-data review, and required quality gates. Core kanji and words use native Sapphire files and commands; additional surfaces still retain compatibility command names until migrated.
- **Platinum**: expert content certification after Sapphire, backed by the native Platinum content schema and stronger human content-review evidence.
- **Obsidian**: the card has explicit non-mechanical current-version rereview provenance after the reviewer actually performs the substantive review.

## Outcomes

Every core-kanji Sapphire pass decision must use one explicit outcome:

- `sapphire`: ships as reviewed.
- `fixed_then_sapphire`: source data or examples were improved during review, then the card ships.
- `deferred`: useful later, but not for the current level or version 1 surface.
- `removed`: not useful enough, not learner-friendly, or not appropriate for this product.
- `needs_revalidation`: old review history retained for context; it does not certify Sapphire and remains backlog until current-standard revalidation is completed.
- `needs_review`: blocked until a decision or fix is made.

Only current-standard `sapphire` and `fixed_then_sapphire` manifest entries count as core-kanji Sapphire coverage. `deferred` and `removed` entries must not appear in generated exports. `needs_revalidation` is allowed as non-certifying history and still counts as missing Sapphire coverage. `needs_review` always fails the Sapphire gate.

Sapphire validates the generated card in its current deck level; it does not itself move a word to another deck. For expansion candidates that are valid but belong elsewhere, use the expansion triage decision `move_candidate` with a target JLPT level, then physically place the word only by updating the target level's `jlpt_word_level_contract` and starter word data and running that target lane's gates.

## Required manifest fields

Active word Sapphire entries must include:

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

- `reviewStandard`: exactly `word-sapphire-v1-evidence-lanes`
- `revalidatedAt`: `YYYY-MM-DD`
- `revalidationSummary`: explicit current-standard revalidation summary covering evidence lanes, generated surface, Japanese-source evidence, example sentence, notes/support surface, reading breakdown, labels, audio, pitch accent, media provenance, and verification limitations
- `notesIncludes`: protected snippets from the exported notes/support surface
- `current-standard-review` review evidence: exact whole-card revalidation evidence covering generated surface, Japanese-source fields, example sentence, natural/useful/learner-friendly/level-appropriate sentence judgment, notes/support surface, reading breakdown, label surface, exact audio identity, pitch-accent source/render state, media provenance, and either explicit verification limitations or `no active limitations`

Active word entries may also include `verificationLimitations` for non-core limitations that remain after real review. This array is countable by the word Sapphire report; it does not weaken required quality gates or source evidence.

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
- `current-standard-review`: the whole-card surface was revalidated under `word-sapphire-v1-evidence-lanes`.

Gold word regression remains required where applicable, but it is not word Sapphire source truth. It must appear as `golden-regression` in `internalChecks` and must not appear in word `sourceEvidence`.

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

All gates must be `true`. `fixed_then_sapphire` entries must also include `fixSummary`.

Deferred and removed word entries must include `word`, `readingIncludes`, `reviewedAt`, `reviewer`, and `decisionReason`.

Active core-kanji Sapphire entries must include:

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

- `reviewStandard`: exactly `kanji-sapphire-v1-evidence-lanes`
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
- `current-standard-review`: the whole-card surface was revalidated under `kanji-sapphire-v1-evidence-lanes`.

Gold kanji regression remains required where applicable, but it is not kanji Sapphire source truth. It must appear as `golden-regression` in `internalChecks` and must not appear in kanji `sourceEvidence`.

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

All kanji gates must be `true`. `fixed_then_sapphire` kanji entries must also include `fixSummary`.

Deferred and removed kanji entries must include `kanji`, `reviewedAt`, `reviewer`, and `decisionReason`.

`needs_revalidation` kanji history entries must include `kanji`, `previousStatus`, `reviewedAt`, `reviewer`, and `decisionReason`.

## Commands

```bash
npm run deck:sapphire:batch -- --level=5 --limit=12
npm run deck:sapphire:batch -- --level=5 --kanji=父,生,男
npm run deck:sapphire:promote -- --level=5 --input=<reviewed-json>
npm run deck:kanji:obsidian:rereview-status -- --levels=5,4
npm run deck:kanji:obsidian:certify-status -- --levels=5,4
npm run deck:legacy-platinum:governance-gate
npm run deck:words:sapphire:batch -- --level=5 --limit=8
npm run deck:words:sapphire:batch -- --level=5 --words=今日:きょう,八日:ようか
npm run deck:words:obsidian:rereview-status -- --levels=5,4
npm run deck:words:obsidian:certify-status -- --levels=5,4
npm run deck:words:legacy-platinum:source-posture -- --levels=5,4
npm run deck:words:level-anchor-audit -- --level=5
npm run deck:sapphire:n5
npm run deck:sapphire:n4
npm run deck:sapphire:n3
npm run deck:sapphire:n2
npm run deck:sapphire:n1
npm run deck:platinum:batch -- --level=5 --limit=8
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
npm run deck:words:sapphire:n5
npm run deck:words:sapphire:n4
npm run deck:words:platinum:batch -- --level=5 --limit=8
npm run deck:words:platinum:n5
npm run deck:words:platinum:n4
npm run deck:words:platinum:n3
npm run deck:words:platinum:n2
npm run deck:words:platinum:n1
```

`deck:sapphire:batch` is the read-only core-kanji Sapphire pre-review report. It does not create entries or prove release readiness. By default it queues cards missing current-standard Sapphire structure. Use it before editing a Sapphire candidate packet to see generated card fields, hard-rule checks, risk flags, existing Sapphire status, and the next square-zero structural review queue. `deck:sapphire:promote` validates reviewed candidate JSON and writes only with `--write`; it does not create Platinum certification or Obsidian proof.

`deck:kanji:obsidian:rereview-status` is a read-only kanji Obsidian proof-status report. It separates **Sapphire** structural pass from **Obsidian** current-version certification proof. It must not infer proof from `revalidatedAt` or lane-valid `current-standard-review` text alone; missing proof is reported with the searchable marker `missing_substantive_current_standard_rereview_proof`. Use it to classify before rereviewing rather than globally blocking structurally valid cards or silently overclaiming human rereview provenance.

The generated deck-row count is the certification denominator. Sapphire counts are diagnostics only; they must not shrink the square-zero Obsidian queue.

`deck:kanji:obsidian:certify-status` is the fail-closed kanji Obsidian certification gate. It reuses the rereview-status classifier, then fails if any intended release row is `blocked_or_failing` or `needs_substantive_rereview`. Every failed card is reported with the card, field, expected value, actual state, evidence lane, and reviewer action. Obsidian proof must include structured rereview provenance plus actual example-sentence review evidence for naturalness, learner usefulness, level fit, support-only usage, reading, and translation. Automation can verify the evidence is present and card-bound; the reviewer still owns the language and pedagogy judgment.

`deck:words:sapphire:batch` is the matching read-only word Sapphire pre-review report. It does not create entries, prove Platinum, prove Obsidian, or prove release readiness. By default it queues word cards missing current-standard Sapphire structure. Use it before editing a word Sapphire candidate packet to see exact written-reading identity, generated card fields, sentence lines, exact word audio, pitch source/render status, source lookup links, risk flags, existing Sapphire status, and the next structural review queue.

`deck:platinum:batch`, `deck:platinum:n<level>`, `deck:words:platinum:batch`, and `deck:words:platinum:n<level>` are the native Platinum expert content-certification commands. They consume current-standard Sapphire as a prerequisite, use the native `*-platinum-v1-expert-content` standards, and fail closed while the native Platinum content manifests are empty. They do not create Sapphire entries, record Obsidian proof, or certify release readiness. Legacy structural/proof-provider compatibility remains explicit under `deck:legacy-platinum:*`, `deck:words:legacy-platinum:*`, and older Obsidian proof-provider aliases.

`deck:words:obsidian:rereview-status` is the read-only word Obsidian proof-status report. The current proof consumer still labels its structural column as **Platinum** compatibility while native `deck:words:sapphire:*` owns word Sapphire coverage; both remain separate from **Obsidian** current-version certification proof. Migrated N5/N4 word proof reads canonical JSONL through the scoped proof-provider path by default, and the tracked N5/N4 word review sets no longer carry inline word proof. The command accepts `--proof-provider=ledger` and `--proof-provider=ledger-if-available` for normal migrated-level audits; `--proof-provider=inline` is only a negative-control legacy audit after inline removal. It must not infer proof from `revalidatedAt`, lane-valid `current-standard-review` text, or loose textual proof markers alone; missing proof is reported with the searchable marker `missing_substantive_current_standard_word_rereview_proof`. Obsidian word proof requires structured `rereviewProvenance`, exact word-reading card identity binding, a full word-card `evidenceChecked` checklist, and actual example-sentence quality review evidence covering natural Japanese, learner usefulness, level fit, release quality, reading, and translation. Generated rows without active current-standard structural word entries are classified as `blocked_or_failing` rather than hidden in the rereview backlog.

`deck:words:obsidian:certify-status` is the fail-closed word Obsidian certification gate. It reuses the rereview-status classifier, then fails if any intended release row is `blocked_or_failing` or `needs_substantive_rereview`. For migrated N5/N4 word proof it reads canonical JSONL through the scoped proof-provider path by default; use `--proof-provider=ledger` or `--proof-provider=ledger-if-available` for normal migrated-level audits, and reserve `--proof-provider=inline` as a negative-control legacy audit after inline removal. Every failed word card is reported with the card, field, expected value, actual state, evidence lane, and reviewer action. Automation can verify the proof is present and card-bound; the reviewer still owns the natural-Japanese, sense-fit, and pedagogy judgment.

Legacy structural/proof-provider compatibility commands use explicit legacy names such as `deck:legacy-platinum:rereview-status`, `deck:words:legacy-platinum:rereview-status`, and `deck:words:legacy-platinum:certify-status`. Migrated kanji and word legacy commands default to the scoped `ledger-if-available` proof provider. Use the Obsidian names in new docs, release checklists, handoff prompts, and governance reports when the work is proof, and use native `deck:platinum:*` only for Platinum content certification.

`deck:words:legacy-platinum:source-posture` is the read-only word source-family posture report. It is scoped to structurally current-standard word entries only. A governed single source can satisfy structural word-field verification, but it does not prove independent source-family corroboration and is marked `word_source_independence_not_proven`. Word source-claim origin independence is marked `word_source_claim_origin_independence_not_evaluated` until a word source-origin manifest exists; do not imply that word placement/source-origin circularity was checked before that data exists. Source-family posture counts are not a rereview selection pool and are not substantive Platinum proof.

`deck:legacy-platinum:governance-gate` is the local-data real-row governance gate for N5/N4 native Sapphire and word source/proof posture. It reads migrated kanji and word Obsidian proof through the scoped proof-provider path, defaulting to canonical JSONL for migrated levels; unmigrated levels still fall back through the provider path until their own scoped ledger exists. It fails dirty reviewed entries and missing governed word sources, surfaces bulk-template `revalidationSummary` patterns, marker-only example-quality automation, zero verification-limitations populations, missing Obsidian proof, and word source-family posture. If an explicitly configured incomplete word level has blocked rows, only rows missing active current-standard Sapphire coverage can be allowed; dirty reviewed entries still fail the gate. It does not edit cards, certify native Platinum content, or replace level-specific release commands.

Each core-kanji Sapphire command requires every generated card for that level to have an active current-standard Sapphire entry by default. Core kanji commands fail fast before generated-row construction when `--require-all` is used with an empty or incomplete Sapphire manifest, so incomplete N1 gates report the missing current-standard Sapphire coverage instead of implying release readiness. N5/N4/N3/N2 are current-standard complete and have complete canonical Obsidian proof. N2 Sapphire and Obsidian certification still do not imply APKG manual media QA, source-governance completion, Platinum content certification, or release readiness. Use `--allow-legacy-standard` only to inspect historical field-bound entries while planning revalidation; it must not be used as version 1 release evidence.

Each word Sapphire command requires every generated word card for that level and surface to have an active current-standard Sapphire card-quality entry by default. Use `--allow-legacy-standard` only to inspect historical field-bound entries while planning revalidation; it must not be used as version 1 release evidence.

Legacy N5/N4 word Platinum compatibility level gates remain only for downstream proof-provider compatibility while consumers migrate. The boundary remains: a passing Sapphire or legacy compatibility gate is not Platinum content certification, new Obsidian certification, or release readiness.

Additional Platinum compatibility commands apply only to the optional `additional_unverified_Nx` surface. They do not move the core JLPT kanji contract, certify source-evidence confidence, or satisfy core kanji Sapphire coverage. The npm aliases pass `--allow-empty` because the governed default currently suppresses all already-core source claims from the physical additional decks, leaving `0` selected additional cards. An empty generated additional surface is valid only when `deck:kanji:additional:ready` and `deck:kanji:review-status` prove the source claims were suppressed rather than silently skipped.

Core kanji Sapphire commands and word Sapphire commands intentionally fail for an empty manifest. Do not use Gold regression coverage as a substitute for Sapphire coverage, and do not use Sapphire or compatibility coverage as a substitute for Platinum content certification or Obsidian certification.
