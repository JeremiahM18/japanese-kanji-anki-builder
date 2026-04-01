# Release Process

Use this document as the source of truth for tagged releases.

## Versioning rules

- Update `package.json` version intentionally.
- Add a dated section to [CHANGELOG.md](/C:/japanese_kanji_builder/CHANGELOG.md) for every released version.
- Keep `## [Unreleased]` at the top of the changelog while work is in flight.
- Create Git tags as `v<package.json version>`, for example `v1.0.0`.

## Release checklist

1. Confirm `npm test`, `npm run lint`, `npm run ci:smoke`, and `npm run release:gate` are green on the release commit.
2. Confirm [CHANGELOG.md](/C:/japanese_kanji_builder/CHANGELOG.md) includes the exact released version and date.
3. Push the release commit to `main` through the protected pull-request flow.
4. Create and push the matching `v*` tag.
5. Let [.github/workflows/release.yml](/C:/japanese_kanji_builder/.github/workflows/release.yml) produce the tagged release artifacts.

## Release workflow outputs

The tagged release workflow publishes these build outputs as GitHub Actions artifacts:

- deterministic smoke artifacts from `.release-smoke/out`
- release-gate verification artifacts from `.release-gate/out`
- `CHANGELOG.md`
- `docs/branch-protection.md`
- `docs/release-process.md`
- `release-artifacts.sha256`

## Operational expectation

Do not create or move release tags around failed verification. If the tagged workflow fails, fix the branch through a normal pull request and cut a new tag from the corrected commit.
