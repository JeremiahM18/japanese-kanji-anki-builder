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

Golden review and platinum review are separate gates.

| Layer | Role in the product |
| --- | --- |
| Golden | Protects generated card output from regression. It checks learner-facing fields against the current governed contract. |
| Platinum | Decides whether the card belongs in the version 1 release. It requires field-bound source evidence, explicit quality gates, and a keep/fix/defer/remove decision. |

Golden coverage is required before a level can be trusted for ongoing work. Platinum coverage is required before a level is version-1 locked. Golden-reviewed does not mean release-ready.

Platinum evidence must name the specific card, exported reading, and learner-facing values being verified. A broad statement that a field was reviewed is not enough.

When a real review attempt cannot verify a non-core or externally unavailable facet, record the limitation instead of silently blocking or pretending verification. The card may ship only if the unresolved facet is visibly labeled or documented, governed provenance is present, and the remaining card is accurate and learner-safe. Core written form, reading, meaning, example correctness, and product-fit uncertainty still require fix, defer, or remove.

Kanji platinum limitations must be structured in `verificationLimitations`, visible in the affected card surface, and countable by level. They are allowed only for non-core facets; uncertainty about the target kanji, displayed reading, meaning, example correctness, or product fit remains a blocker.

Word platinum limitations must be structured in `verificationLimitations`, visible in the affected word card `Notes` surface, and countable in the word platinum report. They are allowed only for non-core facets; uncertainty about written form, reading, meaning, example correctness, or product fit remains a blocker.

Kanji platinum release coverage must use the current versioned standard `kanji-platinum-v2-limitation-aware`. Legacy or unversioned active entries are useful review history, but they are not current version 1 lock evidence until revalidated with `reviewStandard`, `revalidatedAt`, and a summary that confirms the generated surface, Japanese-source evidence, example sentence, notes/support surface, audio, stroke-order media, and verification limitations were checked under the current policy.

For active word platinum, `japanese-source` evidence must cite a source registered in `templates/platinum_card_source_manifest.json` for `word-field-verification`. Generated output, golden expectations, tracked starter templates, ignored local data, source-claim lists, and local caches are internal evidence only; they do not satisfy Japanese-source verification by themselves. One-kanji word cards may use a registered `single-kanji-word-field-verification` source.

Word platinum release coverage must use the current versioned standard `word-platinum-v2-limitation-aware`. Legacy or unversioned active entries are useful review history, but they are not current version 1 lock evidence until revalidated with `reviewStandard`, `revalidatedAt`, `notesIncludes`, and a summary that confirms the generated surface, Japanese-source evidence, example sentence, notes/support surface, reading breakdown, labels, audio, pitch accent, media provenance, and verification limitations were checked under the current policy.

For active word platinum, the reviewed word level must follow the word-level placement policy: a word is anchored by kanji from its own deck level, support kanji from any other level must be visibly labeled, all-easier-kanji words may ship later only with an explicit learner-fit rationale, and words with no current-level anchor must not ship earlier than their harder support kanji justify.

For active kanji platinum, `japanese-source` evidence must cite a source registered for `kanji-field-verification` for the card's target kanji, exported primary reading, primary meaning, and broader meanings. This verifies card-field accuracy only. It does not certify JLPT placement or source-governance confidence, and it does not require a different source from word-card review when the same source accurately supports both products. When source-governance origins exist for the kanji-level claim, platinum rejects card-field verification that comes only from the same source family.

## Kanji deck exit criteria

A kanji level ships only when all criteria are true:

- Canonical JLPT taxonomy is governed by tracked contracts.
- JLPT kanji taxonomy has passing independent source-evidence consensus before deck movement or release claims depend on level placement.
- Golden review coverage for that shipped level is complete.
- Platinum review is complete for the shipped kanji level under the current versioned standard. Golden review protects the export surface; platinum review decides whether each card deserves to ship.
- Exported cards preserve the individual-kanji learning contract: `DisplayWord` equals the target kanji, `PrimaryReading` is the most learner-useful level-appropriate reading, `MeaningJP` is the meaning associated with that primary reading, `KanjiMeanings` carries broader kanji meanings, curated `blockedMeanings` suppresses low-value dictionary glosses, and compound words do not replace the card anchor.
- `npm run deck:ready -- --levels=<level>` passes with `0` export fallback issues.
- Exported card media completeness is `100%` for the single learner-facing looping stroke-order field and audio field.
- Stroke-order animation coverage is `100%`.
- Stroke-order provenance is audited from approved sources. Stroke-sequence correctness is a human visual-review responsibility and must be recorded in platinum evidence.
- Audio is governed, audited, review-clean, and exact for the exported target kanji plus primary reading.
- Accessibility review has no unresolved blocker.

Additional unverified kanji decks are separate optional surfaces, not core taxonomy movement. They may be generated only as `additional_unverified_Nx` decks, must suppress duplicate additional source claims or explicitly resolve them, and must pass their own golden review before use. Additional platinum review protects only that optional surface; it does not move the core JLPT contract, certify source-evidence confidence, or satisfy core platinum review.

## Word deck exit criteria

A word level ships only when all criteria are true:

- Canonical word contract rows are fully built for the level.
- Platinum review is complete for the shipped word level under the current versioned standard. Golden review protects the export surface; platinum review decides whether each card deserves to ship.
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

- N5 kanji: golden-reviewed and current local deck readiness passes with complete exported media and exact primary-reading audio; current-standard platinum revalidation passes at `80/80` under `kanji-platinum-v2-limitation-aware`
- N4 kanji: golden-reviewed and current local deck readiness passes with complete exported media and exact primary-reading audio; platinum review has `72/212` active entries, including `30/212` current-standard entries and `42` legacy/unversioned entries, with `140` cards still missing platinum coverage
- N3 kanji: golden-reviewed and current local deck readiness passes with complete exported media and exact primary-reading audio; platinum not started
- N2 kanji: golden-reviewed and current local deck readiness passes with complete exported media and exact primary-reading audio; platinum not started
- N1 kanji: golden-reviewed at `1230/1230`; current local deck readiness passes with complete exported media and exact primary-reading audio; platinum not started
- Additional unverified kanji decks: separate optional `kanji-additional` surface generated from non-disputed source-claim deltas; current `deck:kanji:review-status` passes with generated/golden counts N5 `16/16`, N4 `81/81`, N3 `90/90`, N2 `114/114`, N1 `90/90`; current-standard platinum is N5 `16/16` and all additional decks `16/391`, with N4-N1 additional platinum still open; `15` duplicate-claim kanji remain only in their core deck placement, with `30` duplicate additional claims suppressed
- JLPT kanji source evidence: governed separately from the operational taxonomy with tracked source tiers, publisher-independence groups, evidence lineages, range evidence, and confidence reasons. `current_operational_contract` is a non-voting comparator only. `kanjidic2_legacy` is pinned and imported as one active external evidence source with `1479` reviewed exact assignments and `0` current range rows; future regeneration preserves old level 2 as N2/N3 range evidence instead of guessing exact placement. `tanos_legacy_direct` is pinned and imported as one active direct legacy source with `1478` reviewed N1/N4/N5 assignments. `tanos_estimated_split` is pinned and imported as an active lower-weight estimated source with `734` reviewed N2/N3 assignments, separate from direct legacy evidence, and must not settle taxonomy movement by itself. `tanos_frequency_method_notes` is an active, non-voting method lane that explains why Tanos N2/N3 assignments are estimated. `official_jlpt_sample_workbooks` is active occurrence-only evidence and cannot assign or move kanji. Japanese-published textbook evidence is split into individual manual-citation source lanes: `ask_hajimete_jlpt_kanji` is active with `208` reviewed assignments, `0` non-importing `source_access_gap` rows, and `0` pending rows from pinned official N1/N3 target-entry and index pages plus exact N2 and N5 checklist pages, `shin_kanzen_master_kanji` is active with `406` reviewed assignments, `236` non-importing `source_access_gap` rows, and `1570` pending rows, and `nihongo_sou_matome_kanji` is active with `498` reviewed assignments, `417` non-importing `source_access_gap` rows, and `1297` pending rows; continue targeted Sou review only where exact assignment proof is available. `try_jlpt_textbook` is blocked unless exact per-kanji assignment proof is found. `japanese_textbook_consensus` is a derived non-voting summary computed from individual textbook lanes. `joyo_grade` and `kanji_alive` are background metadata only, `bccwj_frequency` is frequency sanity only, `jpdb` is restricted manual frequency sanity only after source-use review, `kanshudo` and `wanikani` are restricted and blocked until governed use paths are approved, and `jlptsensei` is a secondary non-Japanese manual-citation signal only after Japanese-published evidence is no longer the dominant blocker. Tanos direct legacy and KANJIDIC2 legacy have different publisher-independence groups but share the `pre_2010_direct_jlpt` evidence lineage, so they do not satisfy the independent-lineage requirement by themselves. The current audit is still expected to fail evidence depth until additional independent evidence-lineage and Japanese-published source evidence are populated and reviewed, even when source-use governance is clean. Ignored source files must pass `data:audit:jlpt:source-inputs` with pinned integrity before their assignments are imported.
- Non-disputed source consensus can be promoted only by an explicit governed contract migration. The source audit remains an evidence-depth gate and does not itself generate decks or release approval.
- N5 word: expanded to `287` canonical governed rows plus `20` tracked source-only phrase exclusions; current word-level placement, golden, tracked-source artifact, and automated readiness checks pass. Legacy/unversioned platinum history covers `287/287` only with `--allow-legacy-standard`; current-standard word platinum is `8/287` under `word-platinum-v2-limitation-aware`, with `279` legacy/unversioned active entries still requiring current-standard revalidation before release-ready status
- N4 word: expanded to `667` governed rows and current word-level placement, golden review, and automated card-field/audio/pitch readiness checks pass against the generated N4 surface; N4 word completion is `ready_with_deferred_variants` with the active reading backlog cleared and remaining open reading items explicitly deferred before platinum review, import QA, accessibility, and listening checks

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
npm run product:readiness:n5
npm run release:gate
```

`product:artifacts:n5` validates fresh N5 word TSV generation from tracked templates only. It excludes ignored local word, sentence, JLPT, cache, and media inputs, disables network inference, checks the word schema header, verifies canonical N5 row counts, rejects curated-only and inferred-only shipped rows, and repeats the build to prove deterministic output. It does not yet certify tracked-source kanji TSVs, fresh `.apkg` artifacts, managed media packaging, or manual QA.

`product:artifacts:kanji:n5:preflight` reports whether tracked templates are sufficient to certify fresh N5 kanji TSV generation without ignored local `data/` inputs. It currently reports that certification is blocked because rich kanji readings and rich-source provenance are not tracked release contracts yet. Component/radical source data is tracked in `templates/kanji_component_contract.json`.

`data:audit:jlpt:sources` is a read-only taxonomy transparency audit. It computes external source consensus from active voting sources, then compares the current operational contract against that consensus. It reports current contract level, source consensus level, agreement count, publisher-independence count, independent evidence-lineage count, computed textbook consensus, confidence reasons, disagreement sources, confidence, missing/disagreement work-queue counts, source-governance blockers, and whether the current contract matches consensus. It does not move kanji, move words, or change readiness. Use `--governance-strict` while evidence depth is incomplete so CI fails on source-use and storage-governance regressions without pretending taxonomy confidence is complete. Re-run word placement audits after taxonomy confidence is governed and any kanji contract change is proposed.

`data:audit:jlpt:source-inputs` is the read-only source-file preflight for the evidence layer. It checks source status, license status, source integrity pins, row-level kanji/level validity, review status, citations, and evidence references before any ignored local source file can become source evidence. Only `reviewed` rows can become assignments, and those reviewed rows must carry valid levels, citations, and evidence references; blank `needs_review` rows are pending worksheet rows, not source evidence. `tanos_legacy_direct` imports only explicit N1/N4/N5 base files. `tanos_estimated_split` imports only the separated N2/N3 estimated split rows as lower-weight estimated evidence; it is visibly labeled and must not move kanji, move words, or claim final taxonomy confidence by itself. `tanos_frequency_method_notes` explains Tanos estimated-method evidence and does not vote. KANJIDIC2 legacy JLPT old level 2 is retained as N2/N3 range evidence when present, not guessed as exact N2 or N3. `jlptsensei` is restricted manual evidence only: create a blank worksheet, review minimal level judgments with permitted citations and evidence references, pin integrity, and activate intentionally before import.

`data:audit:jlpt:source-levels` reports active source-claimed level deltas and may annotate local non-active source-input review progress, such as `in_review` textbook rows already marked `reviewed`, `blocked`, or `source_access_gap`. Those annotations are operator progress only; they are non-voting and still cannot move kanji, move words, update decks, or change readiness.

`data:normalize:kanjidic2-jlpt` creates the ignored normalized TSV from KANJIDIC2 XML or `.xml.gz` input. `data:import:jlpt:source-input -- --source=kanjidic2_legacy` is dry-run by default and writes source evidence only with `--write` after source-input preflight passes. The import report lists materialized `consensusLevel`, `confidence`, and `agreementScore` shifts for changed kanji before write. These commands do not move kanji, move words, update decks, or change readiness.

`data:normalize:tanos-jlpt-kanji` creates the ignored normalized TSV from local Tanos source files. The default lane normalizes only N1/N4/N5 direct legacy base files for `tanos_legacy_direct`; `-- --lane=estimated-split` normalizes only extracted N2/N3 PDF text for `tanos_estimated_split`. `data:import:jlpt:source-input -- --source=tanos_legacy_direct` and `-- --source=tanos_estimated_split` are dry-run by default and write source evidence only with `--write` after source-input preflight passes. The import report lists materialized `consensusLevel`, `confidence`, and `agreementScore` shifts for changed kanji before write. These commands do not move kanji, move words, update decks, or change readiness.

`data:template:jlpt:source-input` creates an ignored manual-review worksheet for one selected source lane, including `jlptsensei` and Japanese-published textbook inputs. Empty worksheet rows are not evidence. A row becomes importable only after the reviewer records a permitted level judgment, citation, evidence reference, source-input integrity pins, and explicit source activation. Source inputs may declare `supportedLevels`; source-review worklists use that to avoid rows outside the source's verified level coverage. `data:template:jlpt:textbook-source` remains an alias for the same governed worksheet flow. The derived `japanese_textbook_consensus` source is computed from individual textbook lanes and is not manually imported.

`product:readiness:n5` is the current automated N5 product checkpoint. It runs the JLPT kanji audit, JLPT word audit, governed audio provenance audit, tracked-source N5 word TSV artifact checkpoint, N5 word-level placement audit, N5 kanji golden review, and N5 word golden review. It currently passes. The word placement audit distinguishes rows without a current-level anchor from later all-easier-kanji placements without explicit learner-fit rationale. It does not certify platinum review, tracked-source kanji TSVs, fresh `.apkg` product artifacts, manual Anki import review, mobile QA, screen-reader QA, listening QA, or governed JLPT kanji source consensus.

`release:gate` validates smoke-fixture artifacts and packaging contracts. It does not certify public product deck readiness. Add level-specific review commands for the deck being shipped, including `npm run deck:words:review:n5` for an N5 word release.

For additional unverified kanji decks, also run `npm run deck:kanji:additional:ready`, every applicable `npm run deck:kanji:additional:review:n*` command, and `npm run deck:kanji:review-status`. Duplicate additional source claims must be suppressed or resolved before any optional additional deck is shipped.

For a version 1 locked release, also run the applicable platinum gate after the platinum manifest is populated and current-standard revalidated:

```bash
npm run deck:platinum:n5
npm run deck:words:level-anchor-audit -- --level=5
npm run deck:words:platinum:n5
npm run deck:words:platinum:n4
```

## What still requires manual review

Manual review is required for:

- listening review in Anki
- keyboard-only card navigation
- screen-reader behavior
- zoom / resized text behavior
- mobile readability
- editorial judgment
