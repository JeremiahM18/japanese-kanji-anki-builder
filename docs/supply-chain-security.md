# Supply Chain Security

This document defines the dependency, CI, script, and release-artifact trust boundaries for the repository.

The project remains a JavaScript program. Supply-chain hardening must not become a TypeScript migration or a broad rewrite of working build lanes.

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
- dependency license expressions match the reviewed allowlist or current exception policy.
- GitHub Actions are pinned to reviewed commit SHAs.
- workflows keep permissions to `contents: read`.
- every workflow job audits supply-chain policy before `npm ci`.
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

This command validates dependency license expressions from `package-lock.json` against [../templates/dependency_license_policy.json](../templates/dependency_license_policy.json). Missing licenses, denied license patterns, unreviewed license expressions, and overdue reviewed exceptions fail closed. Tagged release bundles run `npm run security:licenses:write`, include `out/security/dependency-licenses.json`, and checksum that summary alongside smoke, release-gate, and SBOM outputs.

Run:

```bash
npm run security:sbom
```

This command builds a deterministic CycloneDX `1.6` SBOM model from `package-lock.json` and validates component count, npm package URLs, dependency graph references, and lockfile-derived hashes without writing an artifact. Tagged release bundles run `npm run security:sbom:write`, include `out/security/sbom.cdx.json`, and checksum that SBOM alongside smoke, release-gate, and dependency-license outputs.

## Dependency Boundary

`package-lock.json` is the install source of truth. New dependencies should be added intentionally, reviewed as product/runtime or dev-only dependencies, and committed with the lockfile change.

Lifecycle scripts are high-signal supply-chain risk. The current reviewed allowlist is:

| Package | Why allowed |
| --- | --- |
| `fsevents@2.3.3` | Optional macOS file-watcher dependency used by dev tooling. |
| `onnxruntime-node@1.24.3` | Native ONNX runtime used by the assistive Transformers.js embedding lane. |
| `protobufjs@7.6.0` | Transitive protobuf runtime dependency used by the assistive Transformers.js stack. |
| `sharp@0.34.5` | Native image runtime pulled by the assistive Transformers.js stack. |

Any new or changed lifecycle-script package must be reviewed before the install step is trusted. The audit gate fails until the allowlist is updated with a specific reason.

Dependency license compliance is governed by [../templates/dependency_license_policy.json](../templates/dependency_license_policy.json). The current allowlist is permissive license expressions already present in the lockfile. The current reviewed exceptions are optional `sharp`/`libvips` binary packages with `LGPL-3.0-or-later` or mixed Apache/LGPL/MIT expressions; each exception has owner, reason, reviewed date, and next-review date. The license gate is not legal advice and does not replace manual NOTICE or attribution review before external release claims.

The NLP dependency stack is assistive-only. It may generate review context, but it must not certify cards, approve source truth, or bypass Gold, Platinum, Obsidian, release, import, listening, or accessibility gates.

## CI Boundary

GitHub Actions workflows use top-level:

```yaml
permissions:
  contents: read
```

Do not add `contents: write`, broad write permissions, or release-publishing permissions without a separate threat-model update. `id-token: write`, `attestations: write`, and `artifact-metadata: write` are allowed only in the tagged release bundle job so GitHub artifact attestations can create Sigstore-backed provenance and SBOM attestations for release artifacts.

Branch protection policy is tracked in `.github/branch-protection.main.json`. `npm run security:branch-protection` verifies that the policy, docs, and CI job names stay aligned before install and release jobs continue.

Secret prevention has two layers. Enable GitHub secret scanning and push protection in repository settings so secrets are blocked before they enter history. The tracked `npm run security:secrets` gate scans committed files for high-confidence token and private-key patterns and runs before install in CI and release workflows.

Static analysis runs through `.github/workflows/codeql.yml`. It scans JavaScript/TypeScript source and GitHub Actions workflow code with CodeQL extended security and quality queries. The only allowed workflow write permission is `security-events: write` in the CodeQL analysis job so findings can be uploaded to GitHub code scanning.

Release provenance runs through GitHub artifact attestations in `.github/workflows/release.yml`. The release bundle job attests the uploaded release paths, attaches the generated CycloneDX SBOM as an SBOM attestation, and verifies representative release bundle attestations with the GitHub CLI before upload. Consumers should still verify those attestations with the GitHub CLI before trusting a downloaded release bundle.

External actions are pinned to full commit SHAs resolved from their reviewed major-version tags. To update a pin, verify the new tag target with `git ls-remote`, update `.github/workflows/*.yml`, and rerun `npm run supply-chain:audit`.

Current reviewed action pins:

| Action | Reviewed tag | Commit SHA |
| --- | --- | --- |
| `actions/checkout` | `v4.2.2` | `11bd71901bbe5b1630ceea73d27597364c9af683` |
| `actions/setup-node` | `v4` | `49933ea5288caeca8642d1e84afbd3f7d6820020` |
| `actions/setup-python` | `v5` | `a26af69be951a213d495a4c3e4e4022e16d87065` |
| `actions/upload-artifact` | `v4` | `ea165f8d65b6e75b540449e92b4886f43607fa02` |
| `actions/dependency-review-action` | `v5.0.0` | `a1d282b36b6f3519aa1f3fc636f609c47dddb294` |
| `actions/attest` | `v4.1.0` | `59d89421af93a897026c735860bf21b6eb4f7b26` |
| `github/codeql-action/init` | `v4.36.1` | `87557b9c84dde89fdd9b10e88954ac2f4248e463` |
| `github/codeql-action/analyze` | `v4.36.1` | `87557b9c84dde89fdd9b10e88954ac2f4248e463` |

## Script Boundary

`package.json` commands should route behavior through reviewed repository scripts. Do not add direct `curl`, `wget`, `Invoke-WebRequest`, `powershell -Command`, or `cmd /c` fragments to npm scripts. When a command needs network, Docker, Python, or package tooling, put that behavior behind a focused script with argument validation and tests.

## Release Artifact Boundary

The tagged release workflow is an artifact builder, not proof that public product decks are release-ready.

The release bundle may include only:

- deterministic smoke artifacts from `.release-smoke/out`
- release-gate verification artifacts from `.release-gate/out`
- the generated CycloneDX SBOM at `out/security/sbom.cdx.json`
- the generated dependency-license summary at `out/security/dependency-licenses.json`
- `CHANGELOG.md`
- `NOTICE.md`
- `docs/compatibility-matrix.md`
- `docs/branch-protection.md`
- `docs/release-process.md`
- `docs/release-qa-checklist.md`
- `release-artifacts.sha256`

It must not upload ignored local inputs such as `data/`, `downloads/`, `.env`, or `node_modules`. Product deck readiness still requires the product-specific gates, manual Anki import QA, listening QA, accessibility QA, and current review proof described in the release docs.
