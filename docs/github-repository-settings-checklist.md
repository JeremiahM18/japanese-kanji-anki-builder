# GitHub Repository Settings Checklist

## Purpose

This checklist records the live hosted GitHub security settings that cannot be proven from local files alone. It is the P0 companion to [software-development-life-cycle-audit.md](software-development-life-cycle-audit.md).

Run it when branch protection, GitHub security settings, workflow names, release attestation policy, or repository ownership changes.

## Scope

Repository: `JeremiahM18/japanese-kanji-anki-builder`

Default branch: `main`

Local desired policy:

- [../.github/branch-protection.main.json](../.github/branch-protection.main.json)
- [branch-protection.md](branch-protection.md)
- [supply-chain-security.md](supply-chain-security.md)

## Live Verification Command

```bash
npm run security:github-settings
```

Use an authenticated token for full verification:

```powershell
$env:GH_TOKEN="<token with repository security/settings read access>"
npm run security:github-settings
```

Do not commit, paste, or log the token.

## 2026-06-02 Live Result

The unauthenticated GitHub API verified public repository metadata, workflow visibility, hosted workflow content, branch protection summary, and private vulnerability reporting status. Owner-auth-only security alert endpoints returned `401 Unauthorized`, so those settings remain unverified until an authenticated check is run.

| Setting | Live result | Status |
| --- | --- | --- |
| Repository identity | `JeremiahM18/japanese-kanji-anki-builder` | Verified |
| Visibility | Public | Verified |
| Default branch | `main` | Verified |
| `main` protected | `false` from `GET /repos/JeremiahM18/japanese-kanji-anki-builder/branches/main` | Failing |
| Required status checks enforced | `protection.enabled=false`; contexts/checks empty in public branch response | Failing |
| CI workflow | `.github/workflows/ci.yml` active; recent hosted run for `fef3faa` succeeded | Verified |
| CodeQL workflow | `.github/workflows/codeql.yml` active; recent hosted run for `fef3faa` succeeded | Verified |
| Release workflow | `.github/workflows/release.yml` active | Verified |
| Dependency Review | Hosted `.github/workflows/ci.yml` contains `actions/dependency-review-action` on pull requests with `fail-on-severity: moderate` | Verified |
| Release attestation creation | Hosted `.github/workflows/release.yml` contains provenance and SBOM attestation steps for the release bundle | Verified |
| Artifact attestation verification | Hosted workflow content does not prove `gh attestation verify` or equivalent post-release verification | Failing |
| Branch protection detail endpoint | `401 Unauthorized` without owner-auth token | Unverified |
| Code scanning open alerts | `401 Unauthorized` without owner-auth token | Unverified |
| Secret scanning alerts | `401 Unauthorized` without owner-auth token | Unverified |
| Dependabot alerts | `401 Unauthorized` without owner-auth token | Unverified |
| Private vulnerability reporting | `enabled:false` from `GET /repos/JeremiahM18/japanese-kanji-anki-builder/private-vulnerability-reporting` | Failing |
| Latest release workflow conclusion | No recent release workflow conclusion was available from the unauthenticated workflow-runs endpoint | Unverified |

Important local/hosted drift: local `main` includes commits after hosted `fef3faa`; do not treat hosted workflow evidence as proof for unpushed local commits.

## Required Remediation

1. Push the current protected-flow changes through the intended remote workflow when ready.
2. Enable branch protection or a ruleset for `main`.
3. Require pull requests before merging.
4. Require at least one approving review.
5. Require CODEOWNERS review.
6. Dismiss stale approvals.
7. Require conversation resolution.
8. Require branch up-to-date before merge.
9. Require linear history.
10. Block force pushes and branch deletion.
11. Do not allow bypassing.
12. Require these checks:

```text
Dependency Review
Advisory Audit Ubuntu Node 22
CodeQL Analysis (actions)
CodeQL Analysis (javascript-typescript)
Verify Ubuntu Node 18
Verify Ubuntu Node 20
Verify Ubuntu Node 22
Smoke ubuntu-latest Node 18
Smoke ubuntu-latest Node 22
Smoke windows-latest Node 18
Smoke windows-latest Node 22
Smoke macos-latest Node 18
Smoke macos-latest Node 22
Release Gate Ubuntu Node 22
```

13. Enable GitHub secret scanning.
14. Enable push protection.
15. Enable private vulnerability reporting.
16. Confirm CodeQL alerts are visible and no open alert is untriaged.
17. Confirm Dependabot/dependency alerts are visible and no open alert is untriaged.
18. Add or record post-release artifact attestation verification, such as `gh attestation verify`, before trusting the bundle.

## Failure Semantics

- `main_branch_unprotected` is a blocker for enterprise-level hosted governance.
- `private_vulnerability_reporting_disabled` is a blocker for enterprise-level vulnerability intake.
- `artifact_attestation_verification_unverified` is a blocker for trusting release attestations as consumed evidence.
- `*_unverified` means the local audit could not prove the hosted setting. It is not a pass.
- A successful CI or CodeQL run proves workflow execution for that commit only. It does not prove branch protection, secret scanning, push protection, private vulnerability reporting, or release attestation verification.
