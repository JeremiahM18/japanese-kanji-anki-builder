# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Tagged release workflow with artifact checksums and release-policy validation.
- Checked-in branch protection and release process documentation treated as repository contracts.
- Added a `curated:init -- --refresh-starter` workflow for refreshing stale starter-derived local curated kanji entries without overwriting non-starter local edits.
- Added a tracked `jlpt_word_level_contract.json` plus `data:audit:jlpt:words` so learner-facing word-card JLPT labels can prefer canonical word-level truth where the repo has it, instead of relying only on constituent-kanji heuristics.
- Added an explicit `coverage` contract to starter word entries so key N5 study words can track `role`, `focusKanji`, and `coversReadings` directly in data instead of relying only on runtime derivation.
- Added `deck:words:completion:n5`, a combined N5 word audit that reports canonical inventory size, phrase-tagged contract exclusions, starter-eligible rows missing from the built deck, and current reading-coverage totals in one place.

### Changed

- Reclassified `赤い花` and `白い花` as phrase-tagged starter entries so the default N5 word deck contract treats them consistently with other compositional adjective+noun phrases instead of counting them as accidental missing vocab rows.
- Upgraded the learner-facing word-card surface so word decks now expose `CoverageRole`, `FocusKanji`, and `CoversReading`, making it clear whether a card is core JLPT vocabulary, reading-coverage support, or both.
- Tightened word-deck JLPT trust so inferred exploratory rows no longer receive learner-facing JLPT labels by default; exported labels now come only from the canonical word-level contract or an explicit curated JLPT tag.
- Tightened compound breakdown rendering on word cards so learner-facing study focus follows the written kanji order and context-specific reading forms such as `時 （じ）`, `学 （がく）`, `車 （くるま）`, `休 （やすみ）`, and `間 （かん）` survive into the exported card instead of weaker bare defaults.
- Tightened the word reading coverage audit so it now trusts exported `FocusKanji` and `CoversReading` metadata before falling back to whole-word heuristics, and it reports how much coverage is coming from JLPT-core words versus support words instead of flattening everything into one bucket.
- Tightened the word reading coverage audit again so it now separates distinct missing reading targets from lower-priority variant-style gaps, making the N5 word backlog much more actionable instead of treating every uncovered dictionary form as equally urgent.
- Expanded the word-deck completion reporting so `deck:words:ready` and `data:audit:jlpt:words` now surface tracked starter governance coverage, explicit reading-coverage contract coverage, and canonical inventory counts before we claim N5 is complete.
- Strengthened `.apkg` smoke verification so CI now checks collection table presence, Anki collection version, deck names, note field counts, and media manifest size instead of only checking zip presence and raw note count.
- Started the first governed N4 word batch in the tracked starter word pack and canonical word-level contract with `安心`, `急ぐ`, `海岸`, `世界`, `花見`, and `開く`, so N4 word governance is now real rather than still being reported as zero.
- Expanded the JLPT word audit and word-deck build summary so they now report canonical starter coverage, curated-only starter rows, phrase-tagged starter exclusions, and shipped row governance splits (`canonicalRows`, `curatedOnlyRows`, `inferredOnlyRows`) instead of only reporting raw starter-versus-contract drift.
- Tightened kanji inference so uncurated cards fall back to the bare kanji when the top ranked compound does not match the chosen English meaning, and kept curated `preferredWords` entries free to preserve intentional compound study hooks without letting `PrimaryReading` drift onto a different display form.
- Tightened the default word-deck contract so compositional phrases like `高い山`, `兄の部屋`, and `川の近く` no longer count as normal JLPT word cards, while learner-facing breakdown panels now normalize raw internal `オン:` / `くん:` notation into clean `On:` / `Kun:` labels.
- Raised the merge/process bar for JLPT-sensitive changes: the tracked taxonomy contract is now reinforced by a clean-checkout governance test, README workflow guidance, CI workflow expectations, branch-protection guidance, and a pull-request checklist item that calls for `data:audit:jlpt` when JLPT data or deck-membership behavior changes.
- Pinned learner-facing display readings for the core N5 numeral kanji so previewed and exported kanji cards teach stable bare-kanji forms such as `一 (いち)`, `二 (に)`, `三 (さん)`, `五 (ご)`, `七 (なな)`, and `九 (きゅう)` instead of inheriting misleading counter or clock readings.
- Extended that foundational N5 curation to `十`, `千`, `午`, and `女` so previews prefer the kanji’s core learner-facing form over longer inherited compounds like `十時`, `千円`, `午前`, and `女の子`.
- Extended the same foundation-first curation to compound-heavy utility kanji such as `電`, `地`, `員`, `問`, and `堂`, so previews teach the kanji’s core learner-facing anchor instead of whole compounds like `電車`, `地下鉄`, `店員`, `問題`, and `食堂`.
- Tightened another set of broad early kanji so cards like `力`, `場`, `用`, and `間` expose the kanji-level hook directly, while `食` now intentionally prefers `食べる` as the more natural beginner-facing anchor.
- Continued the foundation pass for broad or compound-dependent beginner kanji by making `生` teach through `生きる` with an aligned example sentence and making `勉` teach through `勉強` instead of the unnatural standalone form.
- Tightened `主` so it now teaches through `主に` instead of the awkward standalone `主 (おも)`, aligning the learner-facing anchor with the note and example learners actually see.
- Tightened `世` so it now teaches through `世の中` instead of anchoring the whole card on `世界`, giving learners a more reusable reading hook while still keeping `世界` in notes.
- Strengthened the N4 golden review gate so learner-facing anchors like `主に`, `世の中`, and `勉強` are checked explicitly instead of relying only on broad meaning fragments.
- Strengthened the N5 golden review gate so stabilized numeral anchors and learner-first cards like `午`, `女`, `食`, `生`, and `電` are checked explicitly as part of the kanji-foundation contract.
- Strengthened the kanji golden review matcher itself so benchmark reading checks include the learner-facing primary reading in addition to on-yomi and kun-yomi.
- Expanded the N4 golden review gate to cover more learner-critical utility kanji, including `地`, `問`, `堂`, `用`, and `場`, so early word-building anchors are protected by product-level checks.
- Expanded the kanji golden review coverage further for bridge cards like `間`, `会`, and `事`, which directly influence how learners interpret common compound readings later.
- Added a `deck:review:coverage` audit so the team can measure how much of the tracked N4/N5 starter kanji foundation is protected by golden review benchmarks, instead of relying on one-off spot checks.
- Expanded N5 golden review coverage for another high-frequency beginner batch including `火`, `気`, `休`, `月`, `後`, `語`, `校`, `高`, `国`, and `時`.
- Expanded N5 golden review coverage again for an ultra-core beginner batch including `今`, `上`, `下`, `子`, `車`, `出`, `書`, and `小`.
- Expanded N5 golden review coverage again for another foundational beginner batch including `人`, `水`, `前`, `大`, `先`, `山`, `川`, `三`, `十`, `右`, `左`, `円`, `何`, `西`, and `南`.
- Expanded N5 golden review coverage again for another foundational beginner batch including `千`, `男`, `中`, `長`, `天`, `東`, `読`, `二`, `入`, `年`, `白`, `八`, `半`, `百`, and `父`.
- Expanded N5 golden review coverage again for the final tracked beginner batch including `分`, `聞`, `母`, `本`, `毎`, `万`, `名`, `木`, `友`, `来`, `六`, and `話`, bringing tracked starter-curated N5 kanji benchmark coverage to 100%.
- Started the N4 hardening pass by pinning learner-facing anchors for weak cards like `飲む`, `歌`, `家 （いえ）`, and `音 （おと）`, and expanded the N4 golden review set with an initial high-value batch including `悪`, `安`, `以`, `意`, `飲`, `院`, `運`, `映`, `英`, `駅`, `屋`, `音`, `夏`, `家`, and `歌`.
- Expanded the N4 golden review set again for another high-frequency batch including `花`, `画`, `海`, `界`, `開`, `楽`, `漢`, `館`, `帰`, `起`, `急`, `究`, `牛`, `去`, `魚`, `教`, `業`, `局`, and `近`, while keeping `強` out of the benchmark until its learner-facing front is tightened cleanly.
- Added a tracked `jlpt_level_contract.json` taxonomy contract plus `data:audit:jlpt`, `data:verify:jlpt`, and `data:sync:jlpt` governance commands so local JLPT data, tracked starter curation, and golden review placement can be audited and repaired against one explicit level system.
- Removed the old hardcoded JLPT inventory constants from the JSON loader so the tracked taxonomy contract is the repo's single level source of truth.
- Tightened word-deck kanji breakdown selection so compound cards keep learner-friendly per-kanji readings instead of leaking whole-compound readings onto single-kanji panels.
- Added curated breakdown overrides for high-visibility N5 benchmark compounds such as `映画`, `銀行`, `郵便局`, `青い空`, and `夜空`, and aligned the golden review matcher with the exported formatting.

## [1.0.0] - 2026-03-31

### Added

- Deterministic kanji and word deck build pipelines with managed media packaging.
- Cross-platform CI smoke verification, Ubuntu release gates, and toolchain readiness reporting.
- Repository governance policy checks for CODEOWNERS, protected branch expectations, and pull request review rules.
