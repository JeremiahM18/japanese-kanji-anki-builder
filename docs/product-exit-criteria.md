# Product Exit Criteria

Deck milestones require product review. A passing script is not sufficient.

## Quality pillars

Evaluate each release checkpoint across:

- Core value
- User experience
- Accessibility
- Internationalization and localizability
- Technical quality
- Reliability and stability
- Privacy, security, and licensing

## Review layers

Gold, Platinum, and Obsidian are separate gates.

| Layer | Role in the product |
| --- | --- |
| Gold | Protects generated card output from regression. It checks learner-facing fields against the current governed contract. |
| Platinum | Gates current structural and card-quality requirements. It requires field-bound source evidence, explicit quality gates, and a keep/fix/defer/remove decision. |
| Obsidian | Certifies explicit non-mechanical current-version rereview proof for the live card. |

Gold coverage is required before a level can be trusted for ongoing work. Platinum coverage is required before a level is version-1 locked. Obsidian proof is required before claiming substantive current-version certification. Gold-reviewed does not mean release-ready.

Platinum evidence must name the specific card, exported reading, and learner-facing values being verified. A broad statement that a field was reviewed is not enough.

When a real review attempt cannot verify a non-core or externally unavailable facet, record the limitation instead of silently blocking or pretending verification. The card may ship only if the unresolved facet is visibly labeled or documented, governed provenance is present, and the remaining card is accurate and learner-safe. Core written form, reading, meaning, example correctness, and product-fit uncertainty still require fix, defer, or remove.

Kanji Platinum limitations must be structured in `verificationLimitations`, visible in the affected card surface, and countable by level. They are allowed only for non-core facets; uncertainty about the target kanji, displayed reading, meaning, example correctness, or product fit remains a blocker.

Word Platinum limitations must be structured in `verificationLimitations`, visible in the affected word card `Notes` surface, and countable in the word Platinum report. They are allowed only for non-core facets; uncertainty about written form, reading, meaning, example correctness, or product fit remains a blocker.

Kanji Platinum release coverage must use the current versioned standard `kanji-platinum-v3-evidence-lanes`. Legacy or unversioned kanji review history must be marked `needs_revalidation`, not active Platinum. It is useful context, but it is not current version 1 lock evidence until revalidated with `reviewStandard`, `revalidatedAt`, `sourceEvidence`, `internalChecks`, `reviewEvidence`, and a summary that confirms evidence lanes, generated surface, Japanese-source evidence, example sentence, notes/support surface, audio, stroke-order media, and verification limitations were checked under the current policy. Kanji `sourceEvidence` is reserved for governed Japanese-source card-field truth; generated output, Gold regression, media/audio/stroke-order checks, and manual judgment belong in separate internal or review lanes.

For active word Platinum, `japanese-source` evidence must cite a source registered in `templates/platinum_card_source_manifest.json` for `word-field-verification`. Generated output, Gold regression expectations, tracked starter templates, ignored local data, source-claim lists, and local caches are internal evidence only; they do not satisfy Japanese-source verification by themselves. One-kanji word cards may use a registered `single-kanji-word-field-verification` source.

Word Platinum release coverage must use the current versioned standard `word-platinum-v3-evidence-lanes`. Legacy or unversioned active entries are useful review history, but they are not current version 1 lock evidence until revalidated with `reviewStandard`, `revalidatedAt`, `notesIncludes`, `sourceEvidence`, `internalChecks`, `reviewEvidence`, and a summary that confirms evidence lanes, generated surface, Japanese-source evidence, example sentence, notes/support surface, reading breakdown, labels, audio, pitch accent, media provenance, and verification limitations were checked under the current policy. Word `sourceEvidence` is reserved for governed Japanese-source truth evidence; generated output, Gold regression, media/audio/pitch/label checks, and manual judgment belong in separate internal or review lanes.

For active word Platinum, the reviewed word level must follow the word-level placement policy: a word is anchored by kanji from its own deck level, support kanji from any other level must be visibly labeled, all-easier-kanji words may ship later only with an explicit learner-fit rationale, and words with no current-level anchor must not ship earlier than their harder support kanji justify.

For active kanji Platinum, `japanese-source` evidence must cite a source registered for `kanji-field-verification` for the card's target kanji, exported primary reading, primary meaning, and broader meanings. This verifies card-field accuracy only. It does not certify JLPT placement or source-governance confidence, and it does not require a different source from word-card review when the same source accurately supports both products. When source-governance origins exist for the kanji-level claim, Platinum rejects card-field verification that comes only from the same source family.

## Kanji deck exit criteria

A kanji level ships only when all criteria are true:

- Canonical JLPT taxonomy is governed by tracked contracts.
- JLPT kanji taxonomy has passing independent source-evidence consensus before deck movement or release claims depend on level placement.
- Gold regression coverage for that shipped level is complete.
- Platinum coverage is complete for the shipped kanji level under the current versioned standard. Gold protects the export surface; Platinum gates current structural and card-quality requirements.
- Exported cards preserve the individual-kanji learning contract: `DisplayWord` equals the target kanji, `PrimaryReading` is the most learner-useful level-appropriate reading, `MeaningJP` is the meaning associated with that primary reading, `KanjiMeanings` carries broader kanji meanings, curated `blockedMeanings` suppresses low-value dictionary glosses, and compound words do not replace the card anchor.
- `npm run deck:ready -- --levels=<level>` passes with `0` export fallback issues.
- Exported card media completeness is `100%` for the single learner-facing looping stroke-order field and audio field.
- Stroke-order animation coverage is `100%`.
- Stroke-order provenance is audited from approved sources. Stroke-sequence correctness is a human visual-review responsibility and must be recorded in Platinum evidence.
- Audio is governed, audited, review-clean, and exact for the exported target kanji plus primary reading.
- Accessibility review has no unresolved blocker.

Additional kanji is currently a source-claim diagnostic with `0` physical cards, not an extra learner backlog or core taxonomy movement. Optional `additional_unverified_Nx` cards may exist only when a genuinely selected non-core candidate is generated. The default build must suppress duplicate additional source claims and source claims for kanji already present in core decks unless an explicit governed variant-selection build is requested. Additional Gold and Platinum gates protect only generated optional additional output; they do not move the core JLPT contract, certify source-evidence confidence, or satisfy core Platinum coverage.

## Word deck exit criteria

A word level ships only when all criteria are true:

- Canonical word contract rows are fully built for the level.
- Platinum coverage is complete for the shipped word level under the current versioned standard. Gold protects the export surface; Platinum gates current structural and card-quality requirements.
- Word-level placement audit passes for the shipped word level.
- No standalone wrong-level cards ship in the deck.
- Constituent kanji are visibly labeled with JLPT level or outside-JLPT status.
- Reading coverage is reported honestly against the selected word-product level scope, including whether a target is covered by an earlier, same-level, or harder selected deck.
- `ReadingBreakdown`, `CoversReading`, and `KanjiBreakdown` agree: safe per-kanji ruby can drive constituent readings, but whole-word ruby is labeled as word-level reading and is not counted as per-kanji coverage.
- Active triage is either resolved or intentionally deferred.
- Sentence orthography review has no unresolved blocker.
- Any shipped audio is governed, audited, and review-clean.
- Pitch accent is governed and source-matched when dictionary-backed. Generated pitch guidance may ship only when governed provenance is present and the rendered card visibly labels it as unverified; a non-empty pitch field is not enough, and source/render or identity mismatches still block readiness.
- Accessibility review has no unresolved blocker.

## Current product posture

- N5 kanji: Gold-reviewed and current local deck readiness passes with complete exported media and exact primary-reading audio; Platinum gates pass at `80/80`, and `80/80` are Obsidian certified with explicit non-mechanical rereview proof
- N4 kanji: Gold-reviewed and current local deck readiness passes with complete exported media and exact primary-reading audio; Platinum gates pass at `212/212` with `0` active verification limitations and `0` remaining core N4 structural gaps, and `212/212` are Obsidian certified
- N3 kanji: Gold-reviewed and current local deck readiness passes with complete exported media and exact primary-reading audio; current-standard structural Platinum proof is complete at `341/341`, Obsidian is `264/341`, `77` Platinum entries still need substantive Obsidian proof, and `0` generated rows still need structural Platinum
- N2 kanji: Gold-reviewed and current local deck readiness passes with complete exported media and exact primary-reading audio; Platinum not started
- N1 kanji: Gold-reviewed at `1230/1230`; current local deck readiness passes with complete exported media and exact primary-reading audio; Platinum not started
- Additional kanji source-claim diagnostic: there are currently `0` selected physical additional cards. Current `deck:kanji:additional:ready` passes with `421` raw additional source claims, `0` selected additional cards, `406` unique core-retained kanji, and `421` suppressed source claims; exported additional counts are N5 `0/0`, N4 `0/0`, N3 `0/0`, N2 `0/0`, N1 `0/0` with `0` packaged media. Current `deck:kanji:review-status` passes with all additional generated/Gold/Platinum counts at `0/0`, `15` duplicate additional-source kanji tracked in the report, and `0` unresolved duplicate kanji. Source-claim evidence remains in the governed source manifests and does not require duplicate Anki cards.
- Kanji Obsidian provenance: `deck:kanji:obsidian:rereview-status -- --levels=5,4` currently reports N5/N4 combined `292/292` Platinum pass, `292/292` Obsidian certified, `0/292` Platinum entries needing Obsidian, and `0/292` blocked/failing. `deck:kanji:obsidian:rereview-status -- --levels=3` currently reports N3 as `341` generated rows, `341` structural Platinum passes, `264` Obsidian certifications, `77` Platinum entries needing Obsidian proof, and `0` blocked/failing rows. The missing-proof marker is `missing_substantive_current_standard_rereview_proof`; `revalidatedAt`, lane-valid `current-standard-review` text, and assistive NLP signals are not treated as standalone proof of substantive post-v3 human rereview.
- Kanji Obsidian certification gate: `deck:kanji:obsidian:certify-status -- --levels=5,4` currently passes for the full N5/N4 kanji denominator. `deck:kanji:obsidian:certify-status -- --levels=3` intentionally fails while N3 has `77` Platinum entries without substantive rereview proof and `0` rows missing current-standard structural entries. The gate fails on any `blocked_or_failing` or `needs_substantive_rereview` row and reports each failed card with field, expected, actual, evidence lane, and reviewer action. Obsidian proof must include structured rereview provenance plus actual example-sentence review evidence for naturalness, learner usefulness, level fit, support-only usage, reading, and translation; automation verifies presence/binding, while the reviewer owns the language and pedagogy judgment.
- JLPT kanji source evidence: governed separately from the operational taxonomy with tracked source tiers, publisher-independence groups, evidence lineages, range evidence, and confidence reasons. `current_operational_contract` is a non-voting comparator only. `kanjidic2_legacy` is pinned and imported as one active external evidence source with `1479` reviewed exact assignments and `0` current range rows; future regeneration preserves old level 2 as N2/N3 range evidence instead of guessing exact placement. The separate `kanjidic2_reading_reference` lane is a tracked KANJIDIC2 CC BY-SA 4.0 on/kun reading-reference contract covering `2212/2212` operational JLPT kanji; it is not JLPT placement evidence, full kanji-card field verification, or release certification. `tanos_legacy_direct` is pinned and imported as one active direct legacy source with `1478` reviewed N1/N4/N5 assignments. `tanos_estimated_split` is pinned and imported as an active lower-weight estimated source with `734` reviewed N2/N3 assignments, separate from direct legacy evidence, and must not settle taxonomy movement by itself. `tanos_frequency_method_notes` is an active, non-voting method lane that explains why Tanos N2/N3 assignments are estimated. `official_jlpt_sample_workbooks` is active occurrence-only evidence and cannot assign or move kanji. Japanese-published textbook evidence is split into individual manual-citation source lanes: `ask_hajimete_jlpt_kanji` is active with `208` reviewed assignments, `0` non-importing `source_access_gap` rows, and `0` pending rows from pinned official N1/N3 target-entry and index pages plus exact N2 and N5 checklist pages, `shin_kanzen_master_kanji` is active with `406` reviewed assignments, `236` non-importing `source_access_gap` rows, and `1570` pending rows, and `nihongo_sou_matome_kanji` is active with `498` reviewed assignments, `417` non-importing `source_access_gap` rows, and `1297` pending rows; continue targeted Sou review only where exact assignment proof is available. `try_jlpt_textbook` is blocked unless exact per-kanji assignment proof is found. `japanese_textbook_consensus` is a derived non-voting summary computed from individual textbook lanes. `joyo_grade` and `kanji_alive` are background metadata only, `bccwj_frequency` is frequency sanity only, `jpdb` is restricted manual frequency sanity only after source-use review, `kanshudo` and `wanikani` are restricted and blocked until governed use paths are approved, and `jlptsensei` is a secondary non-Japanese manual-citation signal only after Japanese-published evidence is no longer the dominant blocker. Tanos direct legacy and KANJIDIC2 legacy have different publisher-independence groups but share the `pre_2010_direct_jlpt` evidence lineage, so they do not satisfy the independent-lineage requirement by themselves. The current audit is still expected to fail evidence depth until additional independent evidence-lineage and Japanese-published source evidence are populated and reviewed, even when source-use governance is clean. Ignored source files must pass `data:audit:jlpt:source-inputs` with pinned integrity before their assignments are imported.
- Non-disputed source consensus can be promoted only by an explicit governed contract migration. The source audit remains an evidence-depth gate and does not itself generate decks or release approval.
- N5 word: expanded to `287` canonical governed rows plus `20` tracked source-only phrase exclusions; current word-level placement, Gold, tracked-source artifact, automated readiness, Platinum, and strict word Obsidian proof pass at `287/287`; manual import QA, accessibility, and listening checks are still required before release-ready product claims
- N4 word: expanded to `700` governed rows after finishing the routed N5-source target-N4 move workload. Current word-level placement passes and the generated card surface builds at `700/700`, with required back-side fields, word audio, pitch accent, examples, reading breakdowns, and support labels complete. Gold regression, current-standard Platinum structural coverage, and strict Obsidian proof now cover `700/700`. Current live readiness is `ready_with_deferred_variants`, reading coverage is `579/755` (`76.7%`), and the active reading backlog is clear; remaining reading items are deferred variants or low learner-value gaps. N4 word still needs import QA, accessibility, and listening checks before release-ready product claims.
- Word Obsidian provenance: `deck:words:obsidian:rereview-status -- --levels=5,4` currently reports N5/N4 combined `987` generated active word rows, `987/987` Platinum structural pass, `987/987` Obsidian certified, `0` Platinum entries needing Obsidian, and `0/987` blocked/failing rows. The generated-row denominator is the square-zero Obsidian denominator; for N5 word that means `287/287` Obsidian certified and for N4 word that means `700/700`, not `987/987` just because Platinum structural coverage exists. The missing-proof marker is `missing_substantive_current_standard_word_rereview_proof`; `revalidatedAt`, lane-valid `current-standard-review` text, and loose textual markers are not treated as standalone proof of substantive post-v3 human rereview. Word Obsidian proof must be structured, exact word-reading-card-bound, and backed by a full evidence checklist plus actual example-sentence quality review evidence.
- Word Obsidian certification gate: `deck:words:obsidian:certify-status -- --levels=5,4` currently passes for the full N5/N4 word denominator. It fails on any `blocked_or_failing` or `needs_substantive_rereview` row and reports each failed card with field, expected, actual, evidence lane, and reviewer action.
- Word Platinum source posture: `deck:words:platinum:source-posture -- --levels=5,4` currently inspects the `987` structurally current-standard word entries, reporting `121` with independent source families proven, `866` with a single source family, and `0` missing governed source evidence. Source-family posture is not the rereview selection pool and not substantive Platinum proof. Single-source-family entries remain structurally governed but must not be described as independently corroborated; the searchable marker is `word_source_independence_not_proven`. Word source-claim origin independence is not evaluated until a word source-origin manifest exists; the searchable marker is `word_source_claim_origin_independence_not_evaluated`.
- Platinum governance gate: `deck:platinum:governance-gate` currently passes against local real generated N5/N4 rows with warnings for word single-source-family posture, bulk-template or missing card-specific revalidation summaries, marker-only example-quality automation, and zero active verification limitations. Migrated kanji and word Obsidian proof inputs use the scoped proof-provider path. This gate does not edit cards and does not prove release readiness.

## Required gates before shipping

Minimum automated gate:

```bash
npm test
npm run lint
npm run typecheck
npm run data:audit:jlpt
npm run data:audit:jlpt:sources -- --governance-strict --limit=25
npm run data:audit:jlpt:official-occurrences -- --strict
npm run data:audit:jlpt:source-inputs -- --source=tanos_legacy_direct --strict
npm run data:audit:jlpt:source-inputs -- --source=tanos_estimated_split --strict
npm run data:audit:jlpt:source-inputs -- --source=kanjidic2_legacy --strict
npm run data:audit:jlpt:words
npm run data:audit:audio -- --json
npm run deck:review:accessibility -- --deck-kind=kanji
npm run deck:review:accessibility -- --deck-kind=word
npm run deck:kanji:review-status
npm run deck:words:level-anchor-audit -- --level=5
npm run product:artifacts:n5
npm run product:artifacts:kanji:n5:preflight
npm run product:artifacts:kanji:n5
npm run product:artifacts:kanji:n4:preflight
npm run product:artifacts:kanji:n4
npm run product:artifacts:kanji:all
npm run product:artifacts:kanji:release-qa
npm run product:readiness:n5
npm run release:gate
```

`product:artifacts:n5` validates fresh N5 word TSV generation from tracked templates only. It excludes ignored local word, sentence, JLPT, cache, and media inputs, disables network inference, checks the word schema header, verifies canonical N5 row counts, rejects curated-only and inferred-only shipped rows, and repeats the build to prove deterministic output. It does not certify tracked-source kanji TSVs, fresh `.apkg` artifacts, managed media packaging, or manual QA.

`product:artifacts:kanji:n5:preflight` and `product:artifacts:kanji:n4:preflight` report whether tracked templates are sufficient for N5 or N4 kanji TSV source availability without ignored local `data/` inputs. They currently report `certifiable: yes` for source availability because component/radical source data is tracked in `templates/kanji_component_contract.json`, on/kun reading reference data is tracked in `templates/kanji_reading_reference_contract.json`, N5 card-field source provenance is tracked in `templates/kanji_card_field_source_contract.json`, and N4 card-field source provenance is tracked in `templates/kanji_card_field_source_contracts/n4.json`. `product:artifacts:kanji:preflight` runs that check across N5 through N1 and fails closed where the governed card-field source contract does not yet cover the level.

`product:artifacts:kanji:n5` and `product:artifacts:kanji:n4` build and validate fresh source-derived kanji TSVs from tracked contracts only. They write artifacts under ignored `out/product-readiness`, validate the kanji note schema header, row count, required learner-facing fields, primary-reading reference membership, and deterministic repeated output, and do not read ignored local `data/` inputs or use network inference.

`product:artifacts:kanji:all` runs the tracked-source kanji TSV artifact gate across N5 through N1. Current expected posture is N5/N4 passing and N3/N2/N1 blocked on missing governed card-field source contracts. `product:artifacts:kanji:release-qa` then blocks release until APKG approval, managed media QA, manual Anki import review, mobile QA, screen-reader QA, and listening QA are recorded.

`data:audit:jlpt:sources` is a read-only taxonomy transparency audit. It computes external source consensus from active voting sources, then compares the current operational contract against that consensus. It reports current contract level, source consensus level, agreement count, publisher-independence count, independent evidence-lineage count, computed textbook consensus, confidence reasons, disagreement sources, confidence, missing/disagreement work-queue counts, source-governance blockers, and whether the current contract matches consensus. It does not move kanji, move words, or change readiness. Use `--governance-strict` while evidence depth is incomplete so CI fails on source-use and storage-governance regressions without pretending taxonomy confidence is complete. Re-run word placement audits after taxonomy confidence is governed and any kanji contract change is proposed.

`data:audit:jlpt:source-inputs` is the read-only source-file preflight for the evidence layer. It checks source status, license status, source integrity pins, row-level kanji/level validity, review status, citations, and evidence references before any ignored local source file can become source evidence. Only `reviewed` rows can become assignments, and those reviewed rows must carry valid levels, citations, and evidence references; blank `needs_review` rows are pending worksheet rows, not source evidence. `tanos_legacy_direct` imports only explicit N1/N4/N5 base files. `tanos_estimated_split` imports only the separated N2/N3 estimated split rows as lower-weight estimated evidence; it is visibly labeled and must not move kanji, move words, or claim final taxonomy confidence by itself. `tanos_frequency_method_notes` explains Tanos estimated-method evidence and does not vote. KANJIDIC2 legacy JLPT old level 2 is retained as N2/N3 range evidence when present, not guessed as exact N2 or N3. `jlptsensei` is restricted manual evidence only: create a blank worksheet, review minimal level judgments with permitted citations and evidence references, pin integrity, and activate intentionally before import.

`data:audit:jlpt:source-levels` reports active source-claimed level deltas and may annotate local non-active source-input review progress, such as `in_review` textbook rows already marked `reviewed`, `blocked`, or `source_access_gap`. Those annotations are operator progress only; they are non-voting and still cannot move kanji, move words, update decks, or change readiness.

`data:normalize:kanjidic2-jlpt` creates the ignored normalized TSV from KANJIDIC2 XML or `.xml.gz` input. `data:import:jlpt:source-input -- --source=kanjidic2_legacy` is dry-run by default and writes source evidence only with `--write` after source-input preflight passes. The import report lists materialized `consensusLevel`, `confidence`, and `agreementScore` shifts for changed kanji before write. These commands do not move kanji, move words, update decks, or change readiness.

`data:build:kanji-reading-reference` creates the tracked KANJIDIC2 reading-reference contract from ignored local `downloads/kanjidic2.xml.gz`. The output records the raw source SHA-256, KANJIDIC2 database version, included reading types, source-use boundary, and coverage counts. It is reading-reference evidence only; it does not move kanji, verify full card fields, certify cards, or change readiness.

`data:build:kanji-field-source-contract -- --level=<level>` creates a tracked per-level kanji card-field source contract from current-standard Platinum `japanese-source` evidence. N5 uses the legacy path `templates/kanji_card_field_source_contract.json`; other levels use `templates/kanji_card_field_source_contracts/n<level>.json`. The command reads kanji Obsidian proof through the scoped proof-provider path, defaulting to canonical JSONL for migrated levels; levels without a scoped ledger still fall back through the provider path until migrated. The output records field values, manual field-bound citations, source IDs, source-origin independence context, rereview binding, and coverage counts. It is `kanji-field-verification` evidence only; it does not move kanji, bulk-copy restricted source data, generate decks, certify Obsidian proof, or change readiness.

`data:normalize:tanos-jlpt-kanji` creates the ignored normalized TSV from local Tanos source files. The default lane normalizes only N1/N4/N5 direct legacy base files for `tanos_legacy_direct`; `-- --lane=estimated-split` normalizes only extracted N2/N3 PDF text for `tanos_estimated_split`. `data:import:jlpt:source-input -- --source=tanos_legacy_direct` and `-- --source=tanos_estimated_split` are dry-run by default and write source evidence only with `--write` after source-input preflight passes. The import report lists materialized `consensusLevel`, `confidence`, and `agreementScore` shifts for changed kanji before write. These commands do not move kanji, move words, update decks, or change readiness.

`data:template:jlpt:source-input` creates an ignored manual-review worksheet for one selected source lane, including `jlptsensei` and Japanese-published textbook inputs. Empty worksheet rows are not evidence. A row becomes importable only after the reviewer records a permitted level judgment, citation, evidence reference, source-input integrity pins, and explicit source activation. Source inputs may declare `supportedLevels`; source-review worklists use that to avoid rows outside the source's verified level coverage. `data:template:jlpt:textbook-source` remains an alias for the same governed worksheet flow. The derived `japanese_textbook_consensus` source is computed from individual textbook lanes and is not manually imported.

`product:readiness:n5` is the current automated N5 product checkpoint. It runs the JLPT kanji audit, JLPT word audit, governed audio provenance audit, tracked-source N5 word TSV artifact checkpoint, tracked-source N5 kanji TSV artifact checkpoint, N5 word-level placement audit, N5 kanji Gold regression, and N5 word Gold regression. It currently passes. The word placement audit distinguishes rows without a current-level anchor from later all-easier-kanji placements without explicit learner-fit rationale. It does not certify Platinum, replace the all-level tracked-source kanji gate, approve fresh `.apkg` product artifacts, manual Anki import review, mobile QA, screen-reader QA, listening QA, or governed JLPT kanji source consensus.

`release:gate` validates smoke-fixture artifacts and packaging contracts. It does not certify public product deck readiness. Add level-specific review commands for the deck being shipped, including `npm run deck:words:review:n5` for an N5 word release.

For additional unverified kanji decks, also run `npm run deck:kanji:additional:ready`, every applicable `npm run deck:kanji:additional:review:n*` command, every applicable `npm run deck:kanji:additional:platinum:n*` command, and `npm run deck:kanji:review-status`. Duplicate additional source claims and source claims for already-core kanji must be suppressed or resolved before any optional additional deck is shipped.

For a version 1 locked release, also run the applicable platinum gate after the platinum manifest is populated and current-standard revalidated:

```bash
npm run deck:platinum:n5
npm run deck:words:level-anchor-audit -- --level=5
npm run deck:words:platinum:n5
npm run deck:words:platinum:n4
npm run deck:words:obsidian:rereview-status -- --levels=5,4
npm run deck:words:platinum:source-posture -- --levels=5,4
npm run deck:platinum:governance-gate
```

## What still requires manual review

Manual review is required for:

- listening review in Anki
- keyboard-only card navigation
- screen-reader behavior
- zoom / resized text behavior
- mobile readability
- editorial judgment
