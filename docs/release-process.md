# Release Process

This document defines tagged release procedure.

## Versioning rules

- Update `package.json` version intentionally.
- Add a dated section to [CHANGELOG.md](../CHANGELOG.md) for every released version.
- Keep `## [Unreleased]` at the top of the changelog while work is in flight.
- Create Git tags as `v<package.json version>`, for example `v1.0.0`.

## Release checklist

1. Confirm `npm test`, `npm run lint`, `npm run ci:smoke`, `npm run product:artifacts:n5` when N5 word ships, `npm run product:artifacts:kanji:n5:preflight` when N5 kanji ships, `npm run product:readiness:n5` when N5 ships, and `npm run release:gate` are green on the release commit. `product:artifacts:n5` is currently scoped to tracked-source N5 word TSV generation. `product:artifacts:kanji:n5:preflight` is a diagnostic that reports whether tracked-source N5 kanji TSV certification is possible; it currently reports certification as blocked until rich kanji readings, component/radical source data, and provenance are tracked contracts. `product:readiness:n5` is an automated N5 checkpoint, not a manual QA substitute. `release:gate` validates smoke-fixture artifacts and packaging contracts; it does not certify public product deck readiness.
2. Run the manual [release QA checklist](release-qa-checklist.md), including the current level-specific golden review, accessibility review, and Anki spot-review expectations.
3. Confirm the intended release still matches the [compatibility matrix](compatibility-matrix.md).
4. Confirm [CHANGELOG.md](../CHANGELOG.md) includes the exact released version and date.
5. Confirm [NOTICE.md](../NOTICE.md) reflects required shipped attribution.
6. Push the release commit to `main` through the protected pull-request flow.
7. Create and push the matching `v*` tag.
8. Let [.github/workflows/release.yml](../.github/workflows/release.yml) produce the tagged release artifacts.

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

## Operational expectation

Do not create or move release tags around failed verification. If the tagged workflow fails, fix the branch through a pull request and cut a new tag from the corrected commit.
