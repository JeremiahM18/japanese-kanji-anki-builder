# Release Process

This document defines the tagged release procedure. A release claim is valid only for one exact version, tag, commit, release class, candidate run, deck-kind/level scope, and set of checksummed artifacts.

## Versioning rules

- Update `package.json` version intentionally.
- Add a dated section to [CHANGELOG.md](../CHANGELOG.md) for every released version.
- Keep `## [Unreleased]` at the top of the changelog while work is in flight.
- Keep `## [Unreleased]` release-facing and concise. Detailed per-card and per-batch review history belongs in git commit messages, tracked review manifests, and gate output, not in the tagged release bundle.
- Create Git tags as `v<package.json version>`, for example `v0.3.0-beta.2`.
- Never move or reuse a failed release tag. Correct through protected `main` and issue a new semantic prerelease version.

## Release classes

### Production

A `production` packet requires every artifact QA entry to be `passed`, `releasePolicy.distribution: github-release`, and `releasePolicy.humanQa.status: passed`. Accepted-risk evidence is forbidden. The strict `npm run product:artifacts:kanji:release-qa` gate remains the product/GA boundary when kanji ships.

### Automation-reviewed preview

An `automation-reviewed-preview` packet must use a semantic prerelease version, `github-prerelease` distribution, the exact label `AUTOMATION-REVIEWED PREVIEW - HUMAN DEVICE QA NOT PERFORMED`, and owner-accepted `PROD-REL-001` evidence. It may defer only these named limitations:

- desktop-anki-import-not-performed
- mobile-qa-not-performed
- screen-reader-interaction-not-performed
- listening-naturalness-not-performed
- stroke-sequence-visual-review-not-performed

Every achievable automated gate remains mandatory. This release class is not production/GA, human-approved, device-approved, or an accessibility-conformance claim. The current exact decision is [v0.3.0-beta.2 N5 automation-reviewed preview](releases/v0.3.0-beta.2-n5-automation-preview.md). The immutable `v0.3.0-beta.1` tag is a failed, unpublished attempt retained as evidence and must never be moved or reused.

## Pre-merge release-process change

1. Define exact inclusions and exclusions before building. N5-only, N4-inclusive, and all-level releases are different products and must not share readiness claims.
2. Update code, tests, workflow, version, changelog, evidence template, risk decision, and release docs on a focused branch.
3. Run the smallest complete affected tests, then the repository merge gates: `npm run lint`, `npm run typecheck`, `npm test`, `npm run docs:status-audit`, `npm run lane:authority:audit`, `npm run supply-chain:audit`, `npm run security:advisories`, `npm run security:branch-protection`, `npm run security:licenses`, `npm run security:requirements`, `npm run security:sdlc-metrics`, `npm run security:secrets`, `npm run security:sbom`, `npm run ci:smoke`, `npm run release:gate`, and `git diff --check`.
4. For certified scopes, first confirm the fail-closed Obsidian native/fluent-quality content-certification gate and its lower-lane prerequisite gates. Then run every owning content/source/media command required by the exact scope. For N5 core kanji plus N5 core words, this includes `npm run product:readiness:n5`, N5 kanji/word Silver through Obsidian status/gates, source-access and strict source-governance audits, N5 tracked-source kanji preflight/artifact validation, and managed-media checks. `product:readiness:n5` is a coordinator, not a substitute for release artifact evidence.
5. Rerun owner-authenticated `npm run security:github-settings:auth`. Before the first successful tag, `artifact_attestation_verification_unproven` remains the expected external blocker.
6. Merge only through protected `main`; require hosted CI, CodeQL, required review, and resolved threads.

## Final candidate and draft prerelease

1. Refresh local `main` to the verified merge commit. Build every shipped deck kind from that exact commit under the same isolated `--run-id`, with each deck kind receiving only its exact shipped `--levels`.
2. Run `npm run deck:review:accessibility` against the exact run ID and per-deck level scope.
3. Complete packet version 3 at `out/release-qa/release-qa-evidence.json`. It must bind:
   - `scope.releaseVersion`, `scope.releaseTag`, and `scope.releaseClass`
   - the full lowercase `scope.repositoryCommit`, equal to Git HEAD
   - one candidate run ID and unique canonical deck kinds
   - exactly one APKG per shipped deck kind, with canonical levels, isolated local path, portable release asset name, note/card/media counts, positive byte size, and lowercase SHA-256
   - automated, artifact-QA, and source-governance evidence bound to the same commit
   - passed or class-permitted accepted-risk artifact QA evidence
   - exact source-governance posture and an explicit empty `knownBlockers`
4. Run `npm run product:release-qa:evidence` and `npm run product:release-qa:apkg-inspect -- --packet=out/release-qa/release-qa-evidence.json --artifact-dir=<candidate-package-directory>`. The inspector independently validates ZIP safety/integrity, exact media membership, SQLite integrity/schema, Anki collection version, deck names, note/card/media counts, field cardinality, GUID/card references, and packaged media references.
5. Confirm [compatibility-matrix.md](compatibility-matrix.md), [release-qa-checklist.md](release-qa-checklist.md), [CHANGELOG.md](../CHANGELOG.md), and [NOTICE.md](../NOTICE.md) match the exact release.
6. Create a **draft** GitHub prerelease for the intended tag, targeting the exact protected-main commit. Upload only `release-qa-evidence.json` and the APKGs named by the packet. Do not publish it and do not add undeclared assets.
7. Create the local tag at the same commit, then create the draft prerelease with `--target=<full-commit>`. GitHub CLI documents that a release whose tag does not exist may create the remote tag automatically. Resolve the actual remote state with `git ls-remote --tags origin refs/tags/<tag>`: if absent, push the local tag and let the tag-push event start [.github/workflows/release.yml](../.github/workflows/release.yml); if already present at the exact commit, run `gh workflow run release.yml --ref <tag>`. Never dispatch against a branch, and fail if the remote tag resolves to another commit.

## Hosted tagged workflow

Whether started by tag push or manual dispatch at the existing tag, the workflow must fail closed unless `GITHUB_REF_TYPE` is `tag`, the ref equals `v<package.json version>`, tag SHA equals checkout SHA, the draft exists as a prerelease, and the downloaded draft directory contains exactly the packet plus its declared APKG assets.

Both jobs revalidate packet/asset bindings and APKG structures. The verification job runs the test, security, N5 readiness, and release gates. The bundle job stages only:

- both exact N5 APKGs declared by the packet
- `release-qa-evidence.json`
- `.release-bundle/sbom.cdx.json`
- `.release-bundle/dependency-licenses.json`
- `.release-bundle/release-verification-materials.tar.gz`
- `.release-bundle/release-artifacts.sha256`

The bundle job checksums all staged files, verifies the checksum manifest, creates provenance and SBOM attestations for every staged asset, runs constrained `gh attestation verify` for every asset, uploads the immutable Actions artifact, uploads/clobbers those exact GitHub release assets, and only then publishes the draft as a prerelease. Top-level workflow permissions remain read-only. The verification job receives only job-scoped `contents: write` because GitHub requires push-level access to query and download a private draft release; it has no publication step. The bundle job separately receives job-scoped `contents: write`, OIDC, and attestation permissions for publication.

The deterministic verification-material archive contains smoke/release-gate outputs and the tracked release documentation. Ignored local inputs such as `data/`, `downloads/`, `.env`, caches, and `node_modules` must never enter the release bundle.

## Post-release verification and closure

1. Download every published asset into an empty directory.
2. Run `sha256sum -c .release-bundle/release-artifacts.sha256` from the directory layout recorded by the manifest, or the equivalent trusted checksum verifier.
3. Verify GitHub attestations for every downloaded asset with repository, signer-workflow, source-ref, and source-digest constraints.
4. Rerun:

```bash
npm run security:advisories
npm run security:github-settings:auth
npm run security:release-trust
```

5. Close `SEC-P0-004` and implement `SEC-REQ-007` only through a protected-main follow-up change that records the successful workflow URL, tag, commit, downloaded checksum result, SBOM, provenance, and attestation verification evidence.

## Gate boundaries

| Gate | Proves | Does not prove |
| --- | --- | --- |
| `release:gate` | Smoke-fixture TSV/package/media contracts and optional smoke APKG creation. | Product APKG readiness, content-lane completion, human/device QA, or public release trust. |
| `product:readiness:n5` | Current automated N5 source/artifact, placement, audio-policy, and Gold coordinator checks. | Exact APKG bytes, Platinum/Obsidian by itself, release assets, human/device QA, or hosted provenance. |
| `product:artifacts:kanji:release-qa` | Strict production/GA manual product-QA boundary. | Permission to relabel missing human QA as passed. Its expected failure does not block a correctly governed automation-reviewed prerelease. |
| `product:release-qa:evidence` | Packet-v3 version/tag/commit/class, exact APKG metadata and hashes, commit-bound automated/artifact evidence, source posture, preview-risk policy, and no hidden blockers. With `--artifact-dir` it also requires exact downloaded asset membership. | APKG internals, execution of named commands, human perception, device behavior, or hosted attestations. |
| `product:release-qa:apkg-inspect` | APKG ZIP/media/SQLite/deck/note/card/field/reference structural integrity against packet counts. | Native Anki rendering, mobile behavior, screen-reader interaction, listening naturalness, or stroke-sequence visual correctness. |
| `security:release-trust:pre` | All pre-tag release blockers except the explicitly deferred post-tag attestation records. | Successful hosted tag execution or final release trust. |
| `security:release-trust` | No unresolved high/critical release-blocker risk and no unimplemented release-blocker requirement. | Product quality outside recorded evidence or private human-review activity. |

The dependency, workflow, script, and artifact boundaries are defined in [supply-chain-security.md](supply-chain-security.md). If any final verification fails, keep or return the release to draft when possible, preserve evidence, correct through a new protected-main pull request, and cut a new tag; never move the failed tag.
