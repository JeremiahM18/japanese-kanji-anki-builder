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
- Tightened word-deck kanji breakdown selection so compound cards keep learner-friendly per-kanji readings instead of leaking whole-compound readings onto single-kanji panels.
- Added curated breakdown overrides for high-visibility N5 benchmark compounds such as `映画`, `銀行`, `郵便局`, `青い空`, and `夜空`, and aligned the golden review matcher with the exported formatting.

## [1.0.0] - 2026-03-31

### Added

- Deterministic kanji and word deck build pipelines with managed media packaging.
- Cross-platform CI smoke verification, Ubuntu release gates, and toolchain readiness reporting.
- Repository governance policy checks for CODEOWNERS, protected branch expectations, and pull request review rules.
