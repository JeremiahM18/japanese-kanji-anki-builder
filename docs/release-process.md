# Release Process

This document defines tagged release procedure.

## Versioning rules

- Update `package.json` version intentionally.
- Add a dated section to [CHANGELOG.md](../CHANGELOG.md) for every released version.
- Keep `## [Unreleased]` at the top of the changelog while work is in flight.
- Create Git tags as `v<package.json version>`, for example `v1.0.0`.

## Release checklist

1. Confirm `npm test`, `npm run lint`, `npm run typecheck`, `npm run ci:smoke`, `npm run deck:kanji:review-status`, `npm run product:artifacts:n5` when N5 word ships, `npm run product:artifacts:kanji:n5:preflight` when N5 kanji ships, `npm run product:readiness:n5` when N5 ships, and `npm run release:gate` are green on the release commit. If additional unverified kanji decks ship, also run `npm run deck:kanji:additional:ready` and all applicable `npm run deck:kanji:additional:review:n*` commands. `product:artifacts:n5` is currently scoped to tracked-source N5 word TSV generation. `product:artifacts:kanji:n5:preflight` is a diagnostic that reports whether tracked-source N5 kanji TSV certification is possible; it currently reports certification as blocked until rich kanji readings and provenance are tracked contracts. Component/radical source data is tracked in `templates/kanji_component_contract.json`. `product:readiness:n5` is an automated N5 checkpoint, not a manual QA substitute. `release:gate` validates smoke-fixture artifacts and packaging contracts; it does not certify public product deck readiness.
2. Run the manual [release QA checklist](release-qa-checklist.md), including the current level-specific golden review, platinum review where applicable, accessibility review, and Anki spot-review expectations.
3. Confirm the intended release still matches the [compatibility matrix](compatibility-matrix.md).
4. Confirm [CHANGELOG.md](../CHANGELOG.md) includes the exact released version and date.
5. Confirm [NOTICE.md](../NOTICE.md) reflects required shipped attribution.
6. Push the release commit to `main` through the protected pull-request flow.
7. Create and push the matching `v*` tag.
8. Let [.github/workflows/release.yml](../.github/workflows/release.yml) produce the tagged release artifacts.

## Gate boundaries

| Gate | Proves | Does not prove |
| --- | --- | --- |
| `release:gate` | Smoke-fixture TSV headers, package directories, packaged media presence, governed audio policy, and optional smoke-fixture `.apkg` creation when packaging tools are required. | Public product readiness, level-specific golden/platinum completion, manual Anki import QA, learner UX, accessibility, or listening QA. |
| `product:readiness:n5` | The current automated N5 checkpoint: JLPT audits, audio policy, tracked-source N5 word artifact, word placement audit, and N5 golden reviews. | Platinum completion, tracked-source kanji TSV certification, fresh product `.apkg` approval, manual import QA, mobile QA, screen-reader QA, or listening QA. |
| `product:artifacts:n5` | Fresh tracked-source N5 word TSV generation from tracked templates only, with deterministic output and canonical-row checks. | Kanji TSV certification, managed-media packaging, `.apkg` release approval, or manual card QA. |
| `product:artifacts:kanji:n5:preflight` | Whether tracked templates are sufficient to certify N5 kanji TSV generation without ignored local `data/` inputs. | Deck readiness by itself; it is allowed to report blocked until the remaining tracked kanji contracts exist. |
| `deck:kanji:review-status` | Generated, golden, platinum, structural, and duplicate-claim status for core and additional kanji decks. | Source-evidence confidence, platinum completion for missing rows, or manual Anki QA. |
| `deck:kanji:additional:ready` | Separate optional additional-unverified kanji TSV/APKG generation with media completeness and duplicate-claim suppression reporting. | Core contract movement, source-evidence proof, platinum release quality, or public product readiness. |

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
