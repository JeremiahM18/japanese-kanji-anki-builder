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

For active word platinum, `japanese-source` evidence must cite a non-generated Japanese-language or dictionary source. Generated output, golden expectations, tracked starter templates, ignored local data, and local caches are internal evidence only; they do not satisfy Japanese-source verification by themselves.

For active word platinum, the reviewed word level must follow the word-level placement policy: the highest-numbered known JLPT kanji level in the written word is the earliest default anchor, no word may ship in an easier/higher-numbered level than that anchor, and later/harder placement requires an explicit learner-fit rationale.

## Kanji deck exit criteria

A kanji level ships only when all criteria are true:

- Canonical JLPT taxonomy is governed by tracked contracts.
- JLPT kanji taxonomy has passing independent source-evidence consensus before deck movement or release claims depend on level placement.
- Golden review coverage for that shipped level is complete.
- Platinum review is complete for the shipped kanji level. Golden review protects the export surface; platinum review decides whether each card deserves to ship.
- Exported cards preserve the individual-kanji learning contract: `DisplayWord` equals the target kanji, `PrimaryReading` is the most learner-useful level-appropriate reading, `MeaningJP` is the meaning associated with that primary reading, `KanjiMeanings` carries broader kanji meanings, curated `blockedMeanings` suppresses low-value dictionary glosses, and compound words do not replace the card anchor.
- `npm run deck:ready -- --levels=<level>` passes with `0` export fallback issues.
- Exported card media completeness is `100%` for the single learner-facing looping stroke-order field and audio field.
- Stroke-order animation coverage is `100%`.
- Stroke-order provenance is audited from approved sources. Stroke-sequence correctness is a human visual-review responsibility and must be recorded in platinum evidence.
- Audio is governed, audited, review-clean, and exact for the exported target kanji plus primary reading.
- Accessibility review has no unresolved blocker.

## Word deck exit criteria

A word level ships only when all criteria are true:

- Canonical word contract rows are fully built for the level.
- Platinum review is complete for the shipped word level. Golden review protects the export surface; platinum review decides whether each card deserves to ship.
- Word-level placement audit passes for the shipped word level.
- No standalone wrong-level cards ship in the deck.
- Constituent kanji are visibly labeled with JLPT level or outside-JLPT status.
- Reading coverage is reported honestly against the selected word-product level scope, including whether a target is covered by an earlier, same-level, or harder selected deck.
- `ReadingBreakdown`, `CoversReading`, and `KanjiBreakdown` agree: safe per-kanji ruby can drive constituent readings, but whole-word ruby is labeled as word-level reading and is not counted as per-kanji coverage.
- Active triage is either resolved or intentionally deferred.
- Sentence orthography review has no unresolved blocker.
- Any shipped audio is governed, audited, and review-clean.
- Pitch accent is governed and source-verified. A non-empty pitch field is not enough; the rendered contour must match the tracked source pattern, and that source entry must match the shipped written word and reading.
- Accessibility review has no unresolved blocker.

## Current product posture

- N5 kanji: golden-reviewed and current local deck readiness passes with complete exported media and exact primary-reading audio; platinum-reviewed at `80/80` active entries under field-bound evidence validation
- N4 kanji: golden-reviewed and current local deck readiness passes with complete exported media and exact primary-reading audio; platinum review has started with `12/176` active entries and remains blocked until the rest of the level is reviewed
- N3 kanji: golden-reviewed and current local deck readiness passes with complete exported media and exact primary-reading audio; platinum not started
- N2 kanji: golden-reviewed and current local deck readiness passes with complete exported media and exact primary-reading audio; platinum not started
- N1 kanji: golden-reviewed at `1231/1231`; current local deck readiness passes with complete exported media and exact primary-reading audio; platinum not started
- JLPT kanji source evidence: governed separately from the operational taxonomy with tracked source tiers, publisher-independence groups, evidence lineages, range evidence, and confidence reasons. `current_operational_contract` is a non-voting comparator only. `kanjidic2_legacy` is pinned and imported as one active external evidence source with `1479` reviewed exact assignments and `0` current range rows; future regeneration preserves old level 2 as N2/N3 range evidence instead of guessing exact placement. `tanos_legacy_direct` is pinned and imported as one active direct legacy source with `1478` reviewed N1/N4/N5 assignments. `tanos_estimated_split` is pinned and imported as an active lower-weight estimated source with `734` reviewed N2/N3 assignments, separate from direct legacy evidence, and must not settle taxonomy movement by itself. `tanos_frequency_method_notes` is an active, non-voting method lane that explains why Tanos N2/N3 assignments are estimated. `official_jlpt_sample_workbooks` is active occurrence-only evidence and cannot assign or move kanji. `jlptsensei` is a registered restricted manual-review source lane; do not scrape, copy, or republish JLPT Sensei list content. Japanese-published textbook evidence is split into individual manual-citation source lanes: `shin_kanzen_master_kanji` is active with `288` reviewed assignments and `316` non-importing `source_access_gap` rows, `nihongo_sou_matome_kanji` is active with `408` reviewed assignments and `450` non-importing `source_access_gap` rows, `ask_hajimete_jlpt_kanji` is active with `208` reviewed assignments from pinned official N1/N3 target-entry and index pages plus exact N2 and N5 checklist pages, and `try_jlpt_textbook` is blocked from assignment consensus under current source access because official public TRY materials expose grammar/vocabulary surfaces, not exact per-kanji assignment proof. `japanese_textbook_consensus` is a derived non-voting summary computed from those lanes. Tanos direct legacy and KANJIDIC2 legacy have different publisher-independence groups but share the `pre_2010_direct_jlpt` evidence lineage, so they do not satisfy the independent-lineage requirement by themselves. The current audit is still expected to fail evidence depth until additional independent evidence-lineage and Japanese-published source evidence are populated and reviewed, even when source-use governance is clean. Ignored source files must pass `data:audit:jlpt:source-inputs` with pinned integrity before their assignments are imported.
- N5 word: expanded to `331` governed rows, but current word-level placement audit fails with `46/331` N5 rows placed earlier than their kanji anchor allows; old golden/platinum passes are not release approval under the current policy
- N4 word: expanded to `535` governed rows, but current word-level placement audit fails with `92/535` N4 rows missing explicit learner-fit reasons for later placement; N4 word golden/platinum readiness is blocked until those rows are moved or documented with reviewed learner-fit rationale

## Required gates before shipping

Minimum automated gate:

```bash
npm test
npm run lint
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

`data:audit:jlpt:source-levels` reports active source-claimed level deltas and may annotate local non-active source-input review progress, such as `in_review` textbook rows already marked `reviewed` or `blocked`. Those annotations are operator progress only; they are non-voting and still cannot move kanji, move words, update decks, or change readiness.

`data:normalize:kanjidic2-jlpt` creates the ignored normalized TSV from KANJIDIC2 XML or `.xml.gz` input. `data:import:jlpt:source-input -- --source=kanjidic2_legacy` is dry-run by default and writes source evidence only with `--write` after source-input preflight passes. The import report lists materialized `consensusLevel`, `confidence`, and `agreementScore` shifts for changed kanji before write. These commands do not move kanji, move words, update decks, or change readiness.

`data:normalize:tanos-jlpt-kanji` creates the ignored normalized TSV from local Tanos source files. The default lane normalizes only N1/N4/N5 direct legacy base files for `tanos_legacy_direct`; `-- --lane=estimated-split` normalizes only extracted N2/N3 PDF text for `tanos_estimated_split`. `data:import:jlpt:source-input -- --source=tanos_legacy_direct` and `-- --source=tanos_estimated_split` are dry-run by default and write source evidence only with `--write` after source-input preflight passes. The import report lists materialized `consensusLevel`, `confidence`, and `agreementScore` shifts for changed kanji before write. These commands do not move kanji, move words, update decks, or change readiness.

`data:template:jlpt:source-input` creates an ignored manual-review worksheet for one selected source lane, including `jlptsensei` and Japanese-published textbook inputs. Empty worksheet rows are not evidence. A row becomes importable only after the reviewer records a permitted level judgment, citation, evidence reference, source-input integrity pins, and explicit source activation. Source inputs may declare `supportedLevels`; source-review worklists use that to avoid rows outside the source's verified level coverage. `data:template:jlpt:textbook-source` remains an alias for the same governed worksheet flow. The derived `japanese_textbook_consensus` source is computed from individual textbook lanes and is not manually imported.

`product:readiness:n5` is the current automated N5 product checkpoint. It runs the JLPT kanji audit, JLPT word audit, governed audio provenance audit, tracked-source N5 word TSV artifact checkpoint, N5 kanji golden review, and N5 word golden review. It must not be used to claim N5 word release readiness while `npm run deck:words:level-anchor-audit -- --level=5` fails. The word placement audit distinguishes rows placed too early from rows placed later without explicit learner-fit rationale. It does not certify platinum review, tracked-source kanji TSVs, fresh `.apkg` product artifacts, manual Anki import review, mobile QA, screen-reader QA, listening QA, or governed JLPT kanji source consensus.

`release:gate` validates smoke-fixture artifacts and packaging contracts. It does not certify public product deck readiness. Add level-specific review commands for the deck being shipped, including `npm run deck:words:review:n5` for an N5 word release.

For a version 1 locked release, also run the applicable platinum gate after the platinum manifest is populated:

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
