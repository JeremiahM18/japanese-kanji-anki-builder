# Branch Protection Baseline

This document defines required `main` branch protection settings in GitHub.

The tracked policy source is [../.github/branch-protection.main.json](../.github/branch-protection.main.json). Run `npm run security:branch-protection` after changing CI job names, required checks, protected-branch settings, or this document.

## Required repository settings

Enable these protections on `main`:

- require a pull request before merging
- require `0` approving reviews for the current single-maintainer repository shape
- do not require code-owner review while the only maintainer account is also the pull request author
- dismiss stale approvals when new commits are pushed
- require status checks before merging
- require branches to be up to date before merging
- require conversation resolution before merge
- require linear history
- do not allow bypassing required protections
- block force pushes
- block branch deletion

## Required status checks

Mark these checks as required on `main`:

- `Dependency Review`
- `Advisory Audit Ubuntu Node 22`
- `CodeQL Analysis (actions)`
- `CodeQL Analysis (javascript-typescript)`
- `Verify Ubuntu Node 20`
- `Verify Ubuntu Node 22`
- `Smoke ubuntu-latest Node 20`
- `Smoke ubuntu-latest Node 22`
- `Smoke windows-2025-vs2026 Node 20`
- `Smoke windows-2025-vs2026 Node 22`
- `Smoke macos-latest Node 20`
- `Smoke macos-latest Node 22`
- `Release Gate Ubuntu Node 22`

## Ownership expectation

Changes to workflow, packaging, dependency manifests, supply-chain policy, shared schema, services, test harnesses, or contributor process files remain covered by [.github/CODEOWNERS](../.github/CODEOWNERS), but CODEOWNER approval is not a hosted merge requirement while the repository has only one GitHub maintainer account. Re-enable required code-owner review and at least one approval only after a second write-access reviewer or team exists.

Changes that affect JLPT taxonomy, starter curation, Gold regression placement, source-evidence inputs, or deck-membership logic also require `npm run data:audit:jlpt`, the read-only `npm run data:audit:jlpt:sources -- --governance-strict --limit=25` transparency audit, and the relevant strict `npm run data:audit:jlpt:source-inputs -- --source=<source-id> --strict` preflight before merge. Source-evidence input imports must also dry-run `npm run data:import:jlpt:source-input -- --source=<source-id>` before any `--write` update to the tracked manifest.
