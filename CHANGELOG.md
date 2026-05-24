# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Release notes are intentionally release-facing. Per-card and per-batch review detail belongs in git commit messages, tracked review manifests, and gate output; use live commands for release decisions.

### Security

- Added a deterministic supply-chain audit gate for lockfile registry/integrity, reviewed install-script packages, pinned GitHub Actions, minimal workflow permissions, and release-artifact boundaries; CI and tagged release jobs now run it before `npm ci`.
- Hardened local network defaults: the Express dev server now binds to `127.0.0.1` unless `SERVER_HOST` explicitly opts into another host, and the governed VOICEVOX Docker helper now requires/recreates a local-only `127.0.0.1:50021:50121` port binding instead of accepting a broad host-port publish.
- Hardened Anki HTML rendering boundaries: generated kanji and word TSV exports now escape external text before it enters HTML-rendered fields while preserving the known-safe ruby, pitch-contour, audio, and stroke-order markup emitted by the exporter.
- Hardened local XML source normalization by disabling entity expansion in the KANJIDIC2 parser and locking both KANJIDIC2 and JMdict entity-handling behavior with regression tests.
- Added `SECURITY.md` plus a concise README security posture section documenting the local-only server threat model, VOICEVOX localhost expectation, untrusted local input boundary, and private vulnerability-reporting path.

### Changed

- Expanded the governed N3 core kanji current-standard Platinum lane while keeping Obsidian fail-closed: live N3 kanji remains `341/341` generated and Gold, structural Platinum is now `240/341`, Obsidian is `0/341`, `240` Platinum entries still need Obsidian proof, and `101` generated rows remain blocked/failing only because structural Platinum is incomplete.
- Fixed Gold/Platinum review matching so escaped Anki HTML fields are checked against their visible learner-facing text, preserving safer TSV output without invalidating existing review evidence that protects `kanji -> reading` notes and escaped example translations.
- Completed the governed N4 word Obsidian proof lane while keeping certification fail-closed: N5 word Obsidian is `287/287`, N4 word structural Platinum is `700/700`, N4 word Obsidian is `700/700`, total N5/N4 word Obsidian is `987/987`, `0` N4 rows still need Obsidian proof, and `0` generated N5/N4 word rows are blocked/failing.
- Kept N5/N4 word generation ready with deferred variants: live word generation reports `987` word notes, N5 reading coverage `239/344` (`69.5%`), N4 reading coverage `579/755` (`76.7%`), and word audio plus pitch fields ready for all `987` generated rows.
- Expanded and governed the word inventory and reading-coverage work across N5/N4 while preserving separate Silver, Gold, Platinum, and Obsidian semantics; N3/N2/N1 word surfaces remain Silver starter material and do not imply release certification.
- Clarified the Unreleased source-evidence baseline after live verification: current routed assignment files and pinned worksheet baselines contain Sou Matome `498` reviewed / `417` source-access-gap / `1297` pending rows, Shin Kanzen `406` reviewed / `236` source-access-gap / `1570` pending rows, and ASK Hajimete `208` reviewed / `0` source-access-gap / `0` pending rows.
- Strengthened source/release governance around JLPT evidence, editorial policy, deterministic exports, CI, benchmark guardrails, and NLP assistive-only boundaries; NLP artifacts remain support context and cannot certify cards.

### Fixed

- Corrected the N4 word card support note for `自業自得|じごうじとく` so the higher-level constituent `得` is consistently identified as a JLPT N2 support kanji before Obsidian proof is counted.

## [1.0.0] - 2026-03-31

### Added

- Deterministic kanji and word deck build pipelines with managed media packaging.
- Cross-platform CI smoke verification, Ubuntu release gates, and toolchain readiness reporting.
- Repository governance policy checks for CODEOWNERS, protected branch expectations, and pull request review rules.
