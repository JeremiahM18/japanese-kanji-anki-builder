# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Tagged release workflow with artifact checksums and release-policy validation.
- Checked-in branch protection and release process documentation treated as repository contracts.
- Added a `curated:init -- --refresh-starter` workflow for refreshing stale starter-derived local curated kanji entries without overwriting non-starter local edits.

### Changed

- Pinned learner-facing display readings for the core N5 numeral kanji so previewed and exported kanji cards teach stable bare-kanji forms such as `一 (いち)`, `二 (に)`, `三 (さん)`, `五 (ご)`, `七 (なな)`, and `九 (きゅう)` instead of inheriting misleading counter or clock readings.
- Extended that foundational N5 curation to `十`, `千`, `午`, and `女` so previews prefer the kanji’s core learner-facing form over longer inherited compounds like `十時`, `千円`, `午前`, and `女の子`.
- Extended the same foundation-first curation to compound-heavy utility kanji such as `電`, `地`, `員`, `問`, and `堂`, so previews teach the kanji’s core learner-facing anchor instead of whole compounds like `電車`, `地下鉄`, `店員`, `問題`, and `食堂`.
- Tightened another set of broad early kanji so cards like `力`, `場`, `用`, and `間` expose the kanji-level hook directly, while `食` now intentionally prefers `食べる` as the more natural beginner-facing anchor.
- Continued the foundation pass for broad or compound-dependent beginner kanji by making `生` teach through `生きる` with an aligned example sentence and making `勉` teach through `勉強` instead of the unnatural standalone form.
- Tightened `主` so it now teaches through `主に` instead of the awkward standalone `主 (おも)`, aligning the learner-facing anchor with the note and example learners actually see.
- Tightened `世` so it now teaches through `世の中` instead of anchoring the whole card on `世界`, giving learners a more reusable reading hook while still keeping `世界` in notes.
- Strengthened the N4 golden review gate so learner-facing anchors like `主に`, `世の中`, and `勉強` are checked explicitly instead of relying only on broad meaning fragments.
- Strengthened the N5 golden review gate so stabilized numeral anchors and learner-first cards like `午`, `女`, `食`, `生`, and `電` are checked explicitly as part of the kanji-foundation contract.
- Expanded the N4 golden review gate to cover more learner-critical utility kanji, including `地`, `問`, `堂`, `用`, and `場`, so early word-building anchors are protected by product-level checks.
- Expanded the kanji golden review coverage further for bridge cards like `間`, `会`, and `事`, which directly influence how learners interpret common compound readings later.
- Tightened word-deck kanji breakdown selection so compound cards keep learner-friendly per-kanji readings instead of leaking whole-compound readings onto single-kanji panels.
- Added curated breakdown overrides for high-visibility N5 benchmark compounds such as `映画`, `銀行`, `郵便局`, `青い空`, and `夜空`, and aligned the golden review matcher with the exported formatting.

## [1.0.0] - 2026-03-31

### Added

- Deterministic kanji and word deck build pipelines with managed media packaging.
- Cross-platform CI smoke verification, Ubuntu release gates, and toolchain readiness reporting.
- Repository governance policy checks for CODEOWNERS, protected branch expectations, and pull request review rules.
