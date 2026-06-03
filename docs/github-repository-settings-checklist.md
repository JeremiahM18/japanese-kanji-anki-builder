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
npm run security:github-settings:auth
```

The wrapper first uses `GH_TOKEN` or `GITHUB_TOKEN`. If neither is set, it runs `gh auth token` through GitHub CLI and passes the token to the audit without printing it.

Use the lower-level audit directly only when the environment already injects the token:

```powershell
$env:GH_TOKEN="<token with repository security/settings read access>"
npm run security:github-settings
```

Do not commit, paste, or log a token.

## 2026-06-02 Live Result

Authenticated owner audit was run on 2026-06-02 after enabling branch protection, private vulnerability reporting, vulnerability alerts, Dependency Graph, and Dependabot security updates. The hosted `main` branch now matches the tracked branch-protection policy, GitHub secret scanning and push protection are enabled, private vulnerability reporting is enabled, Dependency Graph SBOM is readable with `289` packages, Dependabot security updates are enabled and not paused, and open Dependabot alerts are `0`. The gate still fails because live CodeQL has open alerts and hosted release workflow content does not yet prove post-creation attestation verification. Tracked workflow and CodeQL-pattern remediations have been added locally and must reach hosted `main` before the hosted audit can verify them. After the workflow content reaches hosted `main`, attestation verification is still only configured until a successful hosted release workflow run proves it.

| Setting | Live result | Status |
| --- | --- | --- |
| Repository identity | `JeremiahM18/japanese-kanji-anki-builder` | Verified |
| Visibility | Public | Verified |
| Default branch | `main` | Verified |
| `main` protected | `true` from authenticated branch and protection endpoints | Verified |
| Required status checks enforced | `14` required checks match [../.github/branch-protection.main.json](../.github/branch-protection.main.json); strict/up-to-date checks enabled | Verified |
| Pull request review policy | Requires PR, `0` approvals for the current single-maintainer repository shape, no required CODEOWNERS review until a second write-access reviewer exists, stale approval dismissal, conversation resolution, linear history, and admin enforcement | Verified |
| Force pushes and deletion | Disabled on `main` | Verified |
| Secret scanning | `security_and_analysis.secret_scanning.status=enabled` | Verified |
| Push protection | `security_and_analysis.secret_scanning_push_protection.status=enabled` | Verified |
| CI workflow | `.github/workflows/ci.yml` active; latest hosted CI conclusion `success` | Verified |
| CodeQL workflow | `.github/workflows/codeql.yml` active; latest hosted CodeQL conclusion `success` | Verified with open alerts |
| Release workflow | `.github/workflows/release.yml` active | Verified |
| Dependency Review | Hosted `.github/workflows/ci.yml` contains `actions/dependency-review-action` on pull requests with `fail-on-severity: moderate` | Verified |
| Vulnerability alerts / Dependency Graph | `GET /vulnerability-alerts` returned `204`; Dependency Graph SBOM endpoint returned `289` packages | Verified |
| Dependabot security updates | `GET /automated-security-fixes` returned `enabled:true` and `paused:false` | Verified |
| Release attestation creation | Hosted `.github/workflows/release.yml` contains provenance and SBOM attestation steps for the release bundle | Verified |
| Artifact attestation verification configured | Hosted workflow content does not yet prove `gh attestation verify` with `--repo`, `--signer-workflow`, `--source-ref`, and `--source-digest`; tracked local workflow now includes these constraints | Failing until hosted workflow updates |
| Artifact attestation verification proven | No successful hosted release workflow run exists yet to prove the verification step after attestation creation | Failing until tagged release workflow succeeds |
| Branch protection detail endpoint | Authenticated endpoint returned `200` and matched tracked policy | Verified |
| Code scanning open alerts | Authenticated endpoint returned `19` open CodeQL alerts | Failing |
| Secret scanning alerts | Authenticated endpoint returned `0` open secret-scanning alerts | Verified |
| Dependabot alerts | Authenticated endpoint returned `0` open alerts | Verified |
| Private vulnerability reporting | `enabled:true` from `GET /repos/JeremiahM18/japanese-kanji-anki-builder/private-vulnerability-reporting` | Verified |
| Latest release workflow conclusion | No recent release workflow conclusion was available from the workflow-runs endpoint | Unverified |

Important local/hosted drift: hosted `main` was at `5d5b71e4` when the authenticated audit ran. Do not treat hosted workflow evidence as proof for uncommitted or unpushed local changes.

## Required Remediation

Completed on 2026-06-02:

1. Enabled branch protection for `main`.
2. Required pull requests before merging.
3. Required `0` approving reviews for the current single-maintainer repository shape.
4. Disabled required CODEOWNERS review until a second write-access reviewer or team exists.
5. Dismissed stale approvals.
6. Required conversation resolution.
7. Required branch up-to-date before merge.
8. Required linear history.
9. Blocked force pushes and branch deletion.
10. Enforced protections for administrators.
11. Required these checks:

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

12. Enabled GitHub secret scanning.
13. Enabled push protection.
14. Enabled private vulnerability reporting.
15. Enabled vulnerability alerts and Dependency Graph.
16. Enabled Dependabot security updates.

Remaining:

1. Merge the tracked CodeQL-pattern remediations, rerun hosted CodeQL, and keep `npm run security:github-settings:auth` failing until open CodeQL alerts are `0`, or dismiss specific alerts only with documented rationale.
2. Merge the tracked release-workflow attestation verification step to hosted `main`, run a tagged release workflow, then rerun `npm run security:github-settings:auth` until attestation verification is configured in hosted workflow content and proven by a successful hosted release run.

## Failure Semantics

- `main_branch_unprotected` is a blocker for enterprise-level hosted governance.
- `private_vulnerability_reporting_disabled` is a blocker for enterprise-level vulnerability intake.
- `branch_protection_policy_mismatch` is a blocker because hosted protection no longer matches the tracked policy.
- `repository_security_analysis_unverified` means the repository API did not return the `security_and_analysis` settings object; rerun with owner-authenticated access before claiming secret scanning or push protection status.
- `secret_scanning_disabled` and `push_protection_disabled` are blockers for hosted secret prevention.
- `vulnerability_alerts_disabled`, `dependency_graph_sbom_unreadable`, `dependabot_security_updates_disabled`, and `dependabot_security_updates_paused` are blockers for hosted dependency security posture.
- `code_scanning_open_alerts`, `secret_scanning_open_alerts`, and `dependabot_open_alerts` are blockers until triaged, fixed, or explicitly accepted with documented rationale.
- `artifact_attestation_verification_unverified` is a blocker because hosted workflow content does not configure constrained `gh attestation verify` after attestation creation.
- `artifact_attestation_verification_unproven` is a blocker because hosted workflow content configures verification but no successful hosted release workflow run has proven the step yet.
- `*_unverified` means the local audit could not prove the hosted setting. It is not a pass.
- A successful CI or CodeQL run proves workflow execution for that commit only. It does not prove branch protection, secret scanning, push protection, private vulnerability reporting, or release attestation verification.
