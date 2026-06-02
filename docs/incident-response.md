# Incident Response Runbook

## Purpose

This runbook defines how to handle a suspected security incident, vulnerability report, compromised dependency, unsafe generated artifact, or release-trust failure for this repository.

It complements [../SECURITY.md](../SECURITY.md) by defining the operational path after a report or signal is received.

## Scope

Covered incidents include:

- credential, token, or private-key exposure
- vulnerable, malicious, or compromised dependency
- unsafe local server, Docker, parser, media import, or generated HTML behavior
- source-evidence or generated-card defect with security, trust, or release impact
- release artifact tampering, missing checksum, missing SBOM, or unverifiable attestation
- CodeQL, Dependabot, dependency review, npm advisory, secret-scan, or branch-protection alerts
- public vulnerability disclosure involving this project

Not covered:

- routine card-quality fixes without security, trust, source-use, or release impact
- private account recovery outside repository controls
- third-party application vulnerabilities in Anki, Docker, GitHub, npm, or VOICEVOX

## Authority Boundary

This runbook does not replace legal advice, platform provider guidance, GitHub security settings, or manual release QA. It defines the local repository response workflow.

Do not publish exploit details, private source material, credentials, or proof-of-concept payloads in public issues or commits.

## Severity Classification

| Severity | Criteria | Initial target |
| --- | --- | --- |
| Sev0 Critical | Active credential compromise, malicious release artifact, exploitable public release, or repository integrity compromise | Contain same day |
| Sev1 High | Confirmed vulnerability in shipped/release-facing behavior, vulnerable dependency with practical impact, or unverified release trust claim | Triage within 1 business day |
| Sev2 Medium | Local-only issue with meaningful abuse path, parser hardening gap, unsafe generated surface before release, or governance bypass | Triage within 3 business days |
| Sev3 Low | Documentation gap, low-impact hardening task, or defense-in-depth improvement | Triage within 5 business days |

Targets are operating goals, not release claims. If severity is uncertain, classify higher until evidence supports lowering it.

## Intake

1. Prefer GitHub private vulnerability reporting if enabled.
2. If private reporting is unavailable, use a trusted private channel to the repository owner.
3. If no private channel exists, open a minimal public issue asking for a private security contact. Do not include exploit details.
4. Record the report source, received time, affected surface, suspected severity, and whether public details already exist.
5. Preserve the original report privately. Do not copy restricted source content or credentials into tracked files.

## Triage

Run these starting checks from a clean working tree when possible:

```bash
git status --short --untracked-files=all
git log -5 --oneline
npm run security:github-settings
npm run supply-chain:audit
npm run security:advisories
npm run security:branch-protection
npm run security:secrets
npm run security:sbom
```

Then identify:

- affected component, command, route, parser, workflow, generated artifact, or release bundle
- affected versions, commits, tags, and generated outputs
- whether ignored local `data/`, `downloads/`, `out/`, model, Docker, or media files are involved
- whether the issue is reproducible from tracked fixtures or requires private local inputs
- whether public users or only local development workflows are affected
- whether the issue requires immediate containment before a full fix

## Containment

Use the least destructive containment that stops harm:

- revoke exposed credentials or tokens through the provider first; then remove tracked evidence and rotate dependent secrets
- disable or supersede unsafe release claims; do not create new release tags until verification is clean
- stop a broad-bound VOICEVOX or local server runtime and restart through governed commands
- block unsafe dependency updates by reverting the dependency change through a focused commit or pinning a safe version
- quarantine unsafe generated outputs under ignored local paths; do not commit private local artifacts
- pause source-evidence or card-review work when source-use or correctness cannot be proven
- document open containment risks in [risk-register.md](risk-register.md)

Do not use `git reset --hard`, destructive cleanup, force push, or tag movement unless the owner explicitly approves and the action is recorded.

## Fix And Verification

Use a focused branch and keep the fix narrowly scoped.

Minimum verification bundle for security fixes:

```bash
git diff --check
npm run lint
npm run typecheck
npm run supply-chain:audit
npm run security:advisories
npm run security:branch-protection
npm run security:secrets
npm run security:sbom
npm test
```

Add affected-area gates:

| Affected area | Additional verification |
| --- | --- |
| Express server or routes | focused route tests plus `npm test` |
| Parser/importer/source input | hostile fixture test, source-input preflight, relevant source audit |
| Anki HTML/export | exporter escaping test, smoke export, affected deck gate |
| Dependency or lockfile | `npm run security:advisories`, `npm run supply-chain:audit`, P3 license gate when available |
| GitHub workflow or release path | `npm run security:branch-protection`, `npm run supply-chain:audit`, `npm run security:sbom`, release gate |
| VOICEVOX/Docker | `npm run voicevox:status`, `npm run doctor:voicevox`, affected audio tests |
| NLP governance | `npm run nlp:governance-gate` |
| Product deck or media claim | product/readiness gates plus manual QA evidence |

If a gate fails for an expected open blocker, name the exact blocker and link to the risk-register record. Do not call it green.

## Communication

Use concise, private communication until disclosure is approved.

Include:

- current severity
- affected surface
- user impact
- containment state
- verification status
- expected next update time

Avoid:

- exploit details in public channels
- private source files, credentials, or local data
- premature release-ready claims
- blaming upstreams before evidence is established

## Disclosure And Release

Before public disclosure or release claims:

1. Fix or explicitly accept residual risk in [risk-register.md](risk-register.md).
2. Run the minimum verification bundle and affected-area gates.
3. Update [../SECURITY.md](../SECURITY.md), [threat-model.md](threat-model.md), [recovery-and-rollback.md](recovery-and-rollback.md), or release docs if behavior changed.
4. Update [../CHANGELOG.md](../CHANGELOG.md) with a release-facing security note when the change matters to users.
5. If releasing, follow [release-process.md](release-process.md), verify checksums, verify artifact attestations, and keep manual QA separate from automated gates.

## Post-Incident Review

After containment and fix:

- record timeline, root cause, impact, detection source, containment, fix, and verification
- add or update regression tests
- update threat model and risk register
- update runbooks if response steps were unclear
- decide whether branch protection, private vulnerability reporting, secret scanning, push protection, CodeQL, dependency review, or attestation verification settings need owner action
- identify one or more prevention improvements with owners and review dates

## Verification For This Runbook

Run after changing this runbook:

```bash
git diff --check
npm run security:secrets
npm run lint
npm test
```

Run the full security bundle when the runbook change also changes a security control, workflow, dependency, release artifact, or hosted-setting claim.

## Update Triggers

Update this runbook when:

- a real incident or security report exposes a missing step
- private vulnerability reporting or hosted alert settings change
- release, attestation, dependency, source-input, Docker, parser, or generated-output controls change
- severity targets or maintainer contact routes change
