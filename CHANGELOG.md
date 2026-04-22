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
- Added governed N5 support/core word entries for `七日`, `十日`, `五分`, and `十分` so the word deck can explicitly track the beginner date/counter readings `七 -> なの`, `十 -> とお`, `十 -> じゅっ`, and `分 -> ふん` instead of leaving those to implicit heuristics.
- Added governed N5 month support words `四月` and `五月` so the word deck can explicitly track `四 -> し` and `月 -> がつ` through real calendar vocabulary instead of leaving those beginner readings uncovered.
- Added explicit reading-coverage contracts to existing N5 learner-facing words like `月曜日`, `毎月`, `中`, `名前`, `見る`, `見える`, and `見せる` so the deck tracks more of its current study intent directly in starter data instead of relying only on runtime credit.
- Added governed N5 support words `有名`, `帽子`, and `彼女`, plus an explicit reading-support contract on `下さい`, so the word deck can intentionally cover `名 -> めい`, `子 -> し`, `女 -> じょ`, and `下 -> くださる` instead of leaving those beginner readings implicit.
- Added governed N5 support words `中国`, `地下`, `上下`, and `外す` so the word deck can intentionally cover `中 -> ちゅう`, `下 -> か`, `下 -> げ`, and `外 -> はずす` with real learner-facing example words instead of leaving those readings as open N5 gaps.
- Added governed N5 support words `二日`, `入学`, `大変`, `火山`, and `社長` so the word deck can intentionally cover `日 -> か`, `入 -> にゅう`, `大 -> たい`, `山 -> さん`, and `長 -> ちょう` with clean learner-facing examples instead of relying on rarer or less useful forms.
- Added governed N5 support words `二時`, `十回`, `名字`, `土地`, and `葉書` so the word deck can intentionally cover `二 -> じ`, `十 -> じっ`, `名 -> みょう`, `土 -> と`, and `書 -> がき` with real learner-facing example words instead of leaving those common patterns implicit.
- Added governed N5 support words `三百`, `左右`, `見学`, `雨戸`, and `北東` so the word deck can intentionally cover `百 -> びゃく`, `左 -> さ`, `右 -> ゆう`, `見 -> けん`, `雨 -> あま`, and `北 -> ほく` with common, learner-defensible example words instead of leaving those distinct readings uncovered.
- Added governed N5 support words `男子`, `手本`, `母校`, and `雨天` so the word deck can intentionally cover `男 -> だん`, `本 -> もと`, `母 -> ぼ`, and `雨 -> う` with learner-defensible support examples instead of leaving those distinct readings to audit-only gaps.
- Added governed N5 support words `八日`, `校長`, `長男`, `白米`, and `後半` so the word deck can intentionally cover `八 -> よう`, `校 -> きょう`, `男 -> なん`, `白 -> はく`, and `後 -> こう` with common, learner-defensible support examples instead of leaving those patterns to the audit backlog.

### Changed

- Upgraded learner-facing word-card breakdowns so each constituent kanji now renders its stroke-order animation directly on the card and shows an explicit constituent-level badge like `JLPT N4 kanji` or `Outside JLPT contract` whenever that kanji sits outside the deck's current level.
- Tightened `deck:words:ready` so the word-deck readiness report now surfaces true looping animation coverage explicitly and the script exits non-zero if any kanji referenced by the built word deck lacks a true looping animation asset.
- Reclassified `赤い花` and `白い花` as phrase-tagged starter entries so the default N5 word deck contract treats them consistently with other compositional adjective+noun phrases instead of counting them as accidental missing vocab rows.
- Updated the tracked N5 word-contract baseline to `273` canonical rows with `260/260` default-deck starter-eligible rows built, and tightened the reading audit to reflect the new support coverage coming from `七日`, `十日`, `五分`, `十分`, `四月`, and `五月`.
- Raised tracked explicit N5 reading-contract coverage to `25/273` (`9.16%`) while the stricter live N5 reading audit now reports `185/344` covered readings (`53.8%`), `181` covered by JLPT-core rows, `4` by support rows, `143` distinct missing targets, and `16` lower-priority variant gaps.
- Raised tracked explicit N5 reading-contract coverage again to `29/276` (`10.51%`), and the live N5 reading audit now reports `189/344` covered readings (`54.9%`), `181` covered by JLPT-core rows, `8` by support rows, `139` distinct missing targets, and `16` lower-priority variant gaps.
- Surfaced word-reading coverage directly in `deck:words:ready` and the stored word build summary so a successful N5 word build now shows the real reading-completeness signal (`189/344`, `54.9%` on the current baseline) instead of only the inventory-side `263/263` metric.
- Hardened the word export fallback path so support words that introduce higher-level constituent kanji can still build cleanly through offline kanji fallback instead of crashing `deck:words:ready` when one constituent falls back out of the API path.
- Raised the tracked N5 word baseline again to `280` canonical rows with `267/267` default-deck starter-eligible rows built, pushed explicit reading-contract coverage to `33/280` (`11.79%`), and moved the live N5 reading audit to `193/344` covered readings (`56.1%`) with `181` covered by JLPT-core rows, `12` by support rows, `135` distinct missing targets, and `16` lower-priority variant gaps.
- Raised the tracked N5 word baseline again to `285` canonical rows with `272/272` default-deck starter-eligible rows built, pushed explicit reading-contract coverage to `38/285` (`13.33%`), and moved the live N5 reading audit to `198/344` covered readings (`57.6%`) with `181` covered by JLPT-core rows, `17` by support rows, `130` distinct missing targets, and `16` lower-priority variant gaps.
- Raised the tracked N5 word baseline again to `290` canonical rows with `277/277` default-deck starter-eligible rows built, pushed explicit reading-contract coverage to `43/290` (`14.83%`), and moved the live N5 reading audit to `203/344` covered readings (`59.0%`) with `181` covered by JLPT-core rows, `22` by support rows, `125` distinct missing targets, and `16` lower-priority variant gaps.
- Raised the tracked N5 word baseline again to `295` canonical rows with `282/282` default-deck starter-eligible rows built, pushed explicit reading-contract coverage to `48/295` (`16.27%`), and moved the live N5 reading audit to `210/344` covered readings (`61.0%`) with `181` covered by JLPT-core rows, `29` by support rows, `118` distinct missing targets, and `16` lower-priority variant gaps.
- Raised the tracked N5 word baseline again to `299` canonical rows with `286/286` default-deck starter-eligible rows built, pushed explicit reading-contract coverage to `52/299` (`17.39%`), and moved the live N5 reading audit to `214/344` covered readings (`62.2%`) with `181` covered by JLPT-core rows, `33` by support rows, `114` distinct missing targets, and `16` lower-priority variant gaps.
- Raised the tracked N5 word baseline again to `304` canonical rows with `291/291` default-deck starter-eligible rows built, pushed explicit reading-contract coverage to `57/304` (`18.75%`), and moved the live N5 reading audit to `219/344` covered readings (`63.7%`) with `181` covered by JLPT-core rows, `38` by support rows, `109` distinct missing targets, and `16` lower-priority variant gaps.
- Raised the tracked N5 word baseline again to `309` canonical rows with `296/296` default-deck starter-eligible rows built, pushed explicit reading-contract coverage to `62/309` (`20.06%`), and moved the live N5 reading audit to `225/344` covered readings (`65.4%`) with `181` covered by JLPT-core rows, `44` by support rows, `103` distinct missing targets, and `16` lower-priority variant gaps.
- Raised the tracked N5 word baseline again to `314` canonical rows with `301/301` default-deck starter-eligible rows built, pushed explicit reading-contract coverage to `67/314` (`21.34%`), and moved the live N5 reading audit to `231/344` covered readings (`67.2%`) with `181` covered by JLPT-core rows, `50` by support rows, `97` distinct missing targets, and `16` lower-priority variant gaps.
- Raised the tracked N5 word baseline again to `319` canonical rows with `306/306` default-deck starter-eligible rows built, pushed explicit reading-contract coverage to `72/319` (`22.57%`), and moved the live N5 reading audit to `236/344` covered readings (`68.6%`) with `181` covered by JLPT-core rows, `55` by support rows, `92` distinct missing targets, and `16` lower-priority variant gaps.
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
