# Japanese Kanji Anki Builder

A Node.js project for building JLPT kanji and word study decks for Anki with deterministic exports, curated study data, managed media, offline-friendly previewing, readiness gates, optional `.apkg` packaging, release-style CI smoke verification, and a stricter Ubuntu release gate.

## What this repo does

The project can:

- build kanji decks for JLPT N5 through N1
- build parallel word decks grouped by JLPT level
- infer learner-facing meanings, notes, readings, and example sentences
- override inference with curated kanji and word study data
- package import-ready deck artifacts and `.apkg` bundles
- manage stroke-order images, stroke-order animations, and audio assets
- preview cards even when upstream kanji enrichment is unavailable
- report setup health, media readiness, and per-level quality gates

## Quick start

Use this path first:

```bash
npm install
npm run doctor
npm run doctor:voicevox
npm run deck:readiness:global
npm run corpus:init
npm run curated:init
npm run words:init
npm run media:init
npm run deck:readiness
npm run deck:preview -- --level=5 --limit=5
npm run deck:ready -- --levels=5
npm run deck:apkg -- --levels=5
npm run deck:words:ready -- --levels=5
npm run deck:words:apkg -- --levels=5
```

Audio is advisory by default in readiness scoring: a deck can be `ready` without audio, and audio coverage is reported separately in readiness output.

The repo now treats shipped audio as a governed product surface instead of trusting the original ad hoc pipeline. The tracked [templates/audio_source_policy.json](templates/audio_source_policy.json) contract defines the current release expectation: use `VOICEVOX Nemo` as the canonical shipped source, pin the release voice to `女声1` (style id `10005` on the current Nemo engine baseline), keep release audio single-source, require explicit `source` / `voice` / `locale` provenance in managed manifests, and treat both kanji-deck and word-deck audio as governed surfaces with explicit audit/review commands before anything is considered shippable.

## Core workflows

### Typical workflow

Use this sequence when you are moving from a clean checkout toward a reviewable deck build:

1. Verify the repo and local environment.

```bash
npm install
npm run doctor
npm run doctor:voicevox
npm run deck:readiness:global
```

2. Bootstrap local ignored datasets if this machine does not have them yet.

```bash
npm run corpus:init
npm run curated:init
npm run words:init
npm run media:init
```

3. Improve content before building.

```bash
npm run curated:report -- --level=1 --limit=8
npm run data:audit:jlpt
npm run data:audit:jlpt:words
npm run deck:preview -- --level=5 --limit=5
npm run deck:review:n5
npm run deck:words:review:n5
```

4. Fill media gaps for the level you are actively working on.

```bash
npm run media:plan -- --level=5 --limit=25
npm run media:sources -- --level=5 --limit=25
npm run media:sync -- --level=5 --limit=25
```

5. Build the deck you want to inspect or ship.

```bash
npm run deck:ready -- --levels=5
npm run deck:apkg -- --levels=5
npm run deck:words:ready -- --levels=5
npm run deck:words:apkg -- --levels=5
```

6. Run release-style verification before merging or tagging.

```bash
npm test
npm run lint
npm run deck:review:accessibility -- --deck-kind=kanji
npm run deck:review:accessibility -- --deck-kind=word
npm run ci:smoke
npm run release:gate
```

This is the default happy path for the repo: diagnose first, improve data and media second, preview and review before packaging, then run the same validation layers CI expects.

For JLPT taxonomy, starter curation, golden review placement, or deck-membership changes, `npm run data:audit:jlpt` is part of the normal pre-merge bar. The tracked starter and golden alignment checks also run in the test suite so clean-checkout CI still protects the canonical JLPT contract.

For audio-policy work, run `npm run doctor:voicevox` first so the repo can confirm the local VOICEVOX Nemo engine is reachable and that the pinned release speaker is actually installed, then use `npm run data:audit:audio` to verify that managed audio manifests still match the tracked release source policy before treating any audio coverage as trustworthy. The Ubuntu-style `npm run release:gate` path now also runs this policy verification as part of release validation, so managed audio provenance cannot quietly drift once audio starts shipping.

For governed listening review, use `npm run media:review:audio -- --level=5 --limit=25` after syncing a generated batch. This checklist reports which kanji audio rows are ready to review, which are missing managed audio, which have reading mismatches, and which violate the tracked audio policy, so listening passes stay tied to the same learner-facing reading contract the kanji cards use.

For the new accessibility lane, use `npm run deck:review:accessibility -- --deck-kind=kanji` or `npm run deck:review:accessibility -- --deck-kind=word` after building the current deck artifacts. This review checks the actual note schema and current packaged output for Japanese-capable font support, textual redundancy, answer-side audio visibility when audio ships, and contrast on key text classes before manual Anki review.

The current product-hardening docs now live in:

- [docs/product-exit-criteria.md](docs/product-exit-criteria.md)
- [docs/accessibility-checklist.md](docs/accessibility-checklist.md)
- [docs/content-style-guide.md](docs/content-style-guide.md)
- [docs/compatibility-matrix.md](docs/compatibility-matrix.md)
- [docs/release-qa-checklist.md](docs/release-qa-checklist.md)
- [NOTICE.md](NOTICE.md)

### Check setup and readiness

```bash
npm run doctor
npm run doctor:voicevox
npm run deck:readiness
npm run deck:readiness:global
```

- `doctor` checks required datasets, optional local study data, media folders, managed media coverage, local toolchain readiness, and next steps.
- `doctor:voicevox` verifies that the local VOICEVOX Nemo engine is reachable, that the pinned release speaker exists on this machine, and that governed audio generation is safe to run.
- `deck:review:accessibility` performs the first deterministic accessibility audit for the built kanji or word deck and points to the manual checklist for the parts that still need human review.
- `media:review:audio` builds a governed review queue for managed kanji audio, checking expected learner-facing readings, generated readings, and release-policy provenance before you spend time listening in Anki.
- `deck:readiness` shows the global per-level readiness report across N5 through N1.
- `deck:readiness:global` is an explicit alias for the same all-level readiness report when you want the command name to say exactly what it does.

### Bootstrap starter data

```bash
npm run corpus:init
npm run curated:init
npm run words:init
npm run media:init
```

Useful variants:

```bash
npm run corpus:init -- --merge
npm run curated:init -- --merge
npm run curated:init -- --refresh-starter
npm run words:init -- --merge
```

These commands create or extend local ignored datasets so the decks are usable before you build out full coverage. Use `--merge` when you want to add newly tracked starter entries without disturbing local customizations. Use `--refresh-starter` when tracked starter entries have improved and you want to replace stale starter-derived local copies while preserving non-starter local work. The tracked starter packs now carry complete N5 and N4 kanji curation, the first six N3 kanji starter batches, the first tracked N1 starter batch of 8 kanji, a `339`-row governed N5 canonical word contract plus `13` tracked source-only phrase exclusions, and an expanded governed N4 starter word surface of `344` entries. Editor-local workspace files such as `.vscode/`, `.code-workspace`, and `.history/` are also ignored so local tooling does not dirty the repo.

The runtime now also protects against stale starter-derived local kanji entries silently weakening builds: `loadCuratedStudyData` refreshes tracked starter-derived local rows in memory before previews, reviews, and deck builds, while still preserving true local custom entries. `npm run curated:init -- --refresh-starter` is still useful when you want the ignored local file itself rewritten to match the latest tracked starter contract, but the build path no longer depends on that manual step to stay learner-facing accurate.

The word-study runtime now follows the same rule: `loadWordStudyData` refreshes stale starter-derived local word rows in memory before word-deck builds and audits, while still preserving true local custom entries. `npm run words:init -- --refresh-starter` rewrites the ignored local word-study file when you want the workspace copy itself refreshed, but the N4/N5 word build path no longer depends on manual refresh luck to see newly tracked starter entries.

### Preview and review cards

```bash
npm run deck:preview -- --level=5 --limit=5
npm run deck:preview -- --kanji=日,本,学
npm run deck:review:n2
npm run deck:review:n3
npm run deck:review:n4
npm run deck:review:n5
npm run deck:review:coverage
```

- `deck:preview` shows the learner-facing study word, meaning, primary reading, on-yomi, kun-yomi, notes, example sentence, radical, and media presence.
- Starter curation is meant to improve learner clarity, not just coverage. For beginner cards, the repo prefers the form that helps a learner read and remember the kanji correctly in later words. That means bare-kanji anchors for cards like `一`, `二`, `三`, `十`, `千`, and `女`, but real learner words for cards like `食べる`, `生きる`, `勉強`, `主に`, and `世の中` when those are the stronger first hook.
- The tracked N5 kanji foundation is fully covered by the golden review set. `deck:review:n5` now protects all tracked starter-curated N5 kanji, and the matcher checks the learner-facing primary reading as well as on-yomi and kun-yomi so the benchmark protects what the learner actually sees on the card.
- `deck:review:n4` is still intentionally partial, but N4 hardening is now active work. The first expanded N4 batch covers cards such as `悪`, `安`, `以`, `意`, `飲`, `院`, `運`, `映`, `英`, `駅`, `屋`, `音`, `夏`, `家`, and `歌`, and the starter curation now pins learner-facing anchors like `飲む`, `歌`, `家 （いえ）`, and `音 （おと)` instead of letting ranking heuristics choose weaker fronts.
- The next N4 batch now also covers high-frequency daily-life and school cards such as `花`, `画`, `海`, `界`, `開`, `楽`, `漢`, `館`, `帰`, `起`, `急`, `究`, `牛`, `去`, `魚`, `教`, `業`, `局`, and `近`.
- The current N4 hardening pass now extends further into family, planning, daily-action, and school-life cards such as `強`, `銀`, `空`, `兄`, `計`, `建`, `犬`, `研`, `験`, `言`, `古`, `公`, `口`, `工`, `広`, `考`, `黒`, `座`, `作`, and `使`, and `強` now teaches through `強い` instead of the weaker bare `きょう` front.
- The next N4 hardening pass now also covers everyday relationship, school, and action cards such as `始`, `姉`, `思`, `止`, `死`, `私`, `紙`, `試`, `字`, `持`, `自`, `室`, `質`, `写`, `社`, `者`, `借`, `手`, `秋`, and `終`, and learner-facing anchors are now explicitly pinned where needed so cards like `思う`, `止まる`, and `終わる` do not drift into weaker dictionary-style fronts.
- The current N4 batch now also covers routine time, quantity, family, and descriptive cards such as `習`, `週`, `集`, `重`, `春`, `所`, `少`, `色`, `寝`, `心`, `新`, `真`, `親`, `正`, `青`, `赤`, `切`, `早`, `走`, and `送`, and learner-facing anchors are now pinned where needed so cards like `少し`, `本当`, `親`, `青い`, `赤い`, `早い`, and `走る` do not fall back to weaker or misleading fronts.
- The next N4 hardening pass now also covers everyday body, location, family, transport, and activity cards such as `足`, `族`, `多`, `体`, `待`, `貸`, `題`, `知`, `茶`, `着`, `昼`, `注`, `朝`, `町`, `鳥`, `通`, `弟`, `店`, `転`, and `田`, and learner-facing anchors are now pinned where needed so cards like `足`, `貸す`, `昼`, `朝`, `鳥`, and `店` do not drift into weaker on-yomi-first or compound-only fronts.
- The current N4 hardening pass now also covers daily routine, movement, food, health, and descriptive cards such as `度`, `冬`, `答`, `動`, `同`, `道`, `特`, `肉`, `猫`, `買`, `売`, `発`, `飯`, `晩`, `病`, `不`, `部`, `風`, `服`, and `物`, and learner-facing anchors are now pinned where needed so cards like `道 （みち）` and `風 （かぜ）` do not regress to weaker on-yomi-first or misleading compound-style fronts.
- The final N4 hardening pass now also covers the remaining learner-critical utility, movement, family, and descriptive cards such as `文`, `閉`, `別`, `歩`, `方`, `忙`, `妹`, `味`, `明`, `目`, `夜`, `野`, `有`, `郵`, `夕`, `曜`, `洋`, `理`, `立`, `旅`, `料`, and `力`, and learner-facing anchors are now pinned where needed so cards like `歩く`, `味 （あじ）`, `明るい`, `有る`, `郵便`, `野原`, and `料金` do not fall back to weaker or misleading fronts.
- The tracked N4 golden review now covers `176/176` starter-curated N4 kanji (`100%`), and N5 remains fully benchmarked at `80/80`, so the entire tracked N4/N5 starter kanji foundation is now protected by golden review.
- The N4 operating rule is deliberate: tighten weak learner-facing anchors first, then lock benchmark entries, then re-run `data:audit:jlpt`, `deck:review:n4`, and `deck:review:coverage` before moving to the next batch.
- Use `deck:review:coverage` to audit how much of the tracked N4/N5 starter foundation is covered before claiming a level is benchmark-hardened.
- `deck:words:review:n5` covers a representative N5 word slice across simple forms and compound-heavy cards such as `映画`, `本屋`, `日本語`, `公園`, `電気`, `辞書`, `小学校`, `駅前`, `夜空`, and `会話`.
- the golden N5 word review now also protects a riskier support-word slice so cross-level and outside-contract learner cards like `眼鏡`, `断食`, `西瓜`, `火照る`, `生かす`, and `生ビール` do not quietly regress while we finish the last N5 reading gaps
- Preview and review consume split learner-facing reading fields directly rather than relying on a combined fallback string.
- If the upstream kanji API is unavailable, preview falls back to local sentence corpus, curated study data, radicals, and managed media instead of failing outright.
- Kanji deck exports never serialize raw upstream `ERROR:` text into card fields; export-time fallbacks are recorded in `reports/export-issues.json` and summarized in `build-summary.json`.
- Fully curated kanji rows use local JLPT metadata for readings and meanings before any remote kanji lookup, so finished decks can still pass strict builds even when the kanji API is flaky.

### Build and package the kanji deck

```bash
npm run deck:ready -- --levels=5
npm run deck:apkg -- --levels=5
```

`deck:ready` runs the main kanji build path:

- validates setup
- syncs media
- builds exports
- packages the deck in `out/build/package`
- rebuilds packaged exports and media from a clean slate so stale files do not leak between runs
- prints a summary including quality and media status
- fails with a non-zero exit code if any kanji export row required fallback data, unless you pass `--allow-export-fallbacks`
- writes `reports/export-issues.json` when any kanji row had to fall back to local data during export instead of using live API enrichment

`deck:apkg` converts the packaged exports and copied managed media into an Anki-importable `.apkg` file.

If you intentionally want a usable-but-degraded deck when the live kanji API is flaky, run `npm run deck:ready -- --levels=5 --allow-export-fallbacks`. The default `deck:ready` contract is now strict so fallback-built cards are surfaced as a failed build instead of silently shipping.

### Build and package the word deck

```bash
npm run deck:words:ready -- --levels=5
npm run deck:words:apkg -- --levels=5
npm run media:voicevox:words -- --level=5 --speaker-id=10005 --overwrite
npm run media:sync:words -- --level=5
npm run media:review:word-audio -- --level=5 --limit=25
```

The word deck is a separate Anki note type focused on real study words such as `今`, `今日`, `今年`, `話す`, and `日本語`. By default it is curated-only so the exported deck stays high precision while the word dataset grows.

Important word-deck rules:

- word identity is `written + reading`, and curated words tagged for a JLPT level are included even when their constituent kanji are outside that level's kanji slice
- exported word-card JLPT labels now use trusted word-level sources only: the tracked [templates/jlpt_word_level_contract.json](templates/jlpt_word_level_contract.json) contract first, then explicit curated JLPT tags; exploratory inferred rows can still be scoped by kanji heuristics, but they no longer get a learner-facing JLPT label by default
- the default word deck now aims at lexical study words, not compositional example phrases; curated entries tagged `phrase` and obvious phrase shapes such as `高い山` or `兄の部屋` are excluded from normal word-deck output
- curated word entries suppress uncurated alternate readings for the same written form
- word cards now explicitly tell the learner why a word is present with `CoverageRole`, `FocusKanji`, and `CoversReading` fields, and starter word entries can track that intent explicitly through a `coverage` contract (`role`, `focusKanji`, `coversReadings`) instead of relying only on runtime derivation
- kanji breakdown panels on the back prefer curated kanji display words and meanings, and can use dedicated breakdown-only overrides for compound contexts so cards like `銀行`, `会社`, `会社員`, `昼ご飯`, `晩ご飯`, `午前`, `午後`, `時間`, `月曜日`, `学校`, `病院`, `郵便局`, `去年`, `来月`, `来週`, `夕方`, `元気`, and `仕事` stay learner-friendly without changing primary study forms such as `行く`
- those breakdown panels now avoid leaking a full compound reading onto a single-kanji panel unless you intentionally curate that context, normalize internal reading labels into learner-facing `On:` / `Kun:` lines instead of surfacing raw `オン:` / `くん:` notation, prefer context-specific readings like `時 （じ）`, `学 （がく）`, `車 （くるま）`, `休 （やすみ）`, and `間 （かん）` when the word actually teaches that reading, show each constituent kanji's stroke-order animation directly on the card, and explicitly badge constituent kanji when they come from a different JLPT level than the deck being studied
- `npm run data:audit:jlpt:words` now audits the tracked starter word surface more honestly: it reports canonical starter coverage by level, curated-only starter entries, tracked source-only phrase exclusions, explicit reading-coverage contract counts, and contract drift so we can see how much of the default word deck surface is actually governed before widening any level. The current tracked baseline is `339/339` governed default-deck starter entries for N5, `13` tracked N5 source-only phrase exclusions, and `344/344` governed N4 starter entries.
- N5 word audio is now a governed product surface too. `npm run media:voicevox:words`, `npm run media:sync:words`, and `npm run media:review:word-audio` use the same pinned `VOICEVOX Nemo` release voice, provenance rules, and review-first workflow as the kanji deck. The current N5 baseline is `339/339` word rows with `100%` governed word-audio review coverage and `0` missing or mismatched rows.
- `deck:words:ready` now reports the word-audio review block directly for levels where word audio is enabled, so the build summary exposes whether the managed word-reading audio actually matches the deck contract instead of treating audio as a separate afterthought.
- `npm run deck:words:reading-audit:n5` now trusts the exported word-card `FocusKanji` and `CoversReading` fields before falling back to whole-word heuristics, so the audit can correctly credit cross-reading support from cards like `今日`, `時間`, and `休み時間`, report whether coverage is coming from core JLPT words versus support words, and separate distinct missing reading targets from lower-priority variant-style gaps.
- `npm run deck:words:triage:n5` turns the remaining N5 reading gaps into an actionable backlog by classifying each open reading as `editorial_review`, `promote_curated_example`, or `defer_variant`, and it now also respects a tracked override contract for obviously archaic or low-value dictionary readings so the final stretch stays focused on real learner-facing decisions instead of padding the backlog with dead-end forms.
- The current N5 reading audit now credits explicit support coverage from date, counter, calendar, transport, direction, and common higher-recognition words like `七日`, `十日`, `五分`, `十分`, `四月`, `五月`, `下さい`, `有名`, `帽子`, `彼女`, `中国`, `地下`, `上下`, `外す`, `外れる`, `二日`, `入学`, `大変`, `火山`, `社長`, `二時`, `十回`, `名字`, `土地`, `葉書`, `三百`, `左右`, `見学`, `雨戸`, `北東`, `男子`, `手本`, `手間`, `母校`, `万事`, `雨天`, `八日`, `校長`, `長男`, `白米`, `白紙`, `後半`, `一日`, `後ほど`, `行事`, `南北`, `父母`, `分かれる`, `分ける`, `休める`, `下す`, `生える`, `休まる`, `生け花`, `西洋`, `関西`, `語る`, `下町`, `外科`, `行う`, `生ビール`, `西瓜`, `音読`, `椅子`, `気配`, `世間`, `半ば`, `小指`, `木刀`, `木陰`, `春雨`, `女神`, `子年`, `午年`, `後れる`, `天の川`, `天気雨`, `河川`, `白髪`, `話`, `上り`, `下り`, `左折`, `母語`, `小川`, `円高`, `小雨`, `金具`, `黄金`, `食う`, `来い`, `上座`, `出来上がり`, `女房`, `白夜`, `足下`, `一生`, `上昇`, `行方`, `生地`, `生やす`, `火照る`, `生かす`, `眼鏡`, `断食`, `行き先`, `分かつ`, and `語らう`, and it now carries more of the already-built learner-facing intent explicitly through cards like `月曜日`, `毎月`, `中`, `名前`, `見る`, `見える`, `見せる`, and `新聞`. That leaves the tracked N5 reading picture at `292/344` covered readings, with `182` covered by JLPT-core rows, `110` by support rows, `36` distinct missing targets, and `16` lower-priority variant gaps all explicitly deferred instead of still queued as active editorial work.
- `npm run deck:words:ready -- --levels=5` now writes an explicit completion block into `out/word-build/build-summary.json` and the console report so we can see tracked N5 governance coverage, explicit reading-coverage contract coverage, canonical inventory counts, tracked source-only exclusions, the live reading-audit summary (`292/344`, `84.9%` covered on the current N5 baseline), the triage backlog (`0` editorial-review gaps, `0` promote-curated-example items, and `52` deferred variants on the current baseline), and true looping animation coverage before claiming the word deck is complete.
- that same readiness block now classifies the current N5 word deck as `ready_with_deferred_variants`, which means starter-eligible vocabulary is fully built, active learner-facing triage gaps are cleared, and the only remaining open reading items are explicitly deferred low-priority variants; pass `--require-no-active-triage` when you want `deck:words:ready` to fail if a future edit reintroduces active editorial backlog
- `deck:words:ready` now also runs a whole-deck policy audit against the built TSV: bare single-kanji word cards must stay in their own JLPT level, while any cross-level or outside-contract constituent kanji that appear inside lower-level support words must be explicitly labeled on the card. The current N5 baseline is clean at `0` standalone wrong-level cards and `0` missing labels.
- `deck:words:ready` and `deck:words:completion:n5` now also run a soft sentence-orthography audit against the built TSV: they flag likely cases where a governed word appears only in kana in the full Japanese example sentence even though the card itself is teaching a kanji form. This is a non-blocking editorial review signal rather than a hard failure, so natural kana-preferred Japanese can still be handled intentionally instead of being misclassified as a product bug. The current N5 baseline is clean at `0` suspicious kana-only examples.
- `deck:words:ready` now also enforces the word-card animation rule directly: if every kanji referenced by the word deck does not have a true looping animation asset, the script exits non-zero instead of quietly treating static or fallback animation coverage as good enough.
- `npm run deck:words:completion:n5` is the combined N5 word completion gate: it reports canonical inventory size, tracked source-only exclusions outside that inventory, real starter-eligible rows missing from the built deck, and current reading-coverage totals in one audit instead of making us compare multiple reports by hand.
- N5 word is now treated as stabilized. Keep it frozen except for regressions or explicit editorial decisions, and use `npm run deck:words:ready -- --levels=5 --require-no-active-triage` as the normal shared-pipeline guard so future changes do not quietly destabilize the shipped N5 surface.
- N4 word work should start under the same contract from day one. That means no duplicate standalone higher-level kanji cards, explicit cross-level or outside-contract constituent labels on the card, explicit reading-coverage tracking where the intent matters, the same soft sentence-orthography review, and the same hard deck-policy audit instead of a looser “we will clean it up later” phase.
- Reading coverage is now tracked cumulatively across easier decks instead of treating each level in isolation. In practice that means N4 counts readings already satisfied by N5, N3 counts N5+N4+N3, and so on, which keeps the product focused on total learner coverage instead of duplicating readings just to make a higher-level deck look complete on paper.
- `npm run deck:words:gap-plan:n4 -- --limit=50` turns the active N4 reading backlog into a ranked batching queue, separating fast curated-example promotions from true editorial research while hiding deferred variants by default. The planner now also suggests editorial candidate words from tracked starter entries, sentence corpus rows, and the local kanjiapi word cache, then boosts already-tracked words that only need explicit `coverage.coversReadings` intent. These suggestions are not deck truth: they are a proof-backed queue for human review, and the final card still must pass the canonical word contract, cross-level/outside-JLPT labels, media checks, sentence orthography review, and deck policy audit. Use `--suggestions=0` to hide suggestions, `--min-suggestion-score=60` to make the queue stricter, `--quality=strong` to show only the safest candidates, or `--only=contract-extensions` to isolate words that are already tracked and only need explicit reading intent. The same command family is available for N3, N2, and N1 so later decks can start from cumulative coverage planning instead of another raw grind.
- The governed N4 starter surface now has twenty deliberate completion batches. The twentieth adds `強引`, `建設`, `愛犬`, `言語`, `伝言`, `人口`, `工夫`, `参考`, `使用`, `思想`, `用紙`, `持参`, `自然`, `質屋`, `借用`, `選手`, `秋分`, `春分`, `少々`, `正式`, `青春`, `赤道`, `発着`, `昼食`, `冬至`, and `売買`. That raises canonical N4 word inventory to `344` rows, keeps starter governance at `344/344`, and improves live cumulative N4 reading coverage to `372/651` (`57.1%`) with `66` readings already satisfied by N5 and `345` covered by the N4 deck itself.
- Convenience startup commands now exist for the N4 word surface too: `npm run deck:words:completion:n4 -- --json`, `npm run deck:words:reading-audit:n4 -- --json`, and `npm run deck:words:triage:n4 -- --json`.
- use `--include-inferred` when you explicitly want to expand beyond curated words during exploration

### Lower-level build

```bash
npm run build:artifacts -- --levels=5,4 --limit=25
npm run build:artifacts -- --levels=5,4 --limit=25 --max-fallback-ratio=0.05
```

`build:artifacts` stays reporting-friendly by default, but you can now enforce a fallback ceiling for strict scripting. For example, `--max-fallback-ratio=0.05` fails the build when more than 5% of exported rows degrade to offline local fallback cards.

## Media workflows

### Common commands

```bash
npm run media:init
npm run media:plan -- --level=5 --limit=25
npm run media:plan:stroke-order -- --level=5 --limit=25
npm run media:plan:stroke-order -- --animation-only --discover --level=5 --limit=25
npm run media:discover:stroke-order -- --level=5 --limit=10
npm run media:fetch:stroke-order -- --level=5 --limit=20 --file-limit=4
npm run media:fetch:stroke-order -- --animation-only --level=5 --limit=20 --file-limit=4
npm run media:fetch:stroke-order -- --level=5 --limit=20 --file-limit=20 --probe-guessed
npm run media:report:animations -- --level=5 --limit=25
npm run media:import:stroke-order -- --input-dir=/path/to/files
npm run media:import:kanjivg -- --input-dir=/path/to/extracted-kanjivg/kanji --level=4
npm run media:import:audio -- --input-dir=/path/to/audio --level=5
npm run media:voicevox -- --list-speakers
npm run media:voicevox -- --level=5 --speaker-id=10005 --concurrency=4
npm run media:sources -- --level=5 --limit=25
npm run media:sync -- --level=5 --limit=25
npm run media:report -- --limit=25
```

### Stroke-order acquisition

- `media:plan` shows accepted filenames for missing image, animation, and audio assets.
- Remote stroke-order animation sync is opt-in. Set `REMOTE_STROKE_ORDER_ANIMATION_BASE_URL` for the primary GitHub GIF source, and optionally set `REMOTE_STROKE_ORDER_ANIMCJK_BASE_URL` for a secondary GitHub animated-SVG fallback.
- `media:plan:stroke-order` builds a Wikimedia Commons checklist for supplemental stroke-order assets, mainly static images and any manual fallback work you still want to do.
- Add `--animation-only` when you want that checklist limited to missing true animations, with no image rows mixed in.
- `media:discover:stroke-order` combines Commons title search with file-prefix listing to find real Commons asset names when you are filling local gaps.
- `media:fetch:stroke-order` downloads confirmed Commons assets, and `--probe-guessed` also tries direct Commons redirect URLs for guessed filenames when discovery cannot confirm them.
- `media:fetch:stroke-order -- --animation-only ...` keeps the Commons fetch pass focused on missing animations only.
- `media:report:animations` shows the current managed true-animation gap queue by level, and `media:report:animations:n1` is the optional convenience shortcut for the full N1 queue.
- `.env.example` includes commented primary and secondary remote animation examples so each machine opts into its intended source order explicitly.
- `media:import:kanjivg` imports official KanjiVG SVG files into the repo's canonical source layout.

If you are focused only on stroke order, run readiness and media reporting with `ENABLE_AUDIO=false`.

### Audio acquisition

- `media:import:audio` imports local audio files into the source folder using the same candidate names the sync layer already supports.
- `media:voicevox` generates deterministic `.wav` files from a local VOICEVOX engine.

Recommended VOICEVOX flow:

```bash
npm run media:voicevox -- --list-speakers
npm run media:voicevox -- --level=5 --speaker-id=10005 --concurrency=4
npm run media:sources -- --level=5 --limit=100
npm run media:sync -- --level=5 --limit=100
npm run data:audit:audio -- --json
npm run deck:readiness
```

This assumes a local VOICEVOX engine is already running at `VOICEVOX_ENGINE_URL` or the default `http://127.0.0.1:50021`.

`media:voicevox` now writes a provenance sidecar next to each generated audio file so the later managed-media import can preserve the intended release source, voice label, and locale instead of flattening everything into a generic local-file source. By default it now also falls back to the tracked release voice from `audio_source_policy.json` (`女声1`, style id `10005`) when no explicit speaker override is provided, but you can still override that explicitly for experiments.

## CI verification

GitHub Actions now runs three verification lanes:

- an Ubuntu verification matrix on Node 18, Node 20, and Node 22 for lint and the full automated test suite
- a cross-platform smoke matrix on Ubuntu, Windows, and macOS for Node 18 and Node 22 that seeds a deterministic fixture workspace with `npm run ci:smoke` and verifies kanji and word deck packaging paths from a clean checkout
- a dedicated Ubuntu release gate that provisions Python, runs `npm run release:gate -- --require-apkg-tools`, and asserts artifact contracts plus native `.apkg` generation

The smoke and release-gate jobs keep their generated `out/` trees as workflow artifacts so packaging regressions are easier to inspect after a failure.

`npm test` intentionally runs through `scripts/runNodeTests.js` instead of calling `node --test` directly. The wrapper expands an explicit sorted test-file list for cross-version compatibility, and Node 24+ adds `--test-isolation=none` only where that flag is supported. Keep tests resilient to shared module state: avoid module-scope mutable singletons in test fixtures, and reset any unavoidable in-memory caches, counters, or queues inside setup or teardown hooks rather than relying on file load order.

## Repository governance

`main` should be protected in GitHub with required pull requests, code-owner review, stale-review dismissal, conversation resolution, and the exact required checks listed in [docs/branch-protection.md](docs/branch-protection.md).

The checked-in policy files in [.github/CODEOWNERS](.github/CODEOWNERS) and [docs/branch-protection.md](docs/branch-protection.md) are treated as part of the repo contract and are covered by automated tests.

AI-assisted changes should also follow the repo-specific guardrails in [CLAUDE.md](C:\Users\cover\Projects\Active\Fullstack\japanese_kanji_builder\CLAUDE.md), especially for JLPT taxonomy, N5-before-N4 sequencing, and the word-deck reading-coverage contract.

## Release process

Tagged releases should follow [docs/release-process.md](docs/release-process.md), keep [CHANGELOG.md](CHANGELOG.md) current, and use `v<package.json version>` tags so version metadata, docs, and workflow triggers stay aligned.

The tagged workflow in [.github/workflows/release.yml](.github/workflows/release.yml) reruns release verification, publishes deterministic smoke and release-gate artifacts, and emits `release-artifacts.sha256` for traceability.

## Common commands

| Command | Purpose |
| --- | --- |
| `npm test` | Run the full test suite |
| `npm run lint` | Run ESLint |
| `npm run ci:smoke` | Seed a deterministic fixture workspace and smoke-test kanji plus word deck artifact generation |
| `npm run release:gate` | Assert smoke artifacts, TSV schemas, package summaries, and optionally require native `.apkg` tooling |
| `npm run doctor` | Check setup, coverage, readiness, and next steps |
| `npm run deck:readiness` | Show the global per-level deck quality gates across all JLPT levels |
| `npm run deck:preview` | Preview kanji cards before import |
| `npm run deck:review:coverage` | Audit golden-review coverage for the tracked N4/N5 starter kanji foundation |
| `npm run deck:review:n4` | Run the tracked golden N4 benchmark |
| `npm run deck:review:n5` | Run the tracked golden N5 kanji benchmark |
| `npm run deck:words:review:n5` | Run the tracked golden N5 word benchmark |
| `npm run deck:words:completion:n5` | Audit combined N5 word inventory coverage and reading coverage |
| `npm run deck:words:completion:n4` | Audit combined N4 word inventory coverage and reading coverage |
| `npm run deck:words:reading-audit:n4` | Audit N4 word reading coverage against the built N4 word deck |
| `npm run deck:words:triage:n4` | Classify the remaining N4 word reading gaps into an actionable backlog |
| `npm run deck:words:gap-plan:n4 -- --limit=50` | Rank the next word-reading coverage batch and show candidate support words from tracked data, sentence corpus rows, and local cache evidence |
| `npm run deck:ready` | Run the full kanji build and package path (fails if export fallbacks occur unless `--allow-export-fallbacks` is set) |
| `npm run deck:apkg` | Build an importable `.apkg` from packaged kanji exports |
| `npm run deck:words:ready` | Run the full word-deck build and package path |
| `npm run deck:words:apkg` | Build an importable `.apkg` from packaged word exports |
| `npm run corpus:init` | Create or merge starter sentence corpus data |
| `npm run curated:init` | Create or merge starter curated kanji study data |
| `npm run data:audit:jlpt` | Audit local JLPT data, tracked starter curation, and golden review placement against the tracked JLPT level contract |
| `npm run data:audit:jlpt:words` | Audit tracked starter word study data against the tracked JLPT word-level contract |
| `npm run data:audit:audio` | Audit managed audio provenance against the tracked release audio source policy |
| `npm run data:sync:jlpt` | Rewrite the local ignored JLPT dataset so its `jlpt` levels match the tracked JLPT level contract |
| `npm run data:verify:jlpt` | Verify the local JLPT kanji dataset against the canonical per-level inventory contract |
| `npm run words:init` | Create or merge starter curated word study data |
| `npm run media:init` | Create media source folders and bootstrap `.env` |
| `npm run media:plan` | Show missing media by kanji with accepted filenames |
| `npm run media:sources` | Report local source-folder coverage before media sync |
| `npm run media:sync` | Sync stroke-order and audio assets into managed storage for one level at a time |

The sections above document the specialized media, benchmark, and import commands in more detail. This table is the common operating surface rather than the full script inventory.

## Local data and config

The project expects local ignored datasets under `data/`:

- `data/kanji_jlpt_only.json`
- `data/KRADFILE`
- `data/sentence_corpus.json`
- `data/curated_study_data.json`
- `data/word_study_data.json`

Curated kanji study entries can pin a learner-facing display form with `displayWord`, for example `{ "written": "上", "pron": "うえ" }`, so exports and offline previews stay aligned even when the highest-ranked dictionary word uses a different surface form.

Runtime curated kanji loading uses the tracked base starter pack plus any tracked `starter_curated_study_data_*.json` batch files as the baseline, then layers local ignored overrides on top, so starter improvements keep flowing into builds without clobbering local edits.

JLPT level taxonomy is now governed by the tracked [templates/jlpt_level_contract.json](templates/jlpt_level_contract.json) contract rather than by a workstation-local assumption. Use `npm run data:audit:jlpt` when you want the full alignment picture across the local `kanji_jlpt_only.json`, tracked starter curation, and golden review placement, use `npm run data:verify:jlpt` when you only need to validate the local ignored dataset against that contract, and use `npm run data:sync:jlpt` when a workstation copy needs to be brought back into alignment.

Curated word study entries are keyed by `written|reading`, for example `今日|きょう`, so the word deck can intentionally keep `今日 / きょう` while excluding `今日 / こんにち` unless you curate both.

Word-level JLPT truth is now tracked separately in [templates/jlpt_word_level_contract.json](templates/jlpt_word_level_contract.json). The export path prefers that contract for learner-facing JLPT labels on word cards, and `npm run data:audit:jlpt:words` checks that the tracked starter word dataset still matches it. The canonical contract now means “default-deck eligible” only: the current governed baseline is `339` canonical N5 word rows, `344` canonical N4 word rows, plus `13` tracked source-only phrase exclusions at N5. Standalone single-kanji words now stay in their own JLPT level, while lower-level decks can still include multi-kanji support words that reference higher-level constituent kanji and badge that cross-level context explicitly on the card. Reading coverage is cumulative across easier decks, so higher-level completion audits do not ask for duplicate reading support when a lower-level deck already teaches that reading well.

Release audio truth is now tracked separately in [templates/audio_source_policy.json](templates/audio_source_policy.json). Managed audio is only considered enterprise-grade when the manifest provenance matches that policy. The current contract expects a single shipped release source (`voicevox-nemo`), the pinned release speaker `女声1` (style id `10005`), explicit voice and locale metadata, and no remote-audio release provider.

Managed media is stored under:

- `data/media/`

Local source folders for acquisition:

- `data/media_sources/stroke-order/images/`
- `data/media_sources/stroke-order/animations/`
- `data/media_sources/audio/`

Optional `.env` settings:

- `NODE_ENV`
- `WORD_STUDY_DATA_PATH`
- `VOICEVOX_ENGINE_URL`
- `VOICEVOX_SPEAKER_ID`
- `REMOTE_STROKE_ORDER_IMAGE_BASE_URL`
- `REMOTE_STROKE_ORDER_ANIMATION_BASE_URL`
- `REMOTE_STROKE_ORDER_ANIMCJK_BASE_URL`
- `REMOTE_AUDIO_BASE_URL`
- `MEDIA_MANIFEST_CACHE_TTL_MS`

`REMOTE_STROKE_ORDER_ANIMATION_BASE_URL` is optional. Leave it unset if you only want local animation assets, or point it at a pinned remote source such as GitHub `jcsirot/kanji.gif` when you want managed GIF fallback acquisition.

`REMOTE_STROKE_ORDER_ANIMCJK_BASE_URL` is also optional. Set it when you want a secondary GitHub animated-SVG fallback from AnimCJK after the primary GIF source misses.

`MEDIA_MANIFEST_CACHE_TTL_MS` controls how long the long-running server keeps managed media manifests in memory before rereading them from disk. The default is `30000` ms, which keeps requests fast while still letting the server notice external `media:sync` changes without a restart.

More detailed local data guidance lives in [data/README.md](data/README.md).

## Deck model

### Kanji deck

The kanji deck exports fields such as:

- `DisplayWord`
- `MeaningJP`
- `PrimaryReading`
- `OnReading`
- `KunReading`
- `StrokeOrder`
- `StrokeOrderImage`
- `StrokeOrderAnimation`
- `Audio`

Behavior:

- `DisplayWord` carries the learner-facing study form shown on the front of the card, such as `話す`, `行く`, or `今`.
- `MeaningJP` carries that learner-facing display word plus the English gloss.
- `PrimaryReading` carries the pronunciation of that learner-facing display word when one is available.
- When uncurated ranking only finds compound candidates whose gloss does not match the chosen kanji meaning, inference now falls back to the bare kanji for `DisplayWord` and `MeaningJP` instead of surfacing a misleading compound front such as `日本 ／ day`.
- Curated entries can still intentionally teach through a compound hook by pinning `displayWord` directly or by supplying `preferredWords`, and `PrimaryReading` now stays aligned with the selected learner-facing display form instead of inheriting a different compound reading.
- `OnReading` keeps the full on-yomi list for reference.
- `KunReading` keeps the full kun-yomi list for reference.

### Word deck

The word deck exports fields such as:

- `Word`
- `Reading`
- `Meaning`
- `JLPTLevel`
- `CoverageRole`
- `FocusKanji`
- `CoversReading`
- `KanjiBreakdown`
- `ExampleSentence`
- `Notes`

Behavior:

- the front shows the written study word with no furigana
- the back shows the reading, English meaning, JLPT label, learner-facing study focus, example sentence, and a compact kanji breakdown
- `CoverageRole` explains whether the card is carrying core JLPT vocabulary, reading coverage support, or both
- `FocusKanji` lists the kanji this word is actively helping cover, in the same order the learner reads them in the word
- `CoversReading` shows the specific per-kanji reading the word is reinforcing, such as `時: じ ／ 間: かん`
- `KanjiBreakdown` now shows each constituent kanji's learner-facing meaning, reading lines, stroke-order animation, and an explicit badge such as `JLPT N4 kanji` when that constituent sits outside the current deck level
- kanji breakdown panels prefer curated kanji display words and meanings, then fall back to bare-kanji meanings and reading lists; in compound contexts they avoid inheriting a whole-word reading unless you curate that override explicitly, while still surfacing the full constituent kanji study context directly on the word card
- the shared Anki note schemas live in `src/config/ankiNoteSchema.json` and `src/config/ankiWordNoteSchema.json`, which are the single sources of truth for exported field order, note type metadata, and card template layout

## Media model

Supported media sourcing:

- deterministic local filesystem lookup
- optional remote HTTP fallback providers
- managed per-kanji manifests for imported assets
- atomic manifest writes with per-kanji serialization

Media behavior:

- `StrokeOrder` prefers animation when available, then static image.
- `StrokeOrderImage` exposes the static asset directly.
- `StrokeOrderAnimation` exposes the managed animation asset directly when one exists.
- Managed animation assets come from your configured remote providers in order, then fall back to local imports. The intended priority is `REMOTE_STROKE_ORDER_ANIMATION_BASE_URL` first, then `REMOTE_STROKE_ORDER_ANIMCJK_BASE_URL`, then local files when the remotes miss.
- Managed animation assets include real animation files such as `.gif`, `.webp`, `.apng`, and animated `.svg` files sourced from AnimCJK.
- Static stroke-order image coverage and animation coverage are reported separately so card quality stays honest.
- `Audio` exports Anki sound markup when a managed audio asset exists.

## Quality model

Deck quality is treated as a first-class contract.

Readiness checks evaluate:

- sentence coverage
- curated study coverage
- stroke-order coverage
- animation coverage as a separate diagnostic
- audio coverage as a separate advisory diagnostic when audio is enabled
- offline card quality for readings, meanings, examples, and contextual notes

Current default readiness thresholds are:

- sentence coverage: `90%`
- curated coverage: `60%`
- stroke-order coverage: `90%`

Audio coverage and full-media coverage are still reported, but they do not block the main `ready` state by default.

Use these commands to inspect quality:

```bash
npm run doctor
npm run deck:readiness
npm run deck:review:n2
npm run deck:review:n5
```

## Output layout

Kanji build artifacts are written to `out/build`:

- `exports/jlpt-n5.tsv`
- `reports/sentence-corpus-coverage.json`
- `reports/curated-study-coverage.json`
- `reports/media-coverage.json`
- `reports/media-sync.json`
- `reports/export-issues.json`
- `build-summary.json`

Word build artifacts are written to `out/word-build`:

- `exports/jlpt-n5-words.tsv`
- `reports/word-deck-summary.json`
- `build-summary.json`

Word deck summaries now include governance counts for shipped rows, split into `canonicalRows`, `curatedOnlyRows`, and `inferredOnlyRows`, plus a per-level breakdown. That makes it much easier to tell whether a build is mostly contract-backed JLPT vocabulary or still leaning on curated-only or inferred support content.

Import-ready packaging is written to:

- `out/build/package`
- `out/word-build/package`


