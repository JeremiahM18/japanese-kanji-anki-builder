# Threat Model

## Purpose

This threat model records the repository security assumptions, trust boundaries, abuse cases, mitigations, residual risks, and verification commands for the local deck-build system.

It expands the concise model in [../SECURITY.md](../SECURITY.md) and supports secure design review for code, data, media, workflow, release, and documentation changes.

## Scope

Covered:

- local Express development server
- command-line scripts and npm workflows
- ignored local `data/`, `downloads/`, and `out/` inputs and outputs
- generated TSV, APKG, media, and report artifacts
- source normalization and source-evidence workflows
- Anki HTML-rendered note fields
- VOICEVOX Docker runtime and generated audio
- assistive NLP/model runtime and generated NLP artifacts
- CI, CodeQL, dependency review, dependency-license compliance, SBOM, release bundle, and GitHub artifact attestations

Not covered:

- GitHub account security beyond repository settings visible to this project
- upstream package maintainer compromise outside dependency review and lockfile controls
- third-party source website availability or correctness
- Anki desktop or mobile application vulnerabilities
- private local datasets that are not available to the repository reviewer

## Authority Boundary

This document identifies expected risks and controls. It does not prove the live hosted GitHub settings are enabled, prove manual QA was performed, certify source truth, or make a release-ready claim.

Authoritative checks are:

- `npm run security:github-settings:auth`
- `npm run supply-chain:audit`
- `npm run security:advisories`
- `npm run security:branch-protection`
- `npm run security:licenses`
- `npm run security:secrets`
- `npm run security:sbom`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- product, source, media, NLP, and release gates named in [verification.md](verification.md)

## Primary Assets

| Asset | Security concern | Source of truth |
| --- | --- | --- |
| Repository code and scripts | Unauthorized or unsafe behavior in build, import, export, Docker, and release paths | `src/`, `scripts/`, `test/` |
| Package manifests and lockfile | Malicious, vulnerable, unlicensed, or unexpected dependency changes | [../package.json](../package.json), [../package-lock.json](../package-lock.json), [../templates/dependency_license_policy.json](../templates/dependency_license_policy.json) |
| GitHub workflows | Broad permissions, unpinned actions, missing checks, weak release provenance | [../.github/workflows](../.github/workflows), [supply-chain-security.md](supply-chain-security.md) |
| Generated deck content | HTML injection, wrong card data, untrusted media, stale review proof | tracked templates, review manifests, generated-output gates |
| Ignored local inputs | Untrusted dictionaries, corpora, PDFs, OCR, worksheets, media, and model files | local workstation plus source-input manifests |
| Release bundle | Tampered artifact, missing checksum, missing SBOM, missing attestation verification | [release-process.md](release-process.md), release workflow |
| Security reports | Disclosure details, exploit steps, or private data leakage | [../SECURITY.md](../SECURITY.md), [incident-response.md](incident-response.md) |

## Actors And Assumptions

| Actor | Assumption |
| --- | --- |
| Repository owner/maintainer | Has write access, owns review decisions, and can enable GitHub security settings. |
| Contributor or automation | Must pass local and hosted gates before merge. |
| Local user on the same workstation | May access local server and ignored files; local-only does not mean secret-safe. |
| Untrusted network user | Must not reach the Express or VOICEVOX server under default settings. |
| Upstream dependency maintainer | Could publish vulnerable or malicious package versions; lockfile, audit, and review gates reduce risk. |
| Source/material provider | May publish inaccurate, restricted, or changed content; source-use and citation lanes govern what can be stored. |
| AI/NLP runtime | May provide useful review context but cannot certify card truth, source truth, or release readiness. |

## Trust Boundaries And Data Flows

| Boundary | Data crossing it | Main controls |
| --- | --- | --- |
| Browser to local Express server | Export requests, media routes, inference requests | localhost default, structured route errors, tests, no internet exposure assumption |
| Ignored local inputs to tracked outputs | source worksheets, dictionaries, corpora, media, OCR, generated rows | source-input audits, provenance manifests, tracked contracts, no hidden CI reads from root `data/*` |
| External text to Anki HTML | meanings, examples, notes, filenames, media refs | exporter escaping, allowed markup ownership, HTML regression tests |
| Docker host to VOICEVOX container | local audio synthesis requests and generated files | localhost binding, `no-new-privileges`, capability drop, resource limits, status/doctor commands |
| npm registry to local install | package tarballs and metadata | lockfile integrity, registry restriction, install-script allowlist, dependency-license policy, npm advisory audit |
| GitHub Actions to release artifacts | smoke/gate outputs, SBOM, dependency-license summary, checksum manifest, docs | pinned actions, minimal permissions, release boundary audit, attestations |
| Maintainer to public disclosure | vulnerability details and patch status | private reporting preference, incident runbook, disclosure decision record |
| NLP artifacts to review workflows | tokenization, embeddings, draft suggestions, review packets | NLP governance gate, assistive-only docs, no certification authority |

## Abuse Cases And Mitigations

| Abuse case | Impact | Mitigations | Residual risk |
| --- | --- | --- | --- |
| Express server is exposed to an untrusted network | Local files, generated artifacts, or build routes become reachable outside trusted use | `SERVER_HOST` defaults to `127.0.0.1`; SECURITY.md warns against broad binding; route tests cover structured errors | User can still opt into broad binding; treat it as temporary and trusted-network only |
| External text injects HTML into Anki fields | Stored script or unsafe markup renders in Anki card fields | exporter escaping tests; known-safe exporter-owned markup only | Anki rendering behavior can change; manual import QA remains required |
| Malformed XML, TSV, CSV, JSON, PDF, or OCR input corrupts source governance | Wrong source evidence, broken import, or unsafe parser behavior | source-input preflights, parser tests, entity expansion disabled where implemented, dry-run-first import scripts | P2 hostile-input corpus must expand coverage |
| Local ignored `data/*` becomes hidden CI truth | CI passes while real local generated rows are unverified or stale | tracked CI source-boundary tests reject root `data/*` reads; local-data gates stay explicit | Prepared workstations can still contain stale data; reviewers must run current local gates |
| Dependency update introduces vulnerable, malicious, or unreviewed-license code | Build/runtime compromise or unexpected redistribution obligations | lockfile integrity, registry-only policy, install-script allowlist, dependency-license audit, dependency review, `npm audit`, CodeQL | npm advisory data and dependency review are time-sensitive external services; license metadata still needs manual legal/NOTICE review for release claims |
| GitHub workflow requests excessive permission | Token abuse, artifact tampering, or unwanted publishing | top-level read-only permissions; scoped CodeQL and attestation exceptions; action SHA pinning; supply-chain audit | Hosted branch protection is drift-prone and must be rechecked before release-trust claims |
| Release bundle is tampered with or misunderstood | Users trust an unverified APKG, TSV, SBOM, or report | checksum manifest, SBOM, provenance/SBOM attestations, release process docs, tracked attestation verification step | P0 has tracked verification automation, but hosted tag-run evidence is not yet proven |
| VOICEVOX container runs with broad network or broad Linux capabilities | Local runtime escape or unexpected network exposure | managed helper enforces local bind and Docker runtime hardening; doctor/status commands | Docker itself and image supply chain remain external dependencies |
| NLP output is treated as card proof | Bad suggestions become certified learner content | assistive-only docs, governance gate, review-packet validation, Platinum/Obsidian separation | Human reviewers must keep certification decisions separate from model context |
| Private vulnerability details are disclosed publicly too early | Exploit details or private data leak | SECURITY.md reporting rules; incident response runbook; minimal public issue guidance | Private vulnerability reporting is currently disabled in hosted GitHub settings |

## Residual Risks

- Hosted `main` branch protection and private vulnerability reporting are currently verified by authenticated owner audit, but they remain drift-prone hosted settings and must be rechecked before release-trust claims.
- Authenticated hosted audit now verifies branch protection, secret scanning, push protection, private vulnerability reporting, Dependency Graph, Dependabot security updates, Dependabot alert visibility, and CodeQL alert visibility. CodeQL still has open hosted alerts until the tracked remediation reaches hosted `main` and reruns cleanly.
- Release attestation creation and tracked verification automation are present, but hosted tag-run verification evidence is not yet proven.
- Manual Anki import, mobile, screen-reader, listening, and visual media QA cannot be replaced by automated tests.
- Source-evidence confidence and source-use posture remain separate from generated card correctness.
- Ignored local inputs can be stale or restricted; tracked docs must not turn them into source truth without governed promotion.

## Verification

Run the focused security bundle after changing this model or a named control:

```bash
git status --short --untracked-files=all
npm run security:github-settings:auth
npm run supply-chain:audit
npm run security:advisories
npm run security:branch-protection
npm run security:licenses
npm run security:secrets
npm run security:sbom
npm run lint
npm run typecheck
npm test
```

Run additional gates from [verification.md](verification.md) when source, media, NLP, deck content, release artifacts, or local generated rows are affected.

## Update Triggers

Update this model when:

- a new network listener, route, parser, importer, Docker behavior, model runtime, or generated artifact boundary is added
- workflow permissions, required checks, release artifacts, or attestation behavior changes
- a dependency class, install-script exception, or dependency-license exception changes
- a security incident, accepted risk, or post-incident review changes assumptions
- source-governance, Platinum, Obsidian, or release-readiness authority boundaries change
