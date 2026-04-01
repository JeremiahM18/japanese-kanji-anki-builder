# Branch Protection Baseline

Use this document as the source of truth for the `main` branch protection settings in GitHub.

## Required repository settings

Enable these protections on `main`:

- require a pull request before merging
- require at least 1 approval
- require review from code owners
- dismiss stale approvals when new commits are pushed
- require conversation resolution before merge
- block force pushes
- block branch deletion

## Required status checks

Mark these checks as required on `main`:

- `Verify Ubuntu Node 20`
- `Verify Ubuntu Node 22`
- `Smoke ubuntu-latest Node 22`
- `Smoke windows-latest Node 22`
- `Smoke macos-latest Node 22`
- `Release Gate Ubuntu Node 22`

## Ownership expectation

Changes to workflow, packaging, shared schema, services, test harnesses, or contributor process files should request code-owner review before merge.
