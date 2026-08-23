# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Added a fail-closed word multi-lane status process and repeatable diagnostic benchmark. The status process deep-freezes and shares only loaded inputs/read-only indexes while keeping Silver, Gold, Sapphire, Platinum, and Obsidian evaluator results and authority independent; no review counts, proof, denominators, or release posture are changed.
- Hardened the word multi-lane status and benchmark so invalid explicit JLPT level tokens fail closed, missing or legacy Obsidian proof remains current-version backlog, observed-but-invalid current-version Obsidian proof is reported as a reviewed evidence failure, and duplicate generated-row occurrences remain distinct while multiple failure reasons for one occurrence are classified once.
- Completed twelve sequential eight-card N4 word Platinum batches, advancing current-standard card-surface inspection from `892/1034` to `988/1034` with `46` expected missing rows; exact review also repaired three learner-facing English/Sapphire evidence defects and four learner-visible disclosures for governed generated-pitch limitations without treating those limitations as passed evidence or creating Obsidian proof.
- Completed the final six sequential N4 word Platinum batches (five batches of eight and one final batch of six), advancing current-standard card-surface inspection from `988/1034` to `1034/1034` with an empty queue. Exact review repaired learner-visible generated-pitch disclosures for `語学力|ごがくりょく` and `食料品店|しょくりょうひんてん` and corrected stale Sapphire example evidence for `語学力|ごがくりょく`; both pitch limitations remain explicitly externally unverified, and no Obsidian proof was created.
- Completed N4 word Obsidian v2.5 batches 013-024, advancing current sentence-audio-bound substantive proof from `96/1034` to `192/1034` with `842` rows remaining and `0` blocked or failing. The `96` new events were appended through the governed canonical JSONL ledger; SQLite and compatibility JSON remain generated mirrors, and this milestone does not claim human, native-speaker, listening, device, production, or release-readiness review.
- Made JLPT word source-depth audits fail closed on every declared policy requirement: selected-level audits now preserve the complete operational-contract denominator, dictionary/commonness support requires explicit reviewed claims, source-use and assignment defects are governance failures, and source assignment plus manifest writes commit through one governed transaction. No source evidence was added, so N4 remains `0/1034` at `level_universe_standard`, with `699` single-family and `335` unevaluated identities.
- Keep this section release-facing; batch history remains in git commit messages and tracked review manifests.

## [0.3.0-beta.5] - 2026-08-01

`0.3.0-beta.5` is the current published N5-only **automation-reviewed preview**. Tagged workflow `30726889778` succeeded at commit `b9a820630cec9d53ebec8e06969ee0d4f658fba1`, published seven checksummed assets, retained the immutable Actions bundle, and proved all-file constrained attestations. It contains only the core N5 kanji and core N5 word APKGs; N4 through N1, additional-unverified kanji, production/GA, and human/device approval remain excluded.

### Changed

- Published the exact beta.5 candidate through the tag-bound Release workflow, independently verified all `6/6` checksum-manifest members and `7/7` constrained attestations from a fresh download, and proved immutable Actions artifact `8826672122` matches the seven published assets byte-for-byte.
- Recorded the successful beta.4 hosted and downloaded verification, mitigated `SEC-P0-004`, implemented `SEC-REQ-007`, and removed their obsolete pre-release deferrals only after checksum, SBOM, immutable Actions evidence, `7/7` constrained attestation, and owner-authenticated hosted-setting proof passed.
- Reconciled the N5 reading-gap plan into `99` exact governed dispositions covering `83` missing reading targets and `16` variant gaps without adding unsupported cards; the dispositions are workflow evidence, not a claim of `99` new deck rows.
- Made N5 word readiness fail closed on reading-override drift and added a regression proving the coordinator forwards the required scope argument.
- Remediated the Sharp advisory with a fail-closed Transformers compatibility boundary, executable import/task analysis, current embedding validation, and hosted CI coverage while preserving the explicit no-image/vision authority boundary.
- Bound every reviewed dependency-license exception to an exact package version and refreshed the due hosted, local-runtime, hostile-input, source-governance, and assistive-only NLP risk evidence without hiding the stopped-Docker or incomplete-source-depth limitations.
- Preserved the downstream backlog outside this N5 release: N3 word Gold review from `8/1099` to `1081/1099`; Gold now has `18` generated rows still missing, Sapphire remains `1038/1099`, Platinum remains `8/1099`, no N3 word Obsidian proof is recorded, and N3 stays excluded.

## [0.3.0-beta.4] - 2026-08-01

`0.3.0-beta.4` is the first published N5-only **automation-reviewed preview**. Tagged workflow `30706783927` succeeded at commit `f9b7c3f2423c5f26edc3c88857e3aedac44aeede`, published seven checksummed assets, retained the immutable Actions bundle, and proved all-file constrained attestations. The immutable `v0.3.0-beta.3` workflow passed the complete verification job and every bundle step through attestation verification, then failed closed before publication because `actions/upload-artifact` excluded the hidden `.release-bundle` directory. Its draft, tag, workflow run, and attestations remain immutable failure evidence.

### Changed

- Made the immutable Actions evidence upload explicitly include the hidden `.release-bundle` directory, with independent release-policy and supply-chain audit regressions that fail if the opt-in is removed.
- Advanced the release candidate to `v0.3.0-beta.4`; `v0.3.0-beta.1`, `v0.3.0-beta.2`, and `v0.3.0-beta.3` remain failed, unpublished attempts and must not be moved, deleted for reuse, or represented as releases.
- Preserved the tracked downstream backlog outside this N5 release: N3 word Gold review from `8/1099` to `1081/1099`; Gold now has `18` generated rows still missing, current-standard Sapphire remains `1038/1099`, Platinum remains `8/1099`, and N3 word remains excluded from this candidate.

## [0.3.0-beta.3] - 2026-08-01

`0.3.0-beta.3` was an N5-only **automation-reviewed preview** attempt. Its immutable tagged workflow passed the complete verification job and every bundle gate through attestation verification, then failed closed because the hidden `.release-bundle` directory was excluded from the immutable Actions artifact upload. Publication was skipped, and no beta.3 release was published.

### Added

- Added an explicit `product:readiness:n5 -- --tracked-only` hosted mode that derives its runtime level map from the tracked JLPT contract, isolates every ignored data/cache/media/build path in a disposable workspace, runs only clean-checkout-compatible checks, and states the local evidence it does not prove.
- Extended release APKG inspection with mandatory `--require-golden` release evidence: all 80 packaged N5 kanji notes and all 588 exact `written|reading` word notes must satisfy their tracked full-level Golden fields with no missing, duplicate, unmatched, or extra rows.
- Added regressions for tracked-only scope forwarding and input isolation, cleanup of the generated workspace, exact packaged Golden coverage, and fail-closed Golden field mismatch behavior.

### Changed

- The tagged Release workflow now combines the six-check clean-hosted N5 coordinator with exact downloaded-APKG Golden inspection, while the packet remains bound to the full local-data N5 coordinator and managed-media evidence.
- Advanced the immutable release candidate to `v0.3.0-beta.3`; `v0.3.0-beta.1` and `v0.3.0-beta.2` remain failed, unpublished evidence and must not be moved or reused.
- Preserved the tracked downstream backlog outside this N5 release: N3 word Gold review from `8/1099` to `1081/1099`; Gold now has `18` generated rows still missing, current-standard Sapphire remains `1038/1099`, Platinum remains `8/1099`, and N3 word remains excluded from this candidate.

## [0.3.0-beta.2] - 2026-08-01

`0.3.0-beta.2` was an N5-only **automation-reviewed preview** attempt. Its immutable tagged workflow failed closed at the N5 readiness coordinator because a clean checkout does not contain ignored local JLPT runtime data. No bundle, attestation, or published beta.2 release was created. Human desktop/mobile/screen-reader/listening/stroke-sequence QA was not performed or claimed.

### Added

- Added a version-3 release evidence contract that binds the semantic version, tag, full commit, release class, candidate run, per-deck N5 scope, release asset names, APKG byte sizes/SHA-256 values, note/card/media counts, automated evidence, and explicit accepted-risk limitations.
- Added independent APKG structural inspection for ZIP safety and integrity, media-map/archive membership, SQLite integrity/schema, Anki collection version, exact deck/note/card/media counts, note field cardinality, GUID/card references, and packaged media references.
- Corrected word APKG note GUIDs to use exact `written|reading` identity, keeping same-written alternate readings distinct; earlier locally generated word decks should be removed or tested in a fresh Anki profile before importing this preview.
- Added durable tagged-release publication for the exact N5 APKGs, release evidence packet, SBOM, dependency-license inventory, checksums, provenance, and attestations.
- Scoped `contents: write` to the release verification job so GitHub can expose the private draft inputs to that job, while keeping publication and attestation permissions isolated to the bundle job; early boundary failures now preserve the primary error instead of failing a second time on empty diagnostics.
- Added `docs:status-audit`, a tracked documentation status guard that compares README, CHANGELOG, CLAUDE, workflow, command-reference, verification, architecture, and overview status language against current review counts, generated denominators, npm command routing, and Silver/Gold/Sapphire/Platinum/Obsidian boundaries.
- Added `deck:words:coverage-uplift`, a read-only word coverage diagnostic that reports whether harder word decks backfill a selected target level's kanji-reading coverage across any valid same-or-harder N1-N5 range without changing readiness, deferrals, review lanes, data, media, or proof ledgers.
- Added `deck:words:sapphire:promote`, a fail-closed reviewed-input merger for word Sapphire candidate JSON that validates live generated rows, matching Gold preconditions, and current-standard Sapphire evidence lanes before writing tracked word Sapphire manifests.

### Changed

- Defined one exact N5-only release candidate and excluded N4/N3/N2/N1 plus additional-unverified kanji from `0.3.0-beta.2`.
- Preserved the existing human/product QA gate for future production/GA releases while permitting only a conspicuously labeled GitHub prerelease to carry the owner-accepted `PROD-REL-001` limitations.
- Upgraded the release QA evidence contract to packet version 3: the validator binds package version, tag, current Git HEAD, release class, candidate run, exact per-deck level scope, local path, release asset name, note/card/media counts, byte size, SHA-256, commit-bound evidence, production-versus-preview policy, source posture, and exact downloaded asset membership.
- Extended `deck:review:accessibility` with fail-closed `--run-id`, `--levels`, and governed `--out-dir-base` selection plus descriptor-verified package-summary reads so release-candidate reviews audit the intended isolated package and reject summary, exports-directory, symbolic-link, or path-swap drift.
- Advanced the N4 word Silver generated surface through governed common-pool review from `739` to `1001` rows, raising the all-level word denominator from `2525` to `2787` and the current N5/N4 word Obsidian v2.5 denominator from `1327` to `1589`; the new N4 rows remain lower-lane backlog until Gold, Sapphire, Platinum, and Obsidian catch up.
- Updated word lane status after the full N5 routed move-candidate target-level sweep: active N3 Silver is now `1099/1099` canonical rows, N3 word Gold review from `8/1099` to `1081/1099` is partial, Gold now has `18` generated rows still missing Gold, and current-standard Sapphire remains `1038/1099` with `61` generated rows still missing Sapphire. Platinum remains `8/1099` current-standard with `1091` generated rows still missing Platinum; N2 and N1 Silver card fields are complete at `61/61` and `38/38`; reading readiness remains incomplete for N3/N2/N1; N3 word is not locked/released; and no N3 word Obsidian proof is recorded.

Release notes are intentionally release-facing. Per-card and per-batch review detail belongs in git commit messages, tracked review manifests, and gate output; use live commands for release decisions. This failed candidate covered only N5 core kanji and N5 core words. The broader scoped `0.2.0` historical lock did not expand the `0.3.0-beta.2` artifact scope.

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
- Added the repository `LICENSE` file for the declared ISC code license and documented the separate shipped-content attribution boundary.

### Changed

- Raised the project runtime floor from Node 18 to Node 20 and updated CI, branch-protection policy, hosted required checks, and compatibility docs to verify Node 20/22 only.
- Corrected the package metadata baseline from `1.0.0` to `0.1.0` because no matching git tag exists and product release readiness remains unclaimed.
- Migrated core-kanji structural review posture into native Sapphire: N5/N4/N3/N2 pass at full generated denominators, and N1 now reports `328/1230` current-standard Sapphire, `328/1230` current-standard Platinum card-surface inspection, `0/1230` Obsidian proof, and `902` rows still requiring fresh Sapphire and Platinum review before proof is recorded.
- Clarified that scoped audio review packets are selected-card evidence only; full-level media completeness remains owned by `deck:ready` plus audio and stroke-order policy audits.
- Completed the governed N3 core kanji Obsidian proof lane while keeping certification fail-closed: live N3 kanji is Obsidian-certified at `341/341`; N5/N4/N3 kanji Obsidian now totals `633/633`; lower-lane prerequisites are complete; and `0` generated rows are blocked/failing structurally. N3 kanji NLP packets remain assistive review context only, not certification proof.
- Completed the governed N4 word Obsidian proof lane while keeping certification fail-closed: N5 word Obsidian is `287/287`, N4 word Obsidian is `700/700`, total N5/N4 word Obsidian is `987/987`, lower-lane prerequisites are complete, `0` N4 rows still need Obsidian proof, and `0` generated N5/N4 word rows are blocked/failing.
- Clarified Obsidian as the current non-human governed native/fluent-quality content-certification lane, with future human/native review treated as human-reviewed provenance for the same standard rather than a different or higher content bar.
- Kept N5/N4 word generation ready with deferred variants: live word generation reports `987` word notes, N5 reading coverage `233/344` (`67.7%`), N4 reading coverage `579/755` (`76.7%`), and word audio plus pitch fields ready for all `987` generated rows.
- Expanded and governed the word inventory and reading-coverage work across N5/N4 while preserving separate Silver, Gold, Sapphire, Platinum, and Obsidian semantics; at the `0.2.0` lock point, N3 word remained active expansion work with `359` Silver rows and an initial `8/359` Gold, Sapphire, and Platinum current-standard batch, while N2/N1 word surfaces remained Silver starter material and no upper-word surface implied release certification.
- Strengthened source/release governance around JLPT evidence, editorial policy, deterministic exports, CI, benchmark guardrails, and NLP assistive-only boundaries; NLP artifacts remain support context and cannot certify cards.

### Fixed

- Fixed Gold/Platinum review matching so escaped Anki HTML fields are checked against their visible learner-facing text, preserving safer TSV output without invalidating existing review evidence that protects `kanji -> reading` notes and escaped example translations.
- Fixed native kanji Sapphire matching so escaped generated fields are checked against visible learner-facing text, restoring the fail-closed N5/N3 Sapphire, Platinum, and scoped Obsidian gates without loosening protected snippets.
- Fixed native word Sapphire matching so escaped generated fields are checked against visible learner-facing text and legacy comma-joined breakdown snippets are matched as individual visible breakdown claims.
- Corrected weak Sou Matome table-of-contents rows to non-voting source-access-gap status after live verification: current routed assignment files and pinned worksheet baselines contain Sou Matome `442` reviewed / `473` source-access-gap / `1297` pending rows, Shin Kanzen `406` reviewed / `236` source-access-gap / `1570` pending rows, and ASK Hajimete `208` reviewed / `0` source-access-gap / `0` pending rows.
- Reworked the tracked kanji Platinum regression test so clean CI no longer reads ignored `data/kanji_jlpt_only.json`, and added a source-boundary guard that rejects tracked tests reading ignored root `data/*` inputs.
- Corrected the N3 kanji `退|たい` support notes so every support vocabulary item contains the target kanji before recording Obsidian proof.
- Corrected the N3 kanji `額|がく` support note and primary meaning lane so `がく` is centered on amount/frame while forehead remains in broader/support lanes before recording Obsidian proof.
- Corrected the N4 word card support note for `自業自得|じごうじとく` so the higher-level constituent `得` is consistently identified as a JLPT N2 support kanji before Obsidian proof is counted.

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
- Added dependency-license compliance automation with `security:licenses`, a tracked dependency license policy, fail-closed reviewed exceptions, CI/release workflow gates, and tagged `.release-bundle/dependency-licenses.json` publication.
- Documented the recurring supply-chain maintenance snapshot for lifecycle-script package review, reviewed license exception cadence, and the current 2026-07-02 sharp/libvips license exception review date.
- Added explicit hostile-input security regression tests for Anki HTML rendering, word candidate source parsing, managed media paths, generated-output cleanup guards, VOICEVOX Docker helper arguments, and supply-chain mutation abuse.
- Hardened the governed VOICEVOX Docker helper beyond localhost binding: managed containers now require `no-new-privileges`, `cap-drop ALL` with only `SETUID`/`SETGID` restored for the image entrypoint, `--restart no`, Docker `--init`, and explicit memory, CPU, and process-count limits, with stale containers requiring intentional recreation.
- Added tagged release artifact attestations: release bundles now generate provenance and SBOM attestations with a job-scoped GitHub OIDC permission exception.
- Added deterministic CycloneDX SBOM generation from `package-lock.json`; CI validates the SBOM model, and tagged release bundles write, checksum, attest, verify, and upload `.release-bundle/sbom.cdx.json`.
- Added pinned CodeQL code scanning for JavaScript/TypeScript and GitHub Actions workflow analysis, with exact required branch-protection checks and a scoped `security-events: write` exception for code-scanning uploads.
- Added `security:secrets`, a tracked-file secret audit for high-confidence token and private-key patterns, and wired it into CI/release before dependency installation.
- Added tracked branch-protection policy-as-code with `security:branch-protection`, covering required main-branch protections, required CI checks, docs alignment, and release/CI governance.
- Added mandatory npm advisory and GitHub dependency-review gates: CI now runs a protected `Advisory Audit Ubuntu Node 22` job, pull requests run pinned `actions/dependency-review-action` at `moderate` severity or higher, and tagged release workflows run `security:advisories` before artifact generation.
- Added a deterministic supply-chain audit gate for lockfile registry/integrity, reviewed install-script packages, pinned GitHub Actions, minimal workflow permissions, and release-artifact boundaries; CI and tagged release jobs now run it before `npm ci`.
- Hardened local network defaults: the Express dev server now binds to `127.0.0.1` unless `SERVER_HOST` explicitly opts into another host, and the governed VOICEVOX Docker helper now requires/recreates a local-only `127.0.0.1:50021:50121` port binding instead of accepting a broad host-port publish.
- Hardened Anki HTML rendering boundaries: generated kanji and word TSV exports now escape external text before it enters HTML-rendered fields while preserving the known-safe ruby, pitch-contour, audio, and stroke-order markup emitted by the exporter.
- Hardened local XML source normalization by disabling entity expansion in the KANJIDIC2 parser and locking both KANJIDIC2 and JMdict entity-handling behavior with regression tests.
- Added `SECURITY.md` plus a concise README security posture section documenting the local-only server threat model, VOICEVOX localhost expectation, untrusted local input boundary, and private vulnerability-reporting path.

## [0.1.0] - 2026-03-31

### Added

- Deterministic kanji and word deck build pipelines with managed media packaging.
- Cross-platform CI smoke verification, Ubuntu release gates, and toolchain readiness reporting.
- Repository governance policy checks for CODEOWNERS, protected branch expectations, and pull request review rules.
