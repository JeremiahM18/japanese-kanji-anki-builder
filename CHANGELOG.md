# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Added `deck:words:coverage-uplift`, a read-only word coverage diagnostic that reports whether harder word decks backfill a selected target level's kanji-reading coverage across any valid same-or-harder N1-N5 range without changing readiness, deferrals, review lanes, data, media, or proof ledgers.

### Changed

- Expanded active N3 word Silver coverage from `359` to `1081` canonical rows and N3 word Gold review from `8/1081` to `144/1081`. The scoped `0.2.0` lock remains limited to N5/N4 words plus N5/N4/N3/N2 core kanji; N3 word is not locked/released. Gold now has `937` generated rows still missing; Sapphire and Platinum remain at `8/1081` current-standard with `1073` generated rows still missing each lane; N3-only reading readiness remains incomplete, and no N3 word Obsidian proof is recorded.

Release notes are intentionally release-facing. Per-card and per-batch review detail belongs in git commit messages, tracked review manifests, and gate output; use live commands for release decisions. The scoped `0.2.0` lock covers N5/N4 words plus N5/N4/N3/N2 core kanji; N3/N2/N1 word lanes remain active ongoing work until separately locked.

## [0.2.0] - 2026-06-10

Release notes are intentionally release-facing. Per-card and per-batch review detail belongs in git commit messages, tracked review manifests, and gate output; use live commands for release decisions.

### Added

- Added the scoped `0.2.0` Obsidian release lock for N5/N4 words plus N5/N4/N3/N2 core kanji, including fail-closed certification evidence, APKG paths, note/card counts, media completeness, and SHA-256 checksums.
- Added first-class core-kanji Sapphire review sets, commands, schema validation, batch reporting, and reviewed-input promotion, with Deck Ready explicitly scoped as mechanical artifact readiness outside the Silver/Gold/Sapphire/Platinum/Obsidian trust ladder.
- Added first-class word Sapphire review sets, commands, schema validation, and batch reporting, preserving N5/N4 structural coverage at `987/987` while keeping legacy word Platinum manifests as compatibility/proof-provider inputs.
- Added word-study local-data staleness fingerprints and preflight warnings to the word init, Sapphire, and Platinum commands so stale ignored starter-derived data is diagnosed before card-level gate failures.
- Added a program-wide review-system forward contract that keeps candidate queues pre-trust, preserves Silver/Gold/Sapphire/Platinum/Obsidian lane authority, makes Sapphire structural, and keeps Platinum as card-surface inspection.
- Added a governed KANJIDIC2/EDRDG kanji on/kun reading-reference contract covering the tracked JLPT kanji inventory, with source-use limits, raw source identity, attribution, loader/audit tests, and tracked-source kanji preflight integration.
- Added governed N5, N4, and N3 kanji card-field source contracts derived from current-standard Platinum Japanese-source evidence, with manual field-bound citation limits, source-origin independence context, loader/audit tests, and tracked-source kanji preflight certification for N5/N4/N3 source availability.
- Completed the governed N2 kanji Platinum lane and canonical N2 kanji Obsidian proof ledger at `349/349` with `0` remaining and `0` blocked/failing, while keeping release readiness unclaimed.
- Added source-derived tracked-source kanji TSV artifact gates: N5, N4, and N3 now build from tracked JLPT, KANJIDIC2 reading-reference, card-field source, and component contracts only, while the all-level gate reports N2/N1 as fail-closed until their governed field-source contracts exist. The N5 readiness checkpoint now runs the N5 kanji TSV gate, and the APKG/media/manual QA gate refuses release certification without packaging and human QA evidence.
- Added a release QA evidence packet template and fail-closed `product:release-qa:evidence` validator for APKG import, managed media, manual Anki import, mobile, accessibility, listening QA, accepted source-governance posture while source depth is incomplete, and known blocker evidence.
- Added explicit N4 and N3 tracked-source kanji preflight and TSV npm aliases so level release checks do not depend on memorized script arguments or an all-level gate that intentionally fails on uncontracted higher levels.

### Changed

- Raised the project runtime floor from Node 18 to Node 20 and updated CI, branch-protection policy, hosted required checks, and compatibility docs to verify Node 20/22 only.
- Corrected the package metadata baseline from `1.0.0` to `0.1.0` because no matching git tag exists and product release readiness remains unclaimed.
- Added the repository `LICENSE` file for the declared ISC code license and documented the separate shipped-content attribution boundary.

### Security

- Verified and remediated hosted GitHub owner settings for `main`: branch protection now matches the tracked policy, secret scanning, push protection, private vulnerability reporting, Dependency Graph, vulnerability alerts, and Dependabot security updates are enabled; hosted CodeQL, secret-scanning, and Dependabot open alert counts are `0`; the live gate still fails on unproven hosted attestation verification.
- Strengthened `security:github-settings` so it validates hosted branch protection against the tracked policy, fails on disabled secret scanning, push protection, vulnerability alerts, unreadable Dependency Graph SBOM, disabled or paused Dependabot security updates, and nonzero open CodeQL, secret-scanning, or Dependabot alert counts.
- Added `security:github-settings:auth`, an authenticated hosted audit wrapper that uses `GH_TOKEN`, `GITHUB_TOKEN`, or GitHub CLI token lookup without printing the token.
- Split release trust into strict `security:release-trust` and tagged-workflow `security:release-trust:pre` so hosted attestation proof is not required before the release workflow can create the attestations it must later prove.
- Added tracked release-bundle attestation verification with `gh attestation verify`, signer-workflow, source-ref, and source-digest constraints before tagged release bundle upload.
- Remediated live CodeQL alert patterns in tracked code by hardening audio output path containment, ruby parsing, tracked-file secret scanning, atomic file writes, canonical proof-ledger JSONL appends, documentation URL assertions, and duplicate regex character classes.
- Added a live GitHub repository settings audit for hosted branch protection, security-alert visibility, private vulnerability reporting, Dependency Review, release attestation creation, and attestation-verification evidence.
- Added formal DevSecOps P1 security operations docs: threat model, risk and exception register, incident response runbook, and recovery/rollback runbook.
- Added a tracked security requirements traceability matrix and `security:requirements` gate wired into CI and tagged release workflows.
- Added a formal security training checklist plus tracked SDLC security metrics contract and `security:sdlc-metrics` gate wired into CI and tagged release workflows.
- Added dependency-license compliance automation with `security:licenses`, a tracked dependency license policy, fail-closed reviewed exceptions, CI/release workflow gates, and tagged release dependency-license summaries at `out/security/dependency-licenses.json`.
- Documented the recurring supply-chain maintenance snapshot for lifecycle-script package review, reviewed license exception cadence, and the current 2026-07-02 sharp/libvips license exception review date.
- Added explicit hostile-input security regression tests for Anki HTML rendering, word candidate source parsing, managed media paths, generated-output cleanup guards, VOICEVOX Docker helper arguments, and supply-chain mutation abuse.
- Hardened the governed VOICEVOX Docker helper beyond localhost binding: managed containers now require `no-new-privileges`, `cap-drop ALL` with only `SETUID`/`SETGID` restored for the image entrypoint, `--restart no`, Docker `--init`, and explicit memory, CPU, and process-count limits, with stale containers requiring intentional recreation.
- Added tagged release artifact attestations: release bundles now generate provenance and SBOM attestations with a job-scoped GitHub OIDC permission exception.
- Added deterministic CycloneDX SBOM generation from `package-lock.json`; CI validates the SBOM model, and tagged release bundles write, checksum, and upload `out/security/sbom.cdx.json`.
- Added pinned CodeQL code scanning for JavaScript/TypeScript and GitHub Actions workflow analysis, with exact required branch-protection checks and a scoped `security-events: write` exception for code-scanning uploads.
- Added `security:secrets`, a tracked-file secret audit for high-confidence token and private-key patterns, and wired it into CI/release before dependency installation.
- Added tracked branch-protection policy-as-code with `security:branch-protection`, covering required main-branch protections, required CI checks, docs alignment, and release/CI governance.
- Added mandatory npm advisory and GitHub dependency-review gates: CI now runs a protected `Advisory Audit Ubuntu Node 22` job, pull requests run pinned `actions/dependency-review-action` at `moderate` severity or higher, and tagged release workflows run `security:advisories` before artifact generation.
- Added a deterministic supply-chain audit gate for lockfile registry/integrity, reviewed install-script packages, pinned GitHub Actions, minimal workflow permissions, and release-artifact boundaries; CI and tagged release jobs now run it before `npm ci`.
- Hardened local network defaults: the Express dev server now binds to `127.0.0.1` unless `SERVER_HOST` explicitly opts into another host, and the governed VOICEVOX Docker helper now requires/recreates a local-only `127.0.0.1:50021:50121` port binding instead of accepting a broad host-port publish.
- Hardened Anki HTML rendering boundaries: generated kanji and word TSV exports now escape external text before it enters HTML-rendered fields while preserving the known-safe ruby, pitch-contour, audio, and stroke-order markup emitted by the exporter.
- Hardened local XML source normalization by disabling entity expansion in the KANJIDIC2 parser and locking both KANJIDIC2 and JMdict entity-handling behavior with regression tests.
- Added `SECURITY.md` plus a concise README security posture section documenting the local-only server threat model, VOICEVOX localhost expectation, untrusted local input boundary, and private vulnerability-reporting path.

### Changed

- Migrated core-kanji structural review posture into native Sapphire: N5/N4/N3/N2 pass at full generated denominators, and N1 now reports `328/1230` current-standard Sapphire, `328/1230` current-standard Platinum card-surface inspection, `0/1230` Obsidian proof, and `902` rows still requiring fresh Sapphire and Platinum review before proof is recorded.
- Clarified that scoped audio review packets are selected-card evidence only; full-level media completeness remains owned by `deck:ready` plus audio and stroke-order policy audits.
- Completed the governed N3 core kanji Obsidian proof lane while keeping certification fail-closed: live N3 kanji is `341/341` generated, Gold, Platinum, and Obsidian certified; N5/N4/N3 kanji Obsidian now totals `633/633`; `0` Platinum entries need substantive Obsidian proof; and `0` generated rows are blocked/failing structurally. N3 kanji NLP packets remain assistive review context only, not certification proof.
- Fixed Gold/Platinum review matching so escaped Anki HTML fields are checked against their visible learner-facing text, preserving safer TSV output without invalidating existing review evidence that protects `kanji -> reading` notes and escaped example translations.
- Fixed native kanji Sapphire matching so escaped generated fields are checked against visible learner-facing text, restoring the fail-closed N5/N3 Sapphire, Platinum, and scoped Obsidian gates without loosening protected snippets.
- Fixed native word Sapphire matching so escaped generated fields are checked against visible learner-facing text and legacy comma-joined breakdown snippets are matched as individual visible breakdown claims.
- Completed the governed N4 word Obsidian proof lane while keeping certification fail-closed: N5 word Obsidian is `287/287`, N4 word Platinum is `700/700`, N4 word Obsidian is `700/700`, total N5/N4 word Obsidian is `987/987`, `0` N4 rows still need Obsidian proof, and `0` generated N5/N4 word rows are blocked/failing.
- Clarified Obsidian as the current non-human governed native/fluent-quality content-certification lane, with future human/native review treated as human-reviewed provenance for the same standard rather than a different or higher content bar.
- Kept N5/N4 word generation ready with deferred variants: live word generation reports `987` word notes, N5 reading coverage `233/344` (`67.7%`), N4 reading coverage `579/755` (`76.7%`), and word audio plus pitch fields ready for all `987` generated rows.
- Expanded and governed the word inventory and reading-coverage work across N5/N4 while preserving separate Silver, Gold, Platinum, and Obsidian semantics; at the `0.2.0` lock point, N3 word remained active expansion work with `359` Silver rows and an initial `8/359` Gold, Sapphire, and Platinum current-standard batch, while N2/N1 word surfaces remained Silver starter material and no upper-word surface implied release certification.
- Corrected weak Sou Matome table-of-contents rows to non-voting source-access-gap status after live verification: current routed assignment files and pinned worksheet baselines contain Sou Matome `442` reviewed / `473` source-access-gap / `1297` pending rows, Shin Kanzen `406` reviewed / `236` source-access-gap / `1570` pending rows, and ASK Hajimete `208` reviewed / `0` source-access-gap / `0` pending rows.
- Strengthened source/release governance around JLPT evidence, editorial policy, deterministic exports, CI, benchmark guardrails, and NLP assistive-only boundaries; NLP artifacts remain support context and cannot certify cards.

### Fixed

- Reworked the tracked kanji Platinum regression test so clean CI no longer reads ignored `data/kanji_jlpt_only.json`, and added a source-boundary guard that rejects tracked tests reading ignored root `data/*` inputs.
- Corrected the N3 kanji `退|たい` support notes so every support vocabulary item contains the target kanji before recording Obsidian proof.
- Corrected the N3 kanji `額|がく` support note and primary meaning lane so `がく` is centered on amount/frame while forehead remains in broader/support lanes before recording Obsidian proof.
- Corrected the N4 word card support note for `自業自得|じごうじとく` so the higher-level constituent `得` is consistently identified as a JLPT N2 support kanji before Obsidian proof is counted.

## [0.1.0] - 2026-03-31

### Added

- Deterministic kanji and word deck build pipelines with managed media packaging.
- Cross-platform CI smoke verification, Ubuntu release gates, and toolchain readiness reporting.
- Repository governance policy checks for CODEOWNERS, protected branch expectations, and pull request review rules.
