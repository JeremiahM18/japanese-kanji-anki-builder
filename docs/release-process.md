# Release Process

This document defines tagged release procedure.

## Versioning rules

- Update `package.json` version intentionally.
- Add a dated section to [CHANGELOG.md](../CHANGELOG.md) for every released version.
- Keep `## [Unreleased]` at the top of the changelog while work is in flight.
- Keep `## [Unreleased]` release-facing and concise. Detailed per-card and per-batch review history belongs in git commit messages, tracked review manifests, and gate output, not in the tagged release bundle.
- Create Git tags as `v<package.json version>`, for example `v1.0.0`.

## Release checklist

1. Confirm `npm test`, `npm run lint`, `npm run typecheck`, `npm run supply-chain:audit`, `npm run security:advisories`, `npm run security:branch-protection`, `npm run security:secrets`, `npm run security:sbom`, `npm run ci:smoke`, `npm run deck:kanji:review-status`, `npm run product:artifacts:n5` when N5 word ships, the matching `npm run product:artifacts:kanji:n<level>:preflight` and `npm run product:artifacts:kanji:n<level>` commands for every shipped N5/N4/N3 kanji level, `npm run product:artifacts:kanji:all` before cross-level kanji claims, `npm run product:artifacts:kanji:release-qa` before kanji release-ready claims, `npm run product:readiness:n5` when N5 ships, `npm run nlp:governance-gate` when assistive NLP manifests, runtimes, artifact contracts, or governance docs changed, and `npm run release:gate` are green on the release commit. If additional unverified kanji decks ship, also run `npm run deck:kanji:additional:ready`, all applicable `npm run deck:kanji:additional:review:n*` commands, and any applicable `npm run deck:kanji:additional:platinum:n*` commands. `supply-chain:audit` checks lockfile registry/integrity, reviewed install-script packages, pinned GitHub Actions, workflow permissions, and release-artifact boundaries. `security:advisories` checks live npm advisory data at the release moment. `security:branch-protection` checks the tracked main-branch protection policy, docs, and CI required-check names. `security:secrets` scans tracked files for high-confidence token and private-key patterns. `security:sbom` validates deterministic CycloneDX SBOM generation from the lockfile; tagged release bundles write and checksum `out/security/sbom.cdx.json`. Protected-branch CodeQL checks must be green for JavaScript/TypeScript and GitHub Actions workflow scanning before tagging. `product:artifacts:n5` is currently scoped to tracked-source N5 word TSV generation. `product:artifacts:kanji:n5`, `product:artifacts:kanji:n4`, and `product:artifacts:kanji:n3` build source-derived kanji TSVs from tracked contracts only; `product:artifacts:kanji:all` fails closed for any selected level without a governed card-field source contract. `product:artifacts:kanji:release-qa` is intentionally blocked until APKG, managed-media, and human QA evidence is present. `product:readiness:n5` is an automated N5 checkpoint, not a manual QA substitute. `release:gate` validates smoke-fixture artifacts and packaging contracts; it does not certify public product deck readiness.
2. Run the manual [release QA checklist](release-qa-checklist.md), including the current level-specific Gold regression, Platinum gate where applicable, accessibility review, and Anki spot-review expectations.
3. Confirm the intended release still matches the [compatibility matrix](compatibility-matrix.md).
4. Confirm [CHANGELOG.md](../CHANGELOG.md) includes the exact released version and date.
5. Confirm [NOTICE.md](../NOTICE.md) reflects required shipped attribution.
6. Push the release commit to `main` through the protected pull-request flow.
7. Create and push the matching `v*` tag.
8. Let [.github/workflows/release.yml](../.github/workflows/release.yml) produce the tagged release artifacts, CycloneDX SBOM, checksum manifest, provenance attestation, and SBOM attestation.
9. Verify downloaded release artifacts against `release-artifacts.sha256` and the GitHub artifact attestations before distributing release claims outside the repository.

## Gate boundaries

| Gate | Proves | Does not prove |
| --- | --- | --- |
| `release:gate` | Smoke-fixture TSV headers, package directories, packaged media presence, governed audio policy, and optional smoke-fixture `.apkg` creation when packaging tools are required. | Public product readiness, level-specific Gold/Platinum completion, manual Anki import QA, learner UX, accessibility, or listening QA. |
| `product:readiness:n5` | The current automated N5 checkpoint: JLPT audits, audio policy, tracked-source N5 word artifact, tracked-source N5 kanji TSV artifact, word placement audit, and N5 Gold regression checks. | Platinum completion, all-level tracked-source kanji certification, fresh product `.apkg` approval, manual import QA, mobile QA, screen-reader QA, or listening QA. |
| `product:artifacts:n5` | Fresh tracked-source N5 word TSV generation from tracked templates only, with deterministic output and canonical-row checks. | Kanji TSV certification, managed-media packaging, `.apkg` release approval, or manual card QA. |
| `product:artifacts:kanji:n5:preflight` | Whether tracked templates are sufficient for N5 kanji TSV source availability without ignored local `data/` inputs, including level, starter meaning, component, reading-reference, and card-field source-provenance contracts. | Fresh kanji TSV generation, `.apkg` packaging, managed-media QA, manual import review, Obsidian certification, or deck readiness by itself. |
| `product:artifacts:kanji:n5` | Fresh source-derived N5 kanji TSV generation from tracked contracts only, with schema, row count, required field, primary-reading reference, and deterministic-output checks. | `.apkg` packaging, managed media/listening QA, manual Anki import review, Obsidian certification, or release readiness by itself. |
| `product:artifacts:kanji:n4:preflight` / `product:artifacts:kanji:n3:preflight` | Whether tracked templates are sufficient for N4 or N3 kanji TSV source availability without ignored local `data/` inputs, including level, starter meaning, component, reading-reference, and level-specific card-field source-provenance contracts. | Fresh kanji TSV generation, `.apkg` packaging, managed-media QA, manual import review, Obsidian certification, or deck readiness by itself. |
| `product:artifacts:kanji:n4` / `product:artifacts:kanji:n3` | Fresh source-derived N4 or N3 kanji TSV generation from tracked contracts only, with schema, row count, required field, primary-reading reference, and deterministic-output checks. | `.apkg` packaging, managed media/listening QA, manual Anki import review, Obsidian certification, or release readiness by itself. |
| `product:artifacts:kanji:all` | Runs the tracked-source kanji TSV artifact gate across N5 through N1 and fails closed where source contracts are incomplete. | Permission to skip blocked levels, bulk-copy restricted sources, or call unbuilt levels release-ready. |
| `product:artifacts:kanji:release-qa` | Confirms tracked-source TSV prerequisite status and keeps APKG, managed-media, manual import, mobile, screen-reader, and listening QA blocked until evidence exists. | Automatic APKG import success, human review, accessibility approval, or listening approval. |
| `deck:kanji:review-status` | Generated, Gold, Platinum, revalidation backlog, structural, and duplicate-claim status for core and additional kanji decks. | Source-evidence confidence, Obsidian completion for missing rows, or manual Anki QA. |
| `deck:kanji:additional:ready` | Additional-kanji source-claim diagnostic plus optional additional-unverified TSV/APKG generation. The current governed build selects `0` physical cards and reports duplicate-claim and already-core source-claim suppression. | Core contract movement, source-evidence proof, Platinum release quality, source-governance storage, or public product readiness. |
| `deck:kanji:additional:platinum:n*` | Field-bound Platinum gate for generated additional-unverified kanji cards, or an empty-surface pass when `deck:kanji:additional:ready` proves the generated additional deck is empty by governed suppression. | Core contract movement, source-evidence confidence, source-governance storage, core kanji Platinum coverage, or manual Anki QA. |

## Release workflow outputs

The tagged release workflow publishes these build outputs as GitHub Actions artifacts:

- deterministic smoke artifacts from `.release-smoke/out`
- release-gate verification artifacts from `.release-gate/out`
- `CHANGELOG.md`
- `NOTICE.md`
- `docs/compatibility-matrix.md`
- `docs/branch-protection.md`
- `docs/release-process.md`
- `docs/release-qa-checklist.md`
- `release-artifacts.sha256`

The dependency, workflow, script, and release-artifact trust boundaries are defined in [supply-chain-security.md](supply-chain-security.md). The tagged release bundle must not include ignored local inputs such as `data/`, `downloads/`, `.env`, or `node_modules`.

## Operational expectation

Do not create or move release tags around failed verification. If the tagged workflow fails, fix the branch through a pull request and cut a new tag from the corrected commit.
