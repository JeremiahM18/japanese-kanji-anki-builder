# Security Training And Reviewer Checklist

## Purpose

This checklist defines the minimum security-readiness expectations for reviewers who approve code, data-governance, source-evidence, generated-output, release, or dependency changes in this repository.

It is designed for repeatable review. It gives a reviewer a concrete way to prove they understand the repository's real risks before approving sensitive work.

## Scope

Covered:

- secure coding review for JavaScript, Node.js scripts, and local Express surfaces
- Anki HTML, TSV, generated-output, media, and parser boundaries
- dependency, workflow, SBOM, release-artifact, and attestation posture
- source-use, copyright, provenance, JLPT evidence, and card-certification boundaries
- incident response, recovery, vulnerability disclosure, and risk-register handling
- assistive NLP boundaries

Not covered:

- employment or HR training records
- private personnel files
- proof that a hosted platform setting is enabled
- proof that release manual QA has been completed

## Authority Boundary

This document defines reviewer-readiness expectations. It does not certify that a reviewer has completed training by itself.

Training completion evidence must be recorded outside this public repository or in a deliberately approved private record. The repository only tracks the checklist, review cadence, required topics, and the command that validates this checklist.

## Reviewer Roles

| Role | Required when approving | Renewal cadence |
| --- | --- | --- |
| Security reviewer | Security controls, threat model, risk register, incident response, release trust, dependency policy, hosted settings, or CI workflow changes | Every 90 days |
| Source-governance reviewer | JLPT source evidence, source-input manifests, source-access packets, copyrighted source posture, or assignment imports | Every 90 days |
| Product/release reviewer | Release bundles, APKG/media/manual QA posture, product readiness, exported TSV behavior, or release docs | Every 90 days |
| NLP governance reviewer | NLP manifests, tokenization, embeddings, suggestions, review packets, draft proposals, or assistive-model governance | Every 90 days |

## Required Training Areas

Each reviewer must be able to explain and apply these topic IDs:

| Topic ID | Area | Reviewer must be able to do |
| --- | --- | --- |
| secure-coding-basics | Secure implementation | Identify injection, path traversal, unsafe cleanup, unsafe subprocess, unsafe parser, and unsafe error-disclosure risks. |
| anki-html-and-generated-output | Anki and generated artifacts | Explain why external text is escaped, which exporter-owned HTML is allowed, and why generated `out/` artifacts are not tracked truth. |
| parser-and-hostile-inputs | Hostile local inputs | Review TSV, CSV, JSON, XML, media path, and source worksheet inputs as untrusted until validated. |
| supply-chain-updates | Dependencies and workflows | Review lockfile integrity, lifecycle-script allowlists, GitHub Actions pins, workflow permissions, advisory audit, SBOM, and license gates. |
| release-artifact-trust | Release trust | Verify checksums, SBOM, release-gate output, artifact boundaries, and attestation verification evidence before external trust claims. |
| source-use-provenance | Source governance | Keep source truth, source-use permission, source-access gaps, citations, and card certification separate. |
| card-certification-boundaries | Card review authority | Preserve Gold, Platinum, Obsidian, NLP support, source governance, media QA, and release readiness as separate lanes. |
| incident-response | Response operations | Use the incident-response and recovery runbooks, classify severity, contain, verify, communicate, and record post-incident follow-up. |
| ai-nlp-boundaries | Assistive AI/NLP | Treat NLP/model outputs as review support only; never allow them to certify cards, source truth, or release readiness. |

## Reviewer Readiness Checklist

Before approving a sensitive pull request, the reviewer should confirm:

- [ ] I inspected the live diff, not only a summary.
- [ ] I know which authority lane changed: security, source evidence, Platinum, Obsidian, NLP, generated artifact, media QA, or release readiness.
- [ ] I can name the exact verification commands required by the changed files.
- [ ] I checked whether `docs/risk-register.md` or `templates/security_requirements_traceability.json` needs an update.
- [ ] I checked whether README, command reference, release docs, verification docs, and changelog claims changed.
- [ ] I checked whether a hosted GitHub setting or manual QA claim remains unverified.
- [ ] I checked whether the change adds or changes dependencies, workflow permissions, release artifacts, source inputs, parser behavior, subprocess execution, cleanup paths, or generated-output trust.
- [ ] I checked whether any AI/NLP output is being treated as proof instead of support context.
- [ ] I can explain the residual risk or blocker in plain language.

## Evidence And Cadence

Minimum cadence:

- Review this checklist every 90 days.
- Re-run `npm run security:sdlc-metrics` whenever this checklist, SDLC metrics, risk register, traceability matrix, CI workflow, release workflow, dependency policy, or security documentation changes.
- Record training completion in an approved private place. Do not commit private personnel records.

Recommended evidence fields for private completion records:

- reviewer name or handle
- role
- topics completed
- completion date
- next review date
- approving owner
- notes for exceptions or refresh work

## Verification

Run after changing this checklist:

```bash
git status --short --untracked-files=all
npm run security:sdlc-metrics
npm run security:requirements
npm test
```

`security:sdlc-metrics` validates that this checklist keeps the required sections and topic IDs. It does not prove private training completion.

## Update Triggers

Update this checklist when:

- the threat model, risk register, incident runbook, recovery runbook, or security requirements change
- a new parser, generated-output path, subprocess path, dependency policy, release artifact, or hosted security setting enters scope
- source-governance or card-certification standards change
- AI/NLP model or review-packet governance changes
- an incident, tabletop review, or post-release review identifies a training gap
