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

## 2026-08-01 Live Result

Authenticated owner audit was rerun on 2026-08-01 against hosted `main` at `b9a820630cec9d53ebec8e06969ee0d4f658fba1`. The hosted `main` branch matches the tracked branch-protection policy, GitHub secret scanning and push protection are enabled, private vulnerability reporting is enabled, Dependency Graph SBOM is readable with `276` packages, Dependabot security updates are enabled and not paused, open CodeQL alerts are `0`, open secret-scanning alerts are `0`, open Dependabot alerts are `0`, and the latest hosted CI, CodeQL, and tagged Release conclusions are `success`. Tagged workflow `30726889778` proved constrained all-file attestation verification and published the `v0.3.0-beta.5` prerelease.

| Setting | Live result | Status |
| --- | --- | --- |
| Repository identity | `JeremiahM18/japanese-kanji-anki-builder` | Verified |
| Visibility | Public | Verified |
| Default branch | `main` | Verified |
| `main` protected | `true` from authenticated branch and protection endpoints | Verified |
| Required status checks enforced | `13` required checks match [../.github/branch-protection.main.json](../.github/branch-protection.main.json); strict/up-to-date checks enabled | Verified |
| Pull request review policy | Requires PR, `0` approvals for the current single-maintainer repository shape, no required CODEOWNERS review until a second write-access reviewer exists, stale approval dismissal, conversation resolution, linear history, and admin enforcement | Verified |
| Force pushes and deletion | Disabled on `main` | Verified |
| Secret scanning | `security_and_analysis.secret_scanning.status=enabled` | Verified |
| Push protection | `security_and_analysis.secret_scanning_push_protection.status=enabled` | Verified |
| CI workflow | `.github/workflows/ci.yml` active; latest hosted CI conclusion `success` | Verified |
| CodeQL workflow | `.github/workflows/codeql.yml` active; latest hosted CodeQL conclusion `success` | Verified |
| Release workflow | `.github/workflows/release.yml` active | Verified |
| Dependency Review | Hosted `.github/workflows/ci.yml` contains `actions/dependency-review-action` on pull requests with `fail-on-severity: moderate` | Verified |
| Vulnerability alerts / Dependency Graph | `GET /vulnerability-alerts` returned `204`; Dependency Graph SBOM endpoint returned `276` packages | Verified |
| Dependabot security updates | `GET /automated-security-fixes` returned `enabled:true` and `paused:false` | Verified |
| Release attestation creation | Tagged workflow `30726889778` created provenance and SBOM attestations for every staged release asset | Verified |
| Artifact attestation verification configured | Hosted workflow content configures constrained `gh attestation verify` for every staged asset with `--repo`, `--signer-workflow`, `--source-ref`, and `--source-digest` | Verified |
| Artifact attestation verification proven | Tagged workflow `30726889778` passed constrained verification for every staged asset; independent fresh-download verification passed for all `7/7` published assets | Verified |
| Branch protection detail endpoint | Authenticated endpoint returned `200` and matched tracked policy | Verified |
| Code scanning open alerts | Authenticated endpoint returned `0` open CodeQL alerts | Verified |
| Secret scanning alerts | Authenticated endpoint returned `0` open secret-scanning alerts | Verified |
| Dependabot alerts | Authenticated endpoint returned `0` open alerts | Verified |
| Private vulnerability reporting | `enabled:true` from `GET /repos/JeremiahM18/japanese-kanji-anki-builder/private-vulnerability-reporting` | Verified |
| Latest release workflow conclusion | `success` for tagged workflow `30726889778` on `v0.3.0-beta.5` at `b9a820630cec9d53ebec8e06969ee0d4f658fba1` | Verified |

Hosted evidence boundary: hosted `main` was at `b9a820630cec9d53ebec8e06969ee0d4f658fba1` when the authenticated audit ran. Do not treat local, pull-request-only, or unpushed workflow changes as hosted proof.

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
Verify Ubuntu Node 20
Verify Ubuntu Node 22
Smoke ubuntu-latest Node 20
Smoke ubuntu-latest Node 22
Smoke windows-2025-vs2026 Node 20
Smoke windows-2025-vs2026 Node 22
Smoke macos-latest Node 20
Smoke macos-latest Node 22
Release Gate Ubuntu Node 22
```

12. Enabled GitHub secret scanning.
13. Enabled push protection.
14. Enabled private vulnerability reporting.
15. Enabled vulnerability alerts and Dependency Graph.
16. Enabled Dependabot security updates.

Completed on 2026-06-03:

1. Merged the tracked CodeQL-pattern remediations to hosted `main`.
2. Reran hosted CodeQL on `main`; authenticated audit now reports open CodeQL alerts as `0`.
3. Merged the tracked release-workflow attestation verification step to hosted `main`; authenticated audit now reports artifact attestation verification as automated.
4. Updated pinned GitHub Actions to Node24-compatible action releases and verified hosted check annotations report `0` Node20 deprecation notices.
5. Updated Windows smoke jobs and required status-check policy from `windows-latest` to `windows-2025-vs2026`; hosted `main` CI check annotations now report `0` Windows image migration notices.

Completed on 2026-07-07:

1. Reran the transient scheduled CodeQL timeout; hosted CodeQL completed successfully.
2. Remediated CodeQL alert #27 (`js/duplicate-property`) in PR #184 and merged it to hosted `main`.
3. Verified latest hosted CI and CodeQL on `main` completed successfully.
4. Reran owner-authenticated `npm run security:github-settings:auth`; open CodeQL, secret-scanning, and Dependabot alerts are all `0`.

Completed on 2026-08-01:

1. Published the exact `v0.3.0-beta.4` N5 automation-reviewed prerelease through successful tagged workflow `30706783927`.
2. Verified the fresh download against exact checksum-manifest membership, the CycloneDX SBOM, and all `7/7` constrained attestations.
3. Verified immutable Actions artifact `8820594202` retains the same seven release files byte-for-byte.
4. Reran owner-authenticated `npm run security:github-settings:auth`; the audit passes with attestation verification proven and all hosted alert counts at `0`.

Completed on 2026-08-01 for beta.5:

1. Published the exact `v0.3.0-beta.5` N5 automation-reviewed prerelease through successful tagged workflow `30726889778` at commit `b9a820630cec9d53ebec8e06969ee0d4f658fba1`.
2. Verified the fresh download has exactly seven assets, exact six-file checksum-manifest membership and hashes, CycloneDX SBOM `ff385e0f679c0fe782ad348505b5358faa8d8f5bd11a6f7255a2962ef4a77273`, and all `7/7` constrained attestations.
3. Verified immutable Actions artifact `8826672122` retains the same seven release files byte-for-byte and the exact beta.5 release decision is present in the verification material.
4. Reran owner-authenticated `npm run security:github-settings:auth`; the audit passes with attestation verification proven, latest main CI/CodeQL/Release conclusions `success`, and all hosted alert counts at `0`.

Remaining:

- No current P0 hosted-settings remediation. Keep the authenticated audit and exact tagged-release verification mandatory, and reopen the applicable risk immediately on drift or failure.

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
