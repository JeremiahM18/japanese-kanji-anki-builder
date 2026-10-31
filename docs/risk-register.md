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
| SEC-P0-001 | Critical | Blocked external | Repository owner | Hosted `main` must enforce the tracked branch-protection policy or required checks and review policy can be bypassed. | 2026-10-31 recheck: main is protected and all 13 required context names match tracked policy. Full protection API returned 403 Resource not accessible by integration, so strict/review/conversation/admin-bypass controls were not reverified. Historical evidence below is not a current full-policy pass. Historical record: On 2026-09-03, the repository-owner authenticated audit verified that hosted main is protected and matches the tracked required checks and branch policy. Latest main CI and CodeQL conclusions are success. The first attempt used the other signed-in account and returned 403/404 on restricted endpoints; the command-scoped owner retry verified those endpoints without changing the active account. After PR #251 merged and its main CI and CodeQL runs succeeded, a fresh owner audit passed with no findings; the two dependency alerts are resolved as recorded below. | Keep the hosted audit in security verification; rerun after workflow names, required checks, branch policy, or repository ownership changes. | 2026-10-03 |
| SEC-P0-002 | High | Blocked external | Repository owner | Private vulnerability reporting must remain enabled for confidential intake. | 2026-10-31 recheck blocked: connector does not support private-reporting/secret-alert endpoints and repository metadata omitted security_and_analysis; no authenticated local gh host/token is available. Confidential intake/settings are not currently reverified. Historical record: On 2026-09-03, the repository-owner authenticated audit verified private vulnerability reporting, secret scanning, and push protection enabled, readable security settings, and zero open secret-scanning alerts. The post-merge owner audit passed with no findings after the two dependency alerts were resolved as recorded below. | Keep private vulnerability reporting enabled or record an approved private intake alternative in [../SECURITY.md](../SECURITY.md). | 2026-10-03 |
| SEC-P0-003 | High | Blocked external | Repository owner | Dependabot alert state and Dependency Graph must remain visible so open dependency alerts cannot hide from release-trust evidence. | 2026-10-31 local patched-branch npm audit reports zero vulnerabilities, but hosted Dependabot alerts and Dependency Graph SBOM endpoints are unavailable to this integration. This does not close main-branch hosted alerts or renew their visibility evidence. Historical record: On 2026-09-03, protected squash merge [PR #251](https://github.com/JeremiahM18/japanese-kanji-anki-builder/pull/251) landed at main commit `9737c46ec26ef63277ed6db2333b27449d4cdca1`. GitHub marked Dependabot alerts 6 (qs) and 7 (@humanfs/node) fixed at 20:50:19 UTC. The subsequent repository-owner authenticated `npm run security:github-settings:auth` passed with zero open Dependabot alerts, enabled vulnerability alerts and security updates, and a readable Dependency Graph SBOM containing 277 packages. The merged lockfile resolves qs 6.16.0 and @humanfs/node 0.16.8; the live advisory audit reports zero vulnerabilities. | Keep authenticated hosted alert visibility and the internet-backed advisory audit in merge/release verification; reopen immediately if either surface reports an unresolved alert. | 2026-10-03 |
| SEC-P0-004 | High | Blocked external | Repository owner | Release attestation creation and all-file constrained verification must remain proven by a successful tagged-ref Release workflow and independent downloaded-asset verification. | 2026-10-31 metadata recheck matches beta.5 commit, prerelease status, seven assets and expected SBOM digest; historical Release run and attestation steps remain successful. The run artifact list now returns zero artifacts, so artifact 8826672122 is no longer downloadable. No fresh downloaded-asset or constrained attestation verification was performed; historical proof remains historical. Historical record: On 2026-09-03, the owner audit reconfirmed successful hosted release attestation creation and all-file verification. Release metadata still identifies the same beta.5 commit, seven assets, prerelease label, and SBOM digest below. The independent download verification below is retained historical evidence from August 1; no new download or human/device review is claimed. On 2026-08-01 tagged Release workflow [30726889778](https://github.com/JeremiahM18/japanese-kanji-anki-builder/actions/runs/30726889778) succeeded for immutable tag `v0.3.0-beta.5` at commit `b9a820630cec9d53ebec8e06969ee0d4f658fba1` and published the labeled [N5 prerelease](https://github.com/JeremiahM18/japanese-kanji-anki-builder/releases/tag/v0.3.0-beta.5) with seven assets. A fresh download verified exact six-file checksum-manifest membership and hashes, including CycloneDX SBOM SHA-256 `ff385e0f679c0fe782ad348505b5358faa8d8f5bd11a6f7255a2962ef4a77273`; constrained `gh attestation verify` passed for all `7/7` assets against the exact repository, signer workflow, tag ref, and source digest. Immutable Actions artifact `8826672122` retained the same seven files byte-for-byte, and owner-authenticated `npm run security:github-settings:auth` passed with artifact attestation verification proven, all hosted alert counts at zero, and latest main CI, CodeQL, and Release conclusions successful. [github-repository-settings-checklist.md](github-repository-settings-checklist.md), [release-process.md](release-process.md), [releases/v0.3.0-beta.5-n5-automation-preview.md](releases/v0.3.0-beta.5-n5-automation-preview.md), [../.github/workflows/release.yml](../.github/workflows/release.yml) | Keep checksum, SBOM, provenance/SBOM attestation, immutable Actions evidence, all-file constrained verification, and owner-authenticated hosted audit gates mandatory; reopen on any failed tagged run, missing/mismatched asset, verification failure, permission drift, or release-workflow change. | 2026-10-03 |
| SEC-P0-005 | High | Blocked external | Repository owner | Live CodeQL, secret-scanning, and dependency alert state must stay visible and triaged before hosted security can be cited as clean release evidence. | 2026-10-31 recheck: latest main CI run33805910516 succeeded on September 3 and CodeQL40531002153 succeeded October 27. Alert endpoints are unavailable to this integration, so these conclusions do not prove zero current CodeQL/secret/Dependabot alerts. Historical record: On 2026-09-03, after protected merge commit `9737c46ec26ef63277ed6db2333b27449d4cdca1`, main [CI run 33804575536](https://github.com/JeremiahM18/japanese-kanji-anki-builder/actions/runs/33804575536) and [CodeQL run 33804575591](https://github.com/JeremiahM18/japanese-kanji-anki-builder/actions/runs/33804575591) both succeeded. The subsequent repository-owner authenticated `npm run security:github-settings:auth` passed with zero open CodeQL, secret-scanning, and Dependabot alerts. Alerts 6 and 7 are fixed; required branch protection still matches the tracked policy. This closes the dependency-maintenance blocker without asserting a new release or human/device QA. | Keep the hosted audit in merge/release verification and reopen if any required main run fails or any CodeQL, secret-scanning, or Dependabot alert remains unresolved. | 2026-10-03 |
| SEC-SUP-001 | Medium | Accepted | Repository owner | Native dependency install scripts and reviewed dependency-license exceptions are allowed for specific packages and could expand attack surface or attribution obligations if versions drift. | On 2026-10-31, all 14 optional Sharp 0.35.5/libvips 1.3.4 package registry metadata, lock-integrity-verified tarballs, manifests, and README license matrices were reviewed. The exact-version license gate passes with 14 exceptions; release assets still exclude node_modules. The three lifecycle approvals remain unchanged. The ineffective ONNX GPU-skip environment variable was corrected to ONNXRUNTIME_NODE_INSTALL_CUDA=skip, and the reviewed CPU-only rebuild passes. | Keep lifecycle-script allowlist exact by package and version; keep reviewed license exceptions current by exact package version, reason, owner, and next-review date; reassess every new native dependency, version, package-content, distribution-boundary, or license-expression change. | 2026-11-30 |
| SEC-SUP-002 | Medium | Mitigated | Repository owner | A transitive security override outside an upstream parent range can create compatibility drift even when it removes a known advisory. | On 2026-10-31, Sharp was advanced to 0.35.5 to fix the later libheif/librsvg advisories as well as the original advisory. Latest Transformers.js 4.3.2 accepts the patched version, while this repository remains exactly pinned to 3.8.1 and its model contract. The explicit newer-major migration posture requires an exact locked direct pin, newer upstream major, accepting range, rationale, and unchanged AST-enforced embedding-only boundary. The unchanged model cache was restored and its four files, 135392208 bytes, and tracked SHA-256 verified; doctor, live evaluation (remote downloads disabled), and NLP governance pass with reproduced metrics. This does not certify image/vision compatibility or accept broader residual use. | Keep the fail-closed source/model boundary and every recorded validation command current; re-review before any Transformers import, pipeline task, active model task, parent/child version, or upstream range change, and remove the override once the parent range safely resolves a patched Sharp version. | 2026-11-30 |
| SEC-LOCAL-001 | Medium | Accepted | Repository owner | Local Express server has no authentication and is safe only under localhost/trusted-network assumptions. | On 2026-10-31, source inspection reconfirmed SERVER_HOST defaults to 127.0.0.1 and SECURITY.md/threat-model.md prohibit internet or untrusted-LAN exposure. Config/server and hostile-input boundary tests passed (20 total across these files). Existing localhost/trusted-network risk acceptance is unchanged; no authentication, broad binding, or deployment-exposure claim is introduced. | Keep `SERVER_HOST` default at `127.0.0.1`; document any deliberate broad binding as temporary and trusted-network only. | 2026-11-30 |
| SEC-LOCAL-002 | Medium | Mitigated | Repository owner | VOICEVOX runtime could expose a broad host bind or weak container posture. | On 2026-10-31, all 25 VOICEVOX helper/client/doctor/import tests passed, including governed bind and hardening controls. Read-only voicevox:status exited 1 because Docker is absent (spawnSync docker ENOENT); doctor:voicevox exited 0 while explicitly reporting engine reachable=no and release voice ready=no. Code-level mitigation remains verified; actual runtime readiness is unavailable and must be checked before audio generation. | Keep helper-enforced localhost bind, capability drop, no-new-privileges, and resource limits; rerun status and doctor after Docker/runtime changes and before governed audio generation. | 2026-11-30 |
| SEC-DATA-001 | High | Mitigated | Repository owner | Dedicated hostile-input and fuzz-style coverage was thin for parsers, generated HTML, media paths, generated-output cleanup, Docker-helper arguments, and package boundaries. | On 2026-10-31, all hostileInputSecurity.test.js cases passed, covering hostile source rows, Anki HTML escaping, media/generated-path traversal, Docker argument separation, and supply-chain mutations. The incorrect ONNX GPU-skip variable was corrected in workflow enforcement and its hostile mutation fixture. These tests prove code-level controls, not source-depth completion, deployment exposure, or card certification. | Keep adversarial fixtures in tracked tests and add new cases whenever parser, renderer, media, Docker, or dependency-policy surfaces change. | 2026-11-30 |
| GOV-SRC-001 | High | Open | Repository owner | Free/public JLPT source expansion is paused because available permitted surfaces have been expanded as far as current access allows; source-access gaps and manual-citation-only lanes can still be mistaken for complete source truth if release evidence blurs the boundary. | 2026-10-31 factual recheck confirms governance passing but depth incomplete: 1765 rows need review; 388 high/60 standard/22 disputed/1742 weak; N5 weak32/80 with queue0. The local Sou Matome worksheet is absent, so its current worksheet counts cannot be verified and historical counts below remain historical. Owner acceptance has not been renewed by this dependency-fix task. Historical record: On 2026-09-03, `npm run data:audit:jlpt:source-access` still reported `1765` rows needing governed source review, with Sou Matome paused at `442` reviewed / `473` source-access gaps / `1297` pending. `npm run data:audit:jlpt:sources -- --governance-strict --limit=25` reported source-use governance passing and evidence depth failing: `388` high-confidence, `60` standard-confidence, `22` disputed, and `1742` weak-evidence kanji. N5 has no source review queue or contract mismatch, but `32/80` N5 kanji remain weak-evidence; that limitation remains accepted and non-voting. [source-acquisition-register.md](source-acquisition-register.md), [product-exit-criteria.md](product-exit-criteria.md), source-evidence manifests, and [../templates/release_qa_evidence_packet.template.json](../templates/release_qa_evidence_packet.template.json) preserve the boundary. | Keep source-access gaps and manual-citation-only lanes non-voting; do not claim source evidence-depth completion; record `acceptedRiskRecord: GOV-SRC-001` in release QA evidence while source depth is incomplete; reopen if any source_access_gap, manual-citation-only, generated, NLP, or Obsidian compatibility surface is promoted into source truth without exact permitted assignment evidence. | 2026-10-03 |
| PROD-REL-001 | High | Accepted | Repository owner | Green automated gates, packaged Golden regression, and structural APKG inspection do not prove native desktop import/rendering, mobile behavior, interactive screen-reader behavior, listening/naturalness, or stroke-sequence visual correctness. | On 2026-08-01 the repository owner explicitly accepted this bounded residual risk for labeled automation-reviewed previews because independent human/device QA is not realistically available for the foreseeable release horizon. Packet version 3 keeps the five exact limitations explicit, commit-bound, and non-transferable; production/GA still requires passed QA. [releases/v0.3.0-beta.5-n5-automation-preview.md](releases/v0.3.0-beta.5-n5-automation-preview.md), [release-process.md](release-process.md), [product-exit-criteria.md](product-exit-criteria.md), [../templates/release_qa_evidence_packet.template.json](../templates/release_qa_evidence_packet.template.json), `npm run product:release-qa:evidence`, `npm run product:release-qa:apkg-inspect -- --require-golden` | Keep every unavailable check visible in packet and release labeling; publish only as a GitHub prerelease; never claim production/GA or human/device approval; reconsider if human QA becomes available, an incident occurs, or the release class changes. | 2027-08-01 |
| NLP-001 | Medium | Accepted | Repository owner | NLP/model outputs can influence review focus but must not become certification proof. | On 2026-10-31, NLP doctor, the live pinned embedding evaluation, and NLP governance passed against the exact hash-verified local model and patched Sharp. Model output remains assistive-only, cannot certify cards or write tracked templates, and requires human promotion. No model or authority contract changed. | Keep `nlp:governance-gate` assistive-only and preserve Platinum/Obsidian authority boundaries. | 2026-11-30 |

## Exception Rules

- Exceptions must be narrow, dated, owned, and tied to a concrete verification command or artifact.
- Exceptions must not bypass source-use restrictions, secret handling, branch protection, vulnerability intake, release attestation verification, Platinum review, or Obsidian proof. Manual/device release QA may be deferred only for an explicitly labeled automation-reviewed prerelease under an accepted risk record; production/GA must still pass it.
- Expired exceptions revert to `Open` until reviewed.
- Accepted risks must be reconsidered after any incident, dependency change, release workflow change, or new public-facing claim.

## Verification

Run after changing this register:

```bash
git status --short --untracked-files=all
npm run security:github-settings
npm run security:github-settings:auth
npm run supply-chain:audit
npm run security:branch-protection
npm run security:licenses
npm run security:secrets
npm run lint
npm test
```

`security:github-settings:auth` may fail while SEC-P0 records remain open. That failure is evidence, not a pass.

## Update Triggers

Update this register when:

- a live hosted GitHub setting changes
- a risk is mitigated, accepted, reopened, or becomes overdue
- a dependency exception, workflow permission exception, source-use exception, or release blocker changes
- incident response, post-incident review, or recovery work creates a new residual risk
- dependency-license policy automation changes the risk posture
