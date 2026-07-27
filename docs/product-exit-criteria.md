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

Candidate queues, Silver, Gold, Sapphire, Platinum, Obsidian, and Deck Ready are separate concepts. Candidate is pre-trust workflow input, not a certification tier. Deck Ready is a mechanical artifact state, not a trust tier.

| Layer | Role in the product |
| --- | --- |
| Candidate | Proposed source, card, expansion, migration, or triage work. It may start investigation, but it does not prove generated surface, review, or release relevance. |
| Silver | Generated card surface exists and can be inspected. It does not prove reviewed content, source truth, or release quality. |
| Gold | Protects generated card output from regression. It checks learner-facing fields against the current governed contract. |
| Sapphire | Gates current structural requirements. It requires field identity, evidence-lane separation, internal check records, media identity fields, required support artifacts such as NLP where the workflow calls for them, explicit limitations, and a keep/fix/defer/remove decision. Core kanji uses native Sapphire manifests and `deck:sapphire:*`; words use native Sapphire manifests and `deck:words:sapphire:*`; additional surfaces still retain compatibility command names until migrated. |
| Platinum | Gates current card-surface inspection. It records governed review of learner-facing reading, meaning, example, notes/support surface, media identity, level/product fit, evidence boundaries, limitations, and final keep/fix/defer/remove judgment under the current Platinum schema. |
| Obsidian | Certifies explicit non-mechanical current-version native/fluent-quality rereview proof for the live card and is the repository's current non-human governed content-certification proof lane for a scoped version. |

Gold coverage is required before a level can be trusted for ongoing work. Sapphire coverage is required before a level can be structurally locked, and Sapphire requires matching passing Gold. Platinum requires matching passing Gold, active current-standard Sapphire, and the live card surface passing the Platinum gate. Obsidian proof is required before claiming substantive current-version certification. Gold-reviewed and Deck Ready do not mean release-ready.

For a scoped release, "content-certified" means the relevant Obsidian certification gate passes against the generated denominator and the canonical proof ledger reconciles. Obsidian itself must check natural Japanese, sense and translation fit, learner usefulness, level fit, reading/example quality, evidence, limitations, and release-quality content. Release artifact QA then proves import, render, media, accessibility, listening, and distribution evidence; a discovered content defect reopens Sapphire, Platinum, and Obsidian before release.

Future human or native/fluent review can be recorded as human-reviewed provenance for the same Obsidian standard. It is not a different content standard.

Sapphire evidence must name the specific card, exported reading, and learner-facing values being verified. A broad statement that a field was reviewed is not enough.

When a real review attempt cannot verify a non-core or externally unavailable facet, record the limitation instead of silently blocking or pretending verification. The card may ship only if the unresolved facet is visibly labeled or documented, governed provenance is present, and the remaining card is accurate and learner-safe. Core written form, reading, meaning, example correctness, and product-fit uncertainty still require fix, defer, or remove.

Kanji Sapphire limitations must be structured in `verificationLimitations`, visible in the affected card surface, and countable by level. They are allowed only for non-core facets; uncertainty about the target kanji, displayed reading, meaning, example correctness, or product fit remains a blocker.

Word Sapphire limitations must be structured in `verificationLimitations`, visible in the affected word card `Notes` surface, and countable in the word Sapphire report. They are allowed only for non-core facets; uncertainty about written form, reading, meaning, example correctness, or product fit remains a blocker.

Core kanji Sapphire coverage must use the current versioned standard `kanji-sapphire-v1-evidence-lanes`. Legacy or unversioned kanji review history must not count as active Sapphire coverage. It is useful context, but it is not current version structural lock evidence until revalidated with the required Sapphire structural fields and separated evidence lanes. Kanji Platinum must use `kanji-platinum-v3-evidence-lanes`.

For active word Sapphire, `japanese-source` evidence must cite a source registered in `templates/platinum_card_source_manifest.json` for `word-field-verification`. Generated output, Gold regression expectations, tracked starter templates, ignored local data, source-claim lists, and local caches are internal evidence only; they do not satisfy Japanese-source verification by themselves. One-kanji word cards may use a registered `single-kanji-word-field-verification` source.

Word Sapphire coverage must use the current versioned standard `word-sapphire-v1-evidence-lanes`. Legacy or unversioned active entries are useful review history, but they are not current version structural lock evidence until revalidated with the required Sapphire structural fields and separated evidence lanes. Word Platinum must use `word-platinum-v3-evidence-lanes`.

For active word Sapphire, the reviewed word level must follow the word-level placement policy: a word is anchored by kanji from its own deck level, support kanji from any other level must be visibly labeled, all-easier-kanji words may ship later only with an explicit learner-fit rationale, and words with no current-level anchor must not ship earlier than their harder support kanji justify.

For active core-kanji Sapphire, `japanese-source` evidence must cite a source registered for `kanji-field-verification` for the card's target kanji, exported primary reading, primary meaning, and broader meanings. This verifies card-field accuracy only. It does not certify JLPT placement or source-governance confidence, and it does not require a different source from word-card review when the same source accurately supports both products. When source-governance origins exist for the kanji-level claim, Sapphire rejects card-field verification that comes only from the same source family.

## Kanji deck exit criteria

A kanji level ships only when all criteria are true:

- Canonical JLPT taxonomy is governed by tracked contracts.
- JLPT kanji taxonomy has passing independent source-evidence consensus before deck movement or release claims depend on level placement.
- Gold regression coverage for that shipped level is complete.
- Sapphire coverage is complete for the shipped kanji level under the current versioned standard. Gold protects the export surface; Sapphire gates current structural requirements.
- Platinum card-surface inspection is complete for the shipped kanji level.
- Obsidian content certification passes for the shipped kanji level, unless the release is explicitly labeled as a non-certified preview.
- Exported cards preserve the individual-kanji learning contract: `DisplayWord` equals the target kanji, `PrimaryReading` is the most learner-useful level-appropriate reading, `MeaningJP` is the meaning associated with that primary reading, `KanjiMeanings` carries broader kanji meanings, curated `blockedMeanings` suppresses low-value dictionary glosses, and compound words do not replace the card anchor.
- `npm run deck:ready -- --levels=<level>` passes with `0` export fallback issues.
- Exported card media completeness is `100%` for the single learner-facing looping stroke-order field and audio field.
- Stroke-order animation coverage is `100%`.
- Stroke-order provenance is audited from approved sources. Stroke-sequence correctness is a human visual-review responsibility and must be recorded in Sapphire evidence for core kanji or compatibility evidence for unmigrated surfaces.
- Audio is governed, audited, review-clean, and exact for the exported target kanji plus primary reading.
- Accessibility review has no unresolved blocker.

Additional kanji is currently a source-claim diagnostic with `0` physical cards, not an extra learner backlog or core taxonomy movement. Optional `additional_unverified_Nx` cards may exist only when a genuinely selected non-core candidate is generated. The default build must suppress duplicate additional source claims and source claims for kanji already present in core decks unless an explicit governed variant-selection build is requested. Additional Gold and compatibility structural gates protect only generated optional additional output; they do not move the core JLPT contract, certify source-evidence confidence, or satisfy core Sapphire coverage.

## Word deck exit criteria

A word level ships only when all criteria are true:

- Canonical word contract rows are fully built for the level.
- Native Sapphire coverage is complete for the shipped word level under the current versioned standard. Gold protects the export surface; Sapphire gates current structural requirements.
- Platinum card-surface inspection is complete for the shipped word level.
- Obsidian content certification passes for the shipped word level, unless the release is explicitly labeled as a non-certified preview.
- Word-level placement audit passes for the shipped word level.
- No word cards ship outside the governed word-level contract and source policy; standalone kanji written forms are allowed when the word identity is governed, and cross-level/outside-level kanji are explicitly labeled on the card.
- Constituent kanji are visibly labeled with JLPT level or outside-JLPT status.
- Reading coverage is reported honestly against the selected word-product level scope, including whether a target is covered by an earlier, same-level, or harder selected deck.
- `ReadingBreakdown`, `CoversReading`, and `KanjiBreakdown` agree: safe per-kanji ruby can drive constituent readings, but whole-word ruby is labeled as word-level reading and is not counted as per-kanji coverage.
- Active triage is either resolved or intentionally deferred.
- Sentence orthography review has no unresolved blocker.
- Any shipped audio is governed, audited, and review-clean.
- Pitch accent is governed and source-matched when dictionary-backed. Generated pitch guidance may ship only when governed provenance is present and the rendered card visibly labels it as unverified; a non-empty pitch field is not enough, and source/render or identity mismatches still block readiness.
- Accessibility review has no unresolved blocker.

## Current product posture

- N5 kanji: Obsidian-certified at `80/80` with explicit non-mechanical rereview proof; generated media/readiness and lower-lane prerequisites pass for the scoped card identities
- N4 kanji: Obsidian-certified at `212/212` with `0` active verification limitations and `0` remaining core N4 structural gaps; generated media/readiness and lower-lane prerequisites pass for the scoped card identities
- N3 kanji: Obsidian-certified at `341/341`, with `0` compatibility entries needing substantive Obsidian proof and `0` generated rows needing structural coverage; generated media/readiness and lower-lane prerequisites pass for the scoped card identities
- N2 kanji: Obsidian-certified at `349/349` current-standard entries with `0` remaining and `0` blocked/failing; generated media/readiness and lower-lane prerequisites pass for the scoped card identities
- N1 kanji: Gold-reviewed at `1230/1230`; current local deck readiness passes as a mechanical generated-artifact and media signal only, not content trust or release approval; trusted current-standard native Sapphire coverage is `328/1230`; current-standard Platinum card-surface inspection is `328/1230`; trusted canonical Obsidian proof remains reset to `0/1230`; and `902` generated rows require fresh actual card-data Sapphire and Platinum review before any Obsidian proof is recorded
- Additional kanji source-claim diagnostic: there are currently `0` selected physical additional cards. Current `deck:kanji:additional:ready` and `deck:kanji:review-status` pass with all additional generated/Gold/compatibility structural counts at `0/0`, `398` suppressed additional source claims, `387` core-retained source-claim kanji, `11` duplicate additional-source kanji tracked in the report, and `0` unresolved duplicate kanji. Source-claim evidence remains in the governed source manifests and does not require duplicate Anki cards.
- Kanji Obsidian provenance: `deck:kanji:obsidian:rereview-status -- --levels=5,4,3,2` currently reports N5/N4/N3/N2 combined `982/982` Obsidian certified, `0/982` compatibility entries needing Obsidian, and `0/982` blocked/failing; lower-lane prerequisites are complete for that scoped proof. The missing-proof marker is `missing_substantive_current_standard_rereview_proof`; `revalidatedAt`, lane-valid `current-standard-review` text, and assistive NLP signals are not treated as standalone proof of substantive post-v3 Obsidian rereview.
- Kanji Obsidian certification gate: `deck:kanji:obsidian:certify-status -- --levels=5,4,3,2` currently passes for the full N5/N4/N3/N2 kanji denominator. The gate fails on any `blocked_or_failing` or `needs_substantive_rereview` row and reports each failed card with field, expected, actual, evidence lane, and reviewer action. Obsidian proof must include structured rereview provenance plus actual example-sentence review evidence for naturalness, learner usefulness, level fit, support-only usage, reading, and translation; mechanical automation verifies presence/binding, while the Obsidian lane owns the native/fluent-quality language and pedagogy judgment.
- JLPT kanji source evidence: governed separately from the operational taxonomy with tracked source tiers, publisher-independence groups, evidence lineages, range evidence, and confidence reasons. `current_operational_contract` is a non-voting comparator only. `kanjidic2_legacy` is pinned and imported as one active external evidence source with `1479` reviewed exact assignments and `0` current range rows; future regeneration preserves old level 2 as N2/N3 range evidence instead of guessing exact placement. The separate `kanjidic2_reading_reference` lane is a tracked KANJIDIC2 CC BY-SA 4.0 on/kun reading-reference contract covering `2212/2212` operational JLPT kanji; it is not JLPT placement evidence, full kanji-card field verification, or release certification. `tanos_legacy_direct` is pinned and imported as one active direct legacy source with `1478` reviewed N1/N4/N5 assignments. `tanos_estimated_split` is pinned and imported as an active lower-weight estimated source with `734` reviewed N2/N3 assignments, separate from direct legacy evidence, and must not settle taxonomy movement by itself. `tanos_frequency_method_notes` is an active, non-voting method lane that explains why Tanos N2/N3 assignments are estimated. `official_jlpt_sample_workbooks` is active occurrence-only evidence and cannot assign or move kanji. Japanese-published textbook evidence is split into individual manual-citation source lanes: `ask_hajimete_jlpt_kanji` is active with `208` reviewed assignments, `0` non-importing `source_access_gap` rows, and `0` pending rows from pinned official N1/N3 target-entry and index pages plus exact N2 and N5 checklist pages, `shin_kanzen_master_kanji` is active with `406` reviewed assignments, `236` non-importing `source_access_gap` rows, and `1570` pending rows, and `nihongo_sou_matome_kanji` is active with `442` reviewed assignments, `473` non-importing `source_access_gap` rows, and `1297` pending rows; pause broad Sou review until fuller exact assignment access or targeted citations are available. `try_jlpt_textbook` is blocked unless exact per-kanji assignment proof is found. `japanese_textbook_consensus` is a derived non-voting summary computed from individual textbook lanes. `joyo_grade` and `kanji_alive` are background metadata only, `bccwj_frequency` is frequency sanity only, `jpdb` is restricted manual frequency sanity only after source-use review, `kanshudo` and `wanikani` are restricted and blocked until governed use paths are approved, and `jlptsensei` is a secondary non-Japanese manual-citation signal only after Japanese-published evidence is no longer the dominant blocker. Tanos direct legacy and KANJIDIC2 legacy have different publisher-independence groups but share the `pre_2010_direct_jlpt` evidence lineage, so they do not satisfy the independent-lineage requirement by themselves. The current audit is still expected to fail evidence depth until additional independent evidence-lineage and Japanese-published source evidence are populated and reviewed, even when source-use governance is clean. Ignored source files must pass `data:audit:jlpt:source-inputs` with pinned integrity before their assignments are imported.
- Non-disputed source consensus can be promoted only by an explicit governed contract migration. The source audit remains an evidence-depth gate and does not itself generate decks or release approval.
- N5 word: current word Obsidian v2.5 non-human governed native/fluent-quality content certification covers `588/588` current generated rows under the strict sentence-audio standard. N5 Gold, Sapphire, and current-standard Platinum are complete at `588/588`; no N5 rows remain in the current v2.5 Obsidian backlog. Word-level placement, tracked-source artifact, automated readiness, and lower-lane prerequisites pass for the certified v2.5 scope; no N5 source-only phrase exclusions remain in the tracked word contract; current live readiness is `ready_with_deferred_variants`, reading coverage is `245/344` (`71.2%`), and release artifact QA, accessibility, and listening checks are still required before release-ready product claims.
- N4 word: current word Obsidian v2.5 non-human governed native/fluent-quality content certification covers `0/1034` current generated rows. Gold and current-standard Sapphire are complete at `1034/1034`; current-standard Platinum is `740/1034`, leaving `294` rows in the expected Platinum backlog. The `700` older N4 Obsidian proof targets are legacy history, not current v2.5 certification; all `740` Platinum-passing rows still need separate Obsidian v2.5 proof. Current live readiness is `ready_with_deferred_variants`, reading coverage is `581/755` (`77.0%`), and the active reading backlog is clear; remaining reading items are deferred variants or low learner-value gaps. N4 word still needs release artifact QA, accessibility, and listening checks before release-ready product claims.
- Word Obsidian provenance: `deck:words:obsidian:rereview-status -- --levels=5,4` currently reports N5/N4 combined `588/1622` current word Obsidian v2.5-certified for current generated rows, with `740` Platinum-passing N4 rows still needing Obsidian v2.5 and `294` N4 rows blocked only on Platinum before downstream proof. N4 Gold and current-standard Sapphire are complete at `1034/1034`. Legacy word Obsidian proof history remains audit-visible at `1118` N5/N4 targets and `1706` raw ledger events; `418` older same-target proof events are superseded by current v2.5 proof. The generated-row denominator is the square-zero Obsidian denominator; legacy proof history, `revalidatedAt`, lane-valid `current-standard-review` text, and loose textual markers are not treated as standalone proof of current Obsidian v2.5 rereview. Word Obsidian proof must be structured, exact word-reading-card-bound, backed by a full evidence checklist plus actual example-sentence quality review evidence, and backed by exact example-sentence audio proof.
- Word Obsidian certification gate: `deck:words:obsidian:certify-status -- --levels=5,4` is expected to fail for the current full N5/N4 generated denominator until the `740` N4 Platinum-passing rows complete Obsidian v2.5 proof and the remaining `294` N4 rows complete Platinum and then Obsidian. N5 alone now passes current v2.5 certification. The gate fails on any `blocked_or_failing` or `needs_substantive_rereview` row and reports each failed card with field, expected, actual, evidence lane, and reviewer action.
- Word Platinum source posture: `deck:words:platinum:source-posture -- --levels=5,4` currently inspects structurally current-standard word entries for card-field source-family posture. Source-family posture is not the rereview selection pool and not substantive Platinum proof. Single-source-family entries remain structurally governed but must not be described as independently corroborated; the searchable marker is `word_source_independence_not_proven`. Word source-claim origin and vocabulary-universe adequacy are now owned by `deck:words:source-adequacy -- --governance-strict`; the expected starting posture is source-depth incomplete until reviewed independent source families and permitted learner-source evidence reach `level_universe_standard`.
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
npm run deck:review:accessibility -- --deck-kind=kanji --levels=<levels> --run-id=<release-candidate-id>
npm run deck:review:accessibility -- --deck-kind=word --levels=<levels> --run-id=<release-candidate-id>
npm run deck:kanji:review-status
npm run deck:words:level-anchor-audit -- --level=5
npm run product:artifacts:n5
npm run product:artifacts:kanji:n5:preflight
npm run product:artifacts:kanji:n5
npm run product:artifacts:kanji:n4:preflight
npm run product:artifacts:kanji:n4
npm run product:artifacts:kanji:n3:preflight
npm run product:artifacts:kanji:n3
npm run product:artifacts:kanji:all
npm run product:artifacts:kanji:release-qa
npm run product:release-qa:evidence
npm run product:readiness:n5
npm run release:gate
```

`product:artifacts:n5` validates fresh N5 word TSV generation from tracked templates only. It excludes ignored local word, sentence, JLPT, cache, and media inputs, disables network inference, checks the word schema header, verifies canonical N5 row counts, rejects curated-only and inferred-only shipped rows, and repeats the build to prove deterministic output. It does not certify tracked-source kanji TSVs, fresh `.apkg` artifacts, managed media packaging, or manual QA.

`product:artifacts:kanji:n5:preflight`, `product:artifacts:kanji:n4:preflight`, and `product:artifacts:kanji:n3:preflight` report whether tracked templates are sufficient for N5, N4, or N3 kanji TSV source availability without ignored local `data/` inputs. They currently report `certifiable: yes` for source availability because component/radical source data is tracked in `templates/kanji_component_contract.json`, on/kun reading reference data is tracked in `templates/kanji_reading_reference_contract.json`, N5 card-field source provenance is tracked in `templates/kanji_card_field_source_contract.json`, and N4/N3 card-field source provenance is tracked in `templates/kanji_card_field_source_contracts/`. `product:artifacts:kanji:preflight` runs that check across N5 through N1 and fails closed where the governed card-field source contract does not yet cover the level.

`product:artifacts:kanji:n5`, `product:artifacts:kanji:n4`, and `product:artifacts:kanji:n3` build and validate fresh source-derived kanji TSVs from tracked contracts only. They write artifacts under ignored `out/product-readiness`, validate the kanji note schema header, row count, required learner-facing fields, primary-reading reference membership, and deterministic repeated output, and do not read ignored local `data/` inputs or use network inference.

`product:artifacts:kanji:all` runs the tracked-source kanji TSV artifact gate across N5 through N1. Current expected posture is N5/N4/N3 passing and N2/N1 blocked on missing governed card-field source contracts. `product:artifacts:kanji:release-qa` then blocks release until APKG approval, managed media QA, manual Anki import review, mobile QA, screen-reader QA, and listening QA are recorded. Run the accessibility command with the candidate's exact `--run-id` and per-deck `--levels` so it cannot read a shared or different build root. `product:release-qa:evidence` validates packet version 2 and fails unless its full lowercase candidate commit equals current Git HEAD, every scoped deck kind has exactly one APKG declaring its own canonical level list under the matching candidate run-output scope with matching byte size and SHA-256, all manual QA entries are passed, source-governance non-voting lanes remain non-voting, accepted `GOV-SRC-001` posture is recorded while source evidence depth remains incomplete, and known blockers are empty.

`data:audit:jlpt:sources` is a read-only taxonomy transparency audit. It computes external source consensus from active voting sources, then compares the current operational contract against that consensus. It reports current contract level, source consensus level, agreement count, publisher-independence count, independent evidence-lineage count, computed textbook consensus, confidence reasons, disagreement sources, confidence, missing/disagreement work-queue counts, source-governance blockers, and whether the current contract matches consensus. It does not move kanji, move words, or change readiness. Use `--governance-strict` while evidence depth is incomplete so CI fails on source-use and storage-governance regressions without pretending taxonomy confidence is complete. Re-run word placement audits after taxonomy confidence is governed and any kanji contract change is proposed.

`data:audit:jlpt:source-inputs` is the read-only source-file preflight for the evidence layer. It checks source status, license status, source integrity pins, row-level kanji/level validity, review status, citations, and evidence references before any ignored local source file can become source evidence. Only `reviewed` rows can become assignments, and those reviewed rows must carry valid levels, citations, and evidence references; blank `needs_review` rows are pending worksheet rows, not source evidence. `tanos_legacy_direct` imports only explicit N1/N4/N5 base files. `tanos_estimated_split` imports only the separated N2/N3 estimated split rows as lower-weight estimated evidence; it is visibly labeled and must not move kanji, move words, or claim final taxonomy confidence by itself. `tanos_frequency_method_notes` explains Tanos estimated-method evidence and does not vote. KANJIDIC2 legacy JLPT old level 2 is retained as N2/N3 range evidence when present, not guessed as exact N2 or N3. `jlptsensei` is restricted manual evidence only: create a blank worksheet, review minimal level judgments with permitted citations and evidence references, pin integrity, and activate intentionally before import.

`data:audit:jlpt:source-levels` reports active source-claimed level deltas and may annotate local non-active source-input review progress, such as `in_review` textbook rows already marked `reviewed`, `blocked`, or `source_access_gap`. Those annotations are operator progress only; they are non-voting and still cannot move kanji, move words, update decks, or change readiness.

`data:normalize:kanjidic2-jlpt` creates the ignored normalized TSV from KANJIDIC2 XML or `.xml.gz` input. `data:import:jlpt:source-input -- --source=kanjidic2_legacy` is dry-run by default and writes source evidence only with `--write` after source-input preflight passes. The import report lists materialized `consensusLevel`, `confidence`, and `agreementScore` shifts for changed kanji before write. These commands do not move kanji, move words, update decks, or change readiness.

`data:build:kanji-reading-reference` creates the tracked KANJIDIC2 reading-reference contract from ignored local `downloads/kanjidic2.xml.gz`. The output records the raw source SHA-256, KANJIDIC2 database version, included reading types, source-use boundary, and coverage counts. It is reading-reference evidence only; it does not move kanji, verify full card fields, certify cards, or change readiness.

`data:build:kanji-field-source-contract -- --level=<level>` creates a tracked per-level kanji card-field source contract from current-standard Platinum `japanese-source` evidence. N5 uses the legacy path `templates/kanji_card_field_source_contract.json`; other levels use `templates/kanji_card_field_source_contracts/n<level>.json`. The command reads kanji Obsidian proof through the scoped proof-provider path, defaulting to canonical JSONL for migrated levels; levels without a scoped ledger still fall back through the provider path until migrated. The output records field values, manual field-bound citations, source IDs, source-origin independence context, rereview binding, and coverage counts. It is `kanji-field-verification` evidence only; it does not move kanji, bulk-copy restricted source data, generate decks, certify Obsidian proof, or change readiness.

`data:normalize:tanos-jlpt-kanji` creates the ignored normalized TSV from local Tanos source files. The default lane normalizes only N1/N4/N5 direct legacy base files for `tanos_legacy_direct`; `-- --lane=estimated-split` normalizes only extracted N2/N3 PDF text for `tanos_estimated_split`. `data:import:jlpt:source-input -- --source=tanos_legacy_direct` and `-- --source=tanos_estimated_split` are dry-run by default and write source evidence only with `--write` after source-input preflight passes. The import report lists materialized `consensusLevel`, `confidence`, and `agreementScore` shifts for changed kanji before write. These commands do not move kanji, move words, update decks, or change readiness.

`data:template:jlpt:source-input` creates an ignored manual-review worksheet for one selected source lane, including `jlptsensei` and Japanese-published textbook inputs. Empty worksheet rows are not evidence. A row becomes importable only after the reviewer records a permitted level judgment, citation, evidence reference, source-input integrity pins, and explicit source activation. Source inputs may declare `supportedLevels`; source-review worklists use that to avoid rows outside the source's verified level coverage. `data:template:jlpt:textbook-source` remains an alias for the same governed worksheet flow. The derived `japanese_textbook_consensus` source is computed from individual textbook lanes and is not manually imported.

`product:readiness:n5` is the current automated N5 product checkpoint. It runs the JLPT kanji audit, JLPT word audit, governed audio provenance audit, tracked-source N5 word TSV artifact checkpoint, tracked-source N5 kanji TSV artifact checkpoint, N5 word-level placement audit, N5 kanji Gold regression, and N5 word Gold regression. It currently passes. The word placement audit distinguishes rows without a current-level anchor from later all-easier-kanji placements without explicit learner-fit rationale. It does not certify Platinum, replace the all-level tracked-source kanji gate, approve fresh `.apkg` product artifacts, manual Anki import review, mobile QA, screen-reader QA, listening QA, or governed JLPT kanji source consensus.

`release:gate` validates smoke-fixture artifacts and packaging contracts. It does not certify public product deck readiness. Add level-specific review commands for the deck being shipped, including the matching `npm run deck:words:review:n*`, `npm run deck:words:sapphire:n*`, and `npm run deck:words:platinum:n*` gates when a word level is part of the release scope.

For additional unverified kanji decks, also run `npm run deck:kanji:additional:ready`, every applicable `npm run deck:kanji:additional:review:n*` command, every applicable `npm run deck:kanji:additional:platinum:n*` command, and `npm run deck:kanji:review-status`. Duplicate additional source claims and source claims for already-core kanji must be suppressed or resolved before any optional additional deck is shipped.

For a version 1 locked release, also run the applicable Sapphire gate after the Sapphire manifest is populated and current-standard revalidated:

```bash
npm run deck:sapphire:n5
npm run deck:words:level-anchor-audit -- --level=5
npm run deck:words:sapphire:n5
npm run deck:words:sapphire:n4
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
- release-specific QA evidence packet completion
