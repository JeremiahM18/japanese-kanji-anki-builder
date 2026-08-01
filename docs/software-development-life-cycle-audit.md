# Software Development Life Cycle Audit

## Purpose

This audit maps the repository's current software development life cycle controls against practical secure-development frameworks and identifies the missing or incomplete controls that should be addressed next.

It is a current-state audit, not a release-ready claim. Re-run the listed verification commands and refresh this file when SDLC controls, CI workflows, release policy, security posture, or repository settings change.

## Scope

Covered:

- repository development process
- local development security posture
- CI, release, and supply-chain controls
- product QA and deck-governance workflows
- documentation, contribution, and review process
- missing SDLC controls visible from tracked files and live local commands

Not fully provable from local files:

- current GitHub repository settings unless the authenticated hosted audit is rerun
- current protected-branch enforcement in GitHub unless the authenticated hosted audit is rerun
- current GitHub secret scanning, push protection, private vulnerability reporting, CodeQL alert, and Dependabot alert settings unless the authenticated hosted audit is rerun
- hosted release artifact attestation verification after a real tag
- human training completion
- manual incident-response and recovery performance

## Authority Boundary

This audit records the current tracked SDLC posture and the latest recorded verification evidence. It does not replace live hosted audits, private training records, manual incident exercises, release QA evidence packets, source-governance evidence-depth work, or product release certification.

## Framework Basis

This audit uses:

- [NIST SP 800-218 SSDF](https://csrc.nist.gov/pubs/sp/800/218/final): secure development practices that can be integrated into any SDLC.
- [OWASP SAMM](https://owaspsamm.org/model/): Governance, Design, Implementation, Verification, and Operations maturity functions.
- [SLSA build levels](https://slsa.dev/spec/v1.0/levels): build provenance and tamper-resistance maturity.
- [Microsoft Security Development Lifecycle](https://learn.microsoft.com/en-us/compliance/assurance/assurance-microsoft-security-development-lifecycle): requirements, design, implementation, verification, release, training, and response.

## Current Strengths

| SDLC area | Current evidence |
| --- | --- |
| Contribution process | [../CONTRIBUTING.md](../CONTRIBUTING.md) defines focused branches, documentation updates, validation, PR standards, and review bar. |
| Documentation governance | [documentation-standard.md](documentation-standard.md) defines purpose, scope, authority boundary, source of truth, verification, failure semantics, and update triggers. |
| Product requirements and exit criteria | [product-exit-criteria.md](product-exit-criteria.md), [release-qa-checklist.md](release-qa-checklist.md), and [platinum-obsidian-review-contract.md](platinum-obsidian-review-contract.md) define deck quality gates and manual QA boundaries. |
| Branch policy as code | [../.github/branch-protection.main.json](../.github/branch-protection.main.json), [branch-protection.md](branch-protection.md), and `npm run security:branch-protection` align required checks and protected-path expectations. |
| Code-owner review | [../.github/CODEOWNERS](../.github/CODEOWNERS) covers workflows, scripts, services, tests, security, dependency manifests, and core docs. |
| CI verification | [../.github/workflows/ci.yml](../.github/workflows/ci.yml) runs lint, typecheck, tests, smoke checks, release gate, source-governance parity, proof-ledger parity, dependency review, advisory audit, dependency-license audit, secret audit, SBOM validation, SDLC metrics, and supply-chain audit. |
| Static analysis | [../.github/workflows/codeql.yml](../.github/workflows/codeql.yml) runs pinned CodeQL for JavaScript/TypeScript and GitHub Actions. |
| Dependency and supply-chain controls | [supply-chain-security.md](supply-chain-security.md), `npm run supply-chain:audit`, `npm run security:licenses`, `npm run security:advisories`, GitHub dependency review, action pinning, lifecycle-script allowlisting, dependency-license allowlisting/reviewed exceptions, and lockfile-derived SBOM validation are in place. |
| Release provenance | [../.github/workflows/release.yml](../.github/workflows/release.yml) writes a CycloneDX SBOM, writes a dependency-license summary, checksums release artifacts, and creates provenance and SBOM attestations for tagged release bundles. |
| Vulnerability disclosure | [../SECURITY.md](../SECURITY.md) defines scope, private reporting preference, report content, and maintainer handling. |
| Local runtime hardening | [../SECURITY.md](../SECURITY.md) and `scripts/manageVoicevoxContainer.js` enforce local-only VOICEVOX binding and Docker runtime hardening. |

## Missing Or Incomplete Controls

### P0: Verify Hosted GitHub Settings

Tracked files define the desired settings, but the local repo cannot prove GitHub has them enabled.

Missing external confirmations:

- a fresh owner-authenticated hosted audit after any repository setting, workflow, required-check, or security-alert drift
- artifact attestation verification works on a real tagged release

Current artifacts:

- [github-repository-settings-checklist.md](github-repository-settings-checklist.md)
- [../scripts/auditGithubRepositorySettings.js](../scripts/auditGithubRepositorySettings.js)
- [../scripts/auditGithubRepositorySettingsWithGhAuth.js](../scripts/auditGithubRepositorySettingsWithGhAuth.js)

Current command: `npm run security:github-settings:auth`.

Current live finding recorded on 2026-07-07: authenticated owner audit verifies that hosted `main` at `e7c6784b` is protected and matches [../.github/branch-protection.main.json](../.github/branch-protection.main.json), required status checks are enforced, secret scanning is enabled, push protection is enabled, private vulnerability reporting is enabled, Dependency Review is configured, vulnerability alerts and Dependency Graph are enabled, Dependency Graph SBOM is readable with `288` packages, Dependabot security updates are enabled and not paused, open CodeQL alerts are `0`, open secret-scanning alerts are `0`, open Dependabot alerts are `0`, latest hosted CI and CodeQL conclusions are `success`, release attestation creation is present, and hosted workflow content configures constrained artifact attestation verification. The gate still fails only because no successful hosted tagged release workflow run has proven the attestation verification step after attestation creation.

### P1: Formal Threat Model

[../SECURITY.md](../SECURITY.md) has a concise threat model. The fuller model now records assets, actors, trust boundaries, data flows, abuse cases, mitigations, residual risks, verification commands, and update triggers.

Current artifact: [threat-model.md](threat-model.md).

Remaining limitation: a written threat model does not prove manual QA, hosted GitHub settings, release attestation verification, or source truth. Those remain owned by their live gates and runbooks.

### P1: Risk And Exception Register

Known limitations and expected fail-closed lanes now have a single register with owner, severity, decision, next review date, evidence, and required next action.

Current artifact: [risk-register.md](risk-register.md).

Remaining limitation: open or blocked risks are not accepted release posture. The register must be updated as P0 hosted settings, dependency exceptions, or release evidence change.

### P1: Incident Response And Vulnerability Remediation Runbook

[../SECURITY.md](../SECURITY.md) explains reporting and maintainer handling. The runbook now defines severity classification, intake, triage, containment, verification, communication, disclosure, and post-incident review.

Current artifact: [incident-response.md](incident-response.md).

Remaining limitation: the runbook has not been exercised by a real incident or tabletop review.

### P1: Rollback, Recovery, And Artifact Verification Runbook

Release docs define gates. The recovery runbook now gives concrete response paths for bad releases, bad deck artifacts, compromised dependencies, source-input mistakes, local runtime failures, generated-output recovery, and artifact checksum/attestation verification.

Current artifact: [recovery-and-rollback.md](recovery-and-rollback.md).

Remaining limitation: P0 now has tracked workflow automation for artifact-attestation verification, but no hosted tag run has proven it yet.

### P2: Add Security Requirements Traceability

Security expectations now have a tracked traceability matrix from requirement to implementation to verification.

Current artifacts:

- [../templates/security_requirements_traceability.json](../templates/security_requirements_traceability.json)
- [../scripts/auditSecurityRequirementsTraceability.js](../scripts/auditSecurityRequirementsTraceability.js)

Current command: `npm run security:requirements`.

Remaining limitation: the gate validates traceability completeness and reports blocker counts. It does not remediate external-hosted blockers, prove manual QA, or certify release readiness.

### P2: Expand Negative Security Testing

Dedicated hostile-input coverage now groups adversarial cases across the major local attack surfaces.

Current artifact: [../test/hostileInputSecurity.test.js](../test/hostileInputSecurity.test.js).

Current coverage:

- TSV/CSV/JSON word candidate source rows with quoted delimiters, formula-like payloads, HTML/script text, JavaScript URL text, and slash-reading expansion
- Anki HTML rendering fixtures for script, image, SVG/animation, event-handler, and JavaScript URL text
- managed media path traversal and absolute-path rejection
- generated-output cleanup path guard rejection outside governed roots
- VOICEVOX Docker helper unknown-option and invalid-port abuse
- dependency spec and GitHub Actions pin mutation abuse in a temp repository

Remaining limitation: these are deterministic regression fixtures, not coverage-guided fuzzing, and they do not replace manual Anki import, media listening, mobile, screen-reader, hosted GitHub, or release-attestation verification.

### P2: Add A Formal Security Training And Reviewer Checklist

[../CONTRIBUTING.md](../CONTRIBUTING.md) defines review expectations. The formal checklist now defines security reviewer roles, renewal cadence, required topic IDs, readiness checks, private completion-evidence expectations, and update triggers.

Current artifact: [security-training-checklist.md](security-training-checklist.md).

Remaining limitation: the tracked checklist does not prove private training completion or personnel records. It defines the standard and evidence shape only.

### P2: Add SDLC Metrics

SDLC security metrics now have a tracked contract and CI/release gate.

Current artifacts:

- [../templates/sdlc_metrics.json](../templates/sdlc_metrics.json)
- [../scripts/reportSdlcMetrics.js](../scripts/reportSdlcMetrics.js)

Current commands: `npm run security:sdlc-metrics` for visibility, `npm run security:release-trust:pre` for tagged-workflow pre-attestation trust, and `npm run security:release-trust` for full fail-closed release-trust claims.

Current metrics cover unresolved high/critical risk visibility, overdue risk reviews, planned security-requirements backlog, external/partial requirement blockers, training topic coverage, and checklist section coverage.

Remaining limitation: visibility metrics expose current SDLC health and review cadence. Pre-release trust mode defers only configured post-release attestation-proof records; it still fails on other active release blockers. Full release-trust mode fails while any high/critical release-blocker risk or unimplemented release-blocker requirement remains, but it still does not close hosted GitHub blockers, prove private training completion, prove release manual QA, or certify product release readiness.

### P2: Add Release QA Evidence Packet

Release QA has a versioned tracked template and fail-closed validator so automation success cannot be mistaken for human/device QA. Packet version 3 binds package version, tag, current Git HEAD, release class, candidate run, and exactly one APKG per shipped deck kind to canonical levels, isolated path, release asset name, note/card/media counts, byte size, and SHA-256. All evidence is commit-bound. Production requires passed artifact QA; a semantic automation-reviewed prerelease may carry only explicit `PROD-REL-001` accepted-risk limitations and the exact warning label.

Current artifacts:

- [../templates/release_qa_evidence_packet.template.json](../templates/release_qa_evidence_packet.template.json)
- [../scripts/validateReleaseQaEvidence.js](../scripts/validateReleaseQaEvidence.js)
- [../src/services/releaseQaEvidenceService.js](../src/services/releaseQaEvidenceService.js)

Current commands: `npm run product:release-qa:evidence` and `npm run product:release-qa:apkg-inspect -- --packet=<packet> --artifact-dir=<dir> --require-golden`.

Remaining limitation: the evidence validator proves metadata/file/evidence-policy binding, and the APKG inspector proves ZIP/media/SQLite/deck/note/card/field/reference structure. Neither performs native Anki rendering, mobile review, interactive screen-reader review, listening/naturalness review, stroke-sequence visual review, or source-access work. Those checks are either passed for production or explicitly disclosed as accepted preview limitations.

### P3: Add License Compliance Automation

Dependency license compliance now has a tracked policy, deterministic audit command, CI/release workflow gate, and tagged release summary.

Current artifacts:

- [../templates/dependency_license_policy.json](../templates/dependency_license_policy.json)
- [../scripts/auditDependencyLicenses.js](../scripts/auditDependencyLicenses.js)
- [../src/datasets/dependencyLicensePolicy.js](../src/datasets/dependencyLicensePolicy.js)
- [../src/services/dependencyLicenseAuditService.js](../src/services/dependencyLicenseAuditService.js)
- [../test/dependencyLicenseAudit.test.js](../test/dependencyLicenseAudit.test.js)

Current commands: `npm run security:licenses` and `npm run security:licenses:write`.

Current posture from 2026-07-18 tracked lockfile review: `289` dependency packages, `275` allowlisted package entries, and `14` reviewed exception package entries for optional `sharp`/`libvips` binary packages. Missing, denied, unreviewed, or overdue reviewed-exception licenses fail closed.

Remaining limitation: the license audit validates package-lock metadata and tracked exception currency. It is not legal advice, does not prove upstream license-text completeness, and does not replace manual NOTICE or attribution review before external release claims.

## Implementation Record

1. Create `docs/github-repository-settings-checklist.md`.
2. Create `docs/threat-model.md`.
3. Create `docs/risk-register.md`.
4. Create `docs/incident-response.md`.
5. Create `docs/recovery-and-rollback.md`.
6. Add security requirements traceability data and a validation script.
7. Add dependency license compliance automation.
8. Add release QA evidence packet automation.

## Verification Used For This Audit

Local verification during the audit:

```bash
git status --short
git log -9 --oneline
rg --files -g "*.md" -g "*.yml" -g "*.yaml" -g "*.json" .github docs templates
rg -n "threat|incident|response|postmortem|rollback|risk|requirements|privacy|training|owner|CODEOWNERS|release|attest|SBOM|fuzz|secret|dependency|branch protection|vulnerability|disclosure|architecture|design" README.md SECURITY.md docs .github package.json
npm run voicevox:status
npm run doctor:voicevox
npm run security:licenses
npm run security:sdlc-metrics
npm run security:release-trust
```

The final VOICEVOX status was running, local-only, and runtime-hardened. `doctor:voicevox` reported the engine reachable and the pinned release voice ready.

## Update Triggers

Update this audit when SDLC controls, branch policy, CI/release workflows, hosted security posture, CodeQL or Dependabot alert posture, risk records, security requirements, training checklist, incident/recovery runbooks, release QA evidence, dependency policy, or source-governance posture changes.
