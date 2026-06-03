# Risk And Exception Register

## Purpose

This register records security, release, source-governance, and operational risks that are not fully resolved by current automated gates.

Use it to distinguish blockers, accepted residual risks, temporary exceptions, expected fail-closed backlog, and items that need owner action outside local code changes.

## Scope

Covered:

- hosted GitHub security settings
- release artifact and attestation posture
- dependency and supply-chain exceptions
- local runtime and ignored-input boundaries
- source-governance and card-review blockers
- manual QA and release readiness risks
- assistive NLP boundaries

Not covered:

- per-card Platinum or Obsidian review history
- every transient CI failure
- private local source files or credentials
- upstream service incidents outside this repository's control

## Authority Boundary

This register does not accept risk by itself. A risk is accepted only when the `Decision` field says `Accepted`, the owner is named, the rationale is explicit, and the next review date is current.

Open, blocked, unverified, or overdue risks are not release-ready claims.

## Severity Scale

| Severity | Definition |
| --- | --- |
| Critical | Can undermine repository integrity, release trust, vulnerability intake, or public user safety. |
| High | Can cause wrong release claims, untriaged security exposure, unsafe generated content, or significant governance drift. |
| Medium | Can create review confusion, local-only exposure, or narrower process gaps. |
| Low | Documentation or workflow improvement with limited immediate security impact. |

## Decision States

| Decision | Meaning |
| --- | --- |
| Open | Needs mitigation, verification, or owner action. |
| Blocked external | Cannot be fixed from local files alone. |
| Accepted | Residual risk is intentionally accepted with rationale and next review date. |
| Mitigated | Control exists and current verification is clean. |
| Superseded | Risk was replaced by a newer record. |

## Register

| ID | Severity | Decision | Owner | Risk | Evidence | Required next action | Next review |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SEC-P0-001 | Critical | Mitigated | Repository owner | Hosted `main` must enforce the tracked branch-protection policy or required checks and review policy can be bypassed. | 2026-06-02 authenticated `npm run security:github-settings` verifies branch protection is enabled and matches [../.github/branch-protection.main.json](../.github/branch-protection.main.json). | Keep the hosted audit in security verification; rerun after workflow names, required checks, branch policy, or repository ownership changes. | 2026-07-02 |
| SEC-P0-002 | High | Mitigated | Repository owner | Private vulnerability reporting must remain enabled for confidential intake. | 2026-06-02 authenticated `npm run security:github-settings` verifies private vulnerability reporting is `enabled:true`. | Keep private vulnerability reporting enabled or record an approved private intake alternative in [../SECURITY.md](../SECURITY.md). | 2026-07-02 |
| SEC-P0-003 | High | Mitigated | Repository owner | Dependabot alert state and Dependency Graph must remain visible so open dependency alerts cannot hide from release-trust evidence. | 2026-06-02 authenticated `npm run security:github-settings` verifies vulnerability alerts are enabled, Dependency Graph SBOM is readable with `289` packages, Dependabot security updates are enabled and not paused, and open Dependabot alerts are `0`. | Keep Dependency Graph, vulnerability alerts, and Dependabot security updates in the hosted audit; rerun after repository ownership, visibility, or GitHub security setting changes. | 2026-07-02 |
| SEC-P0-004 | High | Open | Repository owner | Release attestation creation is present, and tracked workflow remediation now verifies representative release bundle artifacts, but hosted evidence has not yet proven the verification step after a tagged release. | [github-repository-settings-checklist.md](github-repository-settings-checklist.md), [release-process.md](release-process.md), [../.github/workflows/release.yml](../.github/workflows/release.yml) | Merge the workflow verification step to hosted `main`, run a tagged release workflow, and rerun `npm run security:github-settings` until hosted attestation verification is proven. | 2026-06-16 |
| SEC-P0-005 | High | Open | Repository owner | Live CodeQL alert state is visible and currently has `19` open alerts, so CodeQL cannot be treated as clean release evidence. | 2026-06-02 authenticated `npm run security:github-settings`; live CodeQL alert listing from `GET /repos/JeremiahM18/japanese-kanji-anki-builder/code-scanning/alerts?state=open&per_page=100`; tracked local remediations now cover known alert patterns including proof-ledger JSONL append boundaries. | Merge local remediations, rerun hosted CodeQL, and keep `npm run security:github-settings` failing until open CodeQL alerts are `0`, or record explicit accepted-risk rationale for any dismissed alert. | 2026-06-16 |
| SEC-SUP-001 | Medium | Accepted | Repository owner | Native dependency install scripts and reviewed dependency-license exceptions are allowed for specific packages and could expand attack surface or attribution obligations if versions drift. | [supply-chain-security.md](supply-chain-security.md), `npm run supply-chain:audit`, `npm run security:licenses` | Keep lifecycle-script allowlist exact by package and version; keep reviewed license exceptions current by package, reason, owner, and next-review date; reassess every new native dependency, version change, or license-expression change. | 2026-07-02 |
| SEC-LOCAL-001 | Medium | Accepted | Repository owner | Local Express server has no authentication and is safe only under localhost/trusted-network assumptions. | [../SECURITY.md](../SECURITY.md), [threat-model.md](threat-model.md) | Keep `SERVER_HOST` default at `127.0.0.1`; document any deliberate broad binding as temporary and trusted-network only. | 2026-07-02 |
| SEC-LOCAL-002 | Medium | Mitigated | Repository owner | VOICEVOX runtime could expose a broad host bind or weak container posture. | [../SECURITY.md](../SECURITY.md), `npm run voicevox:status`, `npm run doctor:voicevox` | Keep helper-enforced localhost bind, capability drop, no-new-privileges, and resource limits; rerun doctor after Docker/runtime changes. | 2026-07-02 |
| SEC-DATA-001 | High | Mitigated | Repository owner | Dedicated hostile-input and fuzz-style coverage was thin for parsers, generated HTML, media paths, generated-output cleanup, Docker-helper arguments, and package boundaries. | [software-development-life-cycle-audit.md](software-development-life-cycle-audit.md), [../test/hostileInputSecurity.test.js](../test/hostileInputSecurity.test.js) | Keep adversarial fixtures in tracked tests and add new cases whenever parser, renderer, media, Docker, or dependency-policy surfaces change. | 2026-07-02 |
| GOV-SRC-001 | High | Open | Repository owner | Source-access gaps and manual-citation-only lanes can be mistaken for complete source truth. | [product-exit-criteria.md](product-exit-criteria.md), source-evidence manifests | Keep source-access gaps non-voting; require exact permitted assignment evidence before promotion. | 2026-07-02 |
| PROD-REL-001 | High | Open | Repository owner | Green automated gates do not prove APKG import, mobile, accessibility, listening, or manual media QA. | [release-process.md](release-process.md), [product-exit-criteria.md](product-exit-criteria.md) | Record manual QA evidence before release-ready claims; keep release QA blockers visible. | 2026-07-02 |
| NLP-001 | Medium | Accepted | Repository owner | NLP/model outputs can influence review focus but must not become certification proof. | [nlp-model-governance.md](nlp-model-governance.md), [threat-model.md](threat-model.md) | Keep `nlp:governance-gate` assistive-only and preserve Platinum/Obsidian authority boundaries. | 2026-07-02 |

## Exception Rules

- Exceptions must be narrow, dated, owned, and tied to a concrete verification command or artifact.
- Exceptions must not bypass source-use restrictions, secret handling, branch protection, vulnerability intake, release attestation verification, Platinum review, Obsidian proof, or manual release QA.
- Expired exceptions revert to `Open` until reviewed.
- Accepted risks must be reconsidered after any incident, dependency change, release workflow change, or new public-facing claim.

## Verification

Run after changing this register:

```bash
git status --short --untracked-files=all
npm run security:github-settings
npm run supply-chain:audit
npm run security:branch-protection
npm run security:licenses
npm run security:secrets
npm run lint
npm test
```

`security:github-settings` may fail while SEC-P0 records remain open. That failure is evidence, not a pass.

## Update Triggers

Update this register when:

- a live hosted GitHub setting changes
- a risk is mitigated, accepted, reopened, or becomes overdue
- a dependency exception, workflow permission exception, source-use exception, or release blocker changes
- incident response, post-incident review, or recovery work creates a new residual risk
- dependency-license policy automation changes the risk posture
