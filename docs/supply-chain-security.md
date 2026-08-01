# Supply Chain Security

## Purpose

This document defines the dependency, CI, script, and release-artifact trust boundaries for the repository.

The project remains a JavaScript program. Supply-chain hardening must not become a TypeScript migration or a broad rewrite of working build lanes.

## Scope

Covered: npm dependency and lockfile policy, lifecycle-script review, dependency license policy, SBOM generation, GitHub Actions permissions and pins, CodeQL workflow boundaries, release artifact bundle contents, and supply-chain maintenance cadence.

Not covered: legal advice, private training completion, manual product QA, source-governance source truth, hosted alert closure beyond authenticated audits, or release readiness beyond the named gates.

## Authority Boundary

The tracked source of truth is `package.json`, `package-lock.json`, workflow YAML, [../templates/dependency_license_policy.json](../templates/dependency_license_policy.json), the release workflow, and the audit commands named below. Green supply-chain checks prove supply-chain hygiene only; they do not certify deck content, source truth, hosted attestation proof, APKG import, listening, accessibility, or mobile QA.

## Local audit command

Run:

```bash
npm run supply-chain:audit
```

The command is deterministic and uses only repository files. It checks:

- `package-lock.json` is lockfile version 3 and matches `package.json` name/version.
- all locked packages resolve from `https://registry.npmjs.org/`
- all resolved tarballs carry integrity hashes.
- direct dependencies are lockfile-backed registry dependencies, not git, file, workspace, URL, or npm-alias specs.
- dependency lifecycle scripts match the reviewed allowlist.
- every npm override has an exact tracked entry in [../templates/dependency_security_overrides.json](../templates/dependency_security_overrides.json), including parent/package/version binding, advisory, scope, rationale, validation commands, range compatibility, and a non-overdue next-review date.
- dependency license expressions match the reviewed allowlist or current exception policy.
- GitHub Actions are pinned to reviewed commit SHAs.
- workflows keep top-level permissions to `contents: read`; the tagged release verification and bundle jobs use separately reviewed job-scoped exceptions.
- every workflow job audits supply-chain policy before `npm ci`.
- every workflow `npm ci` step sets `ONNXRUNTIME_NODE_INSTALL=skip` so CI installs the reviewed ONNX CPU runtime package from npm without attempting the Linux CUDA NuGet side-download.
- the release workflow publishes only the governed smoke/gate outputs, release docs, NOTICE, changelog, and checksum manifest.

Run `npm audit --json` separately when an internet-backed advisory check is needed. Advisory data changes over time, so it is not the deterministic repository policy gate.

Run:

```bash
npm run security:advisories
```

This command is the internet-backed advisory gate. CI and tagged release workflows run it after `npm ci`, and the protected-branch baseline requires the advisory job before merge. Pull requests also run GitHub dependency review at `moderate` severity or higher so vulnerable package changes are rejected before they enter `main`.

Run:

```bash
npm run security:licenses
```

This command validates dependency license expressions from `package-lock.json` against [../templates/dependency_license_policy.json](../templates/dependency_license_policy.json). Missing licenses, denied license patterns, unreviewed license expressions, and overdue reviewed exceptions fail closed. The tagged workflow writes the passing summary directly to `.release-bundle/dependency-licenses.json` and includes it in the checksum and attestation set.

Run:

```bash
npm run security:sbom
```

This command builds a deterministic CycloneDX `1.6` SBOM model from `package-lock.json` and validates component count, npm package URLs, dependency graph references, and lockfile-derived hashes without writing an artifact. The tagged workflow writes the same validated model directly to `.release-bundle/sbom.cdx.json` and includes it in the checksum and attestation set.

## Dependency Boundary

`package-lock.json` is the install source of truth. New dependencies should be added intentionally, reviewed as product/runtime or dev-only dependencies, and committed with the lockfile change.

Lifecycle scripts are high-signal supply-chain risk. The current reviewed allowlist is:

| Package | Why allowed |
| --- | --- |
| `fsevents@2.3.3` | Optional macOS file-watcher dependency used by dev tooling. |
| `onnxruntime-node@1.21.0` | Native ONNX runtime used by the assistive Transformers.js embedding lane. |
| `protobufjs@7.6.5` | Transitive protobuf runtime dependency used by the assistive Transformers.js stack. |

Any new or changed lifecycle-script package must be reviewed before the install step is trusted. The audit gate fails until the allowlist is updated with a specific reason.

The current dependency-security overrides are governed in [../templates/dependency_security_overrides.json](../templates/dependency_security_overrides.json):

| Parent | Forced package | Range posture | Security reason | Review |
| --- | --- | --- | --- | --- |
| `@huggingface/transformers@3.8.1` | `sharp@0.35.3` | Outside the parent-declared `^0.34.1` range | Patched resolution for `GHSA-f88m-g3jw-g9cj`; repository use is text-embedding-only and does not invoke image or vision pipelines. | Revalidate the full NLP scope and upstream compatibility by `2026-08-26`. |
| `onnxruntime-node@1.21.0` | `tar@7.5.22` | Inside the parent-declared `^7.0.1` range | Pins a resolution newer than the vulnerable `GHSA-r292-9mhp-454m` range. | Revalidate the NLP scope by `2026-08-26`. |

An unregistered override, version mismatch, parent mismatch, stale lock resolution, missing rationale, or overdue review fails `npm run supply-chain:audit`. The sharp override is a narrow compatibility exception, not permission to use Transformers.js image/vision paths; expanding NLP runtime scope requires removing or re-reviewing that assumption first.

`onnxruntime-node` bundles the CPU runtime needed by the assistive Transformers.js embedding lane. On Linux x64 its postinstall script also attempts to download CUDA provider binaries from NuGet unless told to skip that optional GPU expansion. CI and release workflows set `ONNXRUNTIME_NODE_INSTALL=skip` on `npm ci` so clean runners do not depend on the external CUDA binary host for ordinary verification. This does not remove the package, change the lockfile, bypass lifecycle-script review, or certify NLP output; it only keeps the CI install boundary to the reviewed npm package contents.

Dependency license compliance is governed by [../templates/dependency_license_policy.json](../templates/dependency_license_policy.json). The current allowlist is permissive license expressions already present in the lockfile. The current reviewed exceptions are optional `sharp`/`libvips` binary packages with `LGPL-3.0-or-later` or mixed Apache/LGPL/MIT expressions; each exception has owner, reason, reviewed date, and next-review date. The license gate is not legal advice and does not replace manual NOTICE or attribution review before external release claims.

## Routine Maintenance Snapshot

As of 2026-07-26, the recurring supply-chain maintenance items are:

- Keep the lifecycle-script package allowlist above exact by package and version; any package-lock change that adds, removes, or changes `fsevents`, `onnxruntime-node`, `protobufjs`, or another install-script package must be reviewed before trusting install output.
- Reassess and either remove or revalidate every entry in [../templates/dependency_security_overrides.json](../templates/dependency_security_overrides.json) by its `nextReview` date. Do not update a date without rerunning every recorded validation command.
- Keep reviewed license exceptions in [../templates/dependency_license_policy.json](../templates/dependency_license_policy.json) current by package, reason, owner, `reviewedAt`, and `nextReview`. The current sharp/libvips exception review is due on 2026-08-03.
- Rerun `npm run supply-chain:audit`, `npm run security:licenses`, `npm run security:sbom`, `npm run security:advisories`, and `npm run security:secrets` after dependency, workflow, release-artifact, NOTICE, or policy changes.
- Treat green maintenance checks as supply-chain hygiene only. They do not close hosted alert regressions, source governance, release trust, attestation proof, product QA, or explicit preview limitations.

The NLP dependency stack is assistive-only. It may generate review context, but it must not certify cards, approve source truth, or bypass Gold, Sapphire, Platinum, Obsidian, release, import, listening, or accessibility gates.

## CI Boundary

GitHub Actions workflows use top-level:

```yaml
permissions:
  contents: read
```

Do not add broad write permissions or release-publishing permissions without a separate threat-model update. The tagged release verification job has one job-scoped `contents: write` grant because GitHub requires push-level repository access to query and download a private draft release; that job has no release-upload or publication step. The tagged release bundle job has a separate job-scoped `contents: write` grant plus the only `id-token: write`, `attestations: write`, and `artifact-metadata: write` grants: content write uploads the already verified assets and publishes the existing draft prerelease, while OIDC/attestation writes create Sigstore-backed provenance and SBOM attestations. Top-level permissions remain read-only.

Branch protection policy is tracked in `.github/branch-protection.main.json`. `npm run security:branch-protection` verifies that the policy, docs, and CI job names stay aligned before install and release jobs continue.

Secret prevention has two layers. Enable GitHub secret scanning and push protection in repository settings so secrets are blocked before they enter history. The tracked `npm run security:secrets` gate scans committed files for high-confidence token and private-key patterns and runs before install in CI and release workflows.

Static analysis runs through `.github/workflows/codeql.yml`. It scans JavaScript/TypeScript source and GitHub Actions workflow code with CodeQL extended security and quality queries. The only allowed workflow write permission is `security-events: write` in the CodeQL analysis job so findings can be uploaded to GitHub code scanning.

Release provenance runs through GitHub artifact attestations in `.github/workflows/release.yml`. The workflow first downloads the exact draft packet/APKG inputs, rejects any missing or extra asset, validates hashes and tag/commit/version binding, and independently inspects APKG internals. The bundle job attests every staged file, attaches the generated CycloneDX SBOM, and runs constrained GitHub CLI verification for every file before uploading the final assets and publishing the draft prerelease. Consumers must still verify downloaded checksums and attestations.

External actions are pinned to full commit SHAs resolved from their reviewed major-version tags. To update a pin, verify the new tag target with `git ls-remote`, update `.github/workflows/*.yml`, and rerun `npm run supply-chain:audit`.

Current reviewed action pins:

| Action | Reviewed tag | Commit SHA |
| --- | --- | --- |
| `actions/checkout` | `v6.0.3` | `df4cb1c069e1874edd31b4311f1884172cec0e10` |
| `actions/setup-node` | `v6.4.0` | `48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e` |
| `actions/setup-python` | `v6.2.0` | `a309ff8b426b58ec0e2a45f0f869d46889d02405` |
| `actions/upload-artifact` | `v7.0.1` | `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` |
| `actions/dependency-review-action` | `v5.0.0` | `a1d282b36b6f3519aa1f3fc636f609c47dddb294` |
| `actions/attest` | `v4.1.0` | `59d89421af93a897026c735860bf21b6eb4f7b26` |
| `github/codeql-action/init` | `v4.36.1` | `87557b9c84dde89fdd9b10e88954ac2f4248e463` |
| `github/codeql-action/analyze` | `v4.36.1` | `87557b9c84dde89fdd9b10e88954ac2f4248e463` |

## Script Boundary

`package.json` commands should route behavior through reviewed repository scripts. Do not add direct `curl`, `wget`, `Invoke-WebRequest`, `powershell -Command`, or `cmd /c` fragments to npm scripts. When a command needs network, Docker, Python, or package tooling, put that behavior behind a focused script with argument validation and tests.

## Release Artifact Boundary

The tagged release workflow is a verifier and publisher for one already defined candidate. It does not create content-lane or human/device evidence.

The release bundle may include only:

- exact packet-declared product APKG assets
- `release-qa-evidence.json`
- `.release-bundle/sbom.cdx.json`
- `.release-bundle/dependency-licenses.json`
- `.release-bundle/release-verification-materials.tar.gz`, containing deterministic smoke/release-gate outputs and tracked release documents
- `.release-bundle/release-artifacts.sha256`

The draft input directory must contain exactly the evidence packet and declared APKGs. The final staging directory is checksummed and attested as a closed set. Neither stage may upload ignored local inputs such as `data/`, `downloads/`, `.env`, caches, or `node_modules`. Product claims still require the exact release-class evidence: production/GA requires passed human/device QA, while a labeled automation-reviewed prerelease must disclose the accepted `PROD-REL-001` limitations.

## Verification

Run after changing this document or the dependency/workflow/release-artifact boundary it describes:

```bash
git diff --check
npm run supply-chain:audit
npm run security:advisories
npm run security:licenses
npm run security:sbom
npm run security:secrets
```

Run `npm run security:github-settings:auth` when hosted branch protection, CodeQL, alert visibility, dependency security, or release attestation settings are part of the claim.

## Update Triggers

Update this document when dependencies, lifecycle-script packages, license exceptions, workflow permissions, action pins, CodeQL workflow behavior, release artifact paths, SBOM/license output, checksum behavior, or supply-chain audit rules change.
