# Recovery And Rollback Runbook

## Purpose

This runbook defines how to recover from a bad release, unsafe generated artifact, compromised dependency, broken local runtime, corrupted ignored output, or source-input mistake.

It keeps recovery actions traceable and separates tracked repository truth from ignored local/generated state.

## Scope

Covered:

- tagged release bundle recovery
- release artifact checksum, SBOM, and attestation verification
- bad generated TSV, APKG, media, and report outputs
- compromised or vulnerable dependency changes
- source-input and source-evidence mistakes
- VOICEVOX/Docker local runtime recovery
- ignored local `out/`, `data/`, and `downloads/` recovery boundaries

Not covered:

- GitHub account recovery
- npm account recovery
- Anki application rollback
- recreation of private local datasets that were never pinned or documented

## Authority Boundary

This runbook does not approve destructive git operations, force pushes, tag rewrites, or deletion of user/local data. Get explicit owner approval before destructive cleanup or remote history changes.

A rollback is not a release-ready claim. After recovery, rerun the affected gates and document what was verified.

## First Response

Before changing files:

```bash
git status --short --untracked-files=all
git log -5 --oneline
npm run security:github-settings:auth
```

Capture:

- failing command or report
- affected commit, tag, artifact, deck level, source lane, or dependency
- whether the failure is tracked-source, ignored local data, generated output, hosted setting, or manual QA
- whether users may already have consumed an artifact or claim
- whether incident response is required under [incident-response.md](incident-response.md)

## Release Artifact Recovery

Use this when a tagged release artifact, checksum, SBOM, or attestation is wrong or unverifiable.

1. Stop distribution claims for the affected tag.
2. Preserve the failed artifact, checksum output, attestation output, workflow URL, and commit SHA privately.
3. Do not move or recreate the tag unless the owner explicitly approves a documented emergency action.
4. Fix through a normal commit and create a new superseding tag.
5. Update [../CHANGELOG.md](../CHANGELOG.md) and [release-process.md](release-process.md) if release behavior or known limitations changed.

Verification commands:

```bash
npm run supply-chain:audit
npm run security:advisories
npm run security:branch-protection
npm run security:licenses
npm run security:secrets
npm run security:sbom
npm test
npm run release:gate
```

After the release workflow publishes artifacts, verify downloaded files:

```bash
sha256sum -c release-artifacts.sha256
gh attestation verify <artifact-path> --repo JeremiahM18/japanese-kanji-anki-builder
```

On Windows without `sha256sum`, use PowerShell `Get-FileHash -Algorithm SHA256 <artifact-path>` and compare each value to `release-artifacts.sha256`.

If `gh` is unavailable, record that attestation verification is blocked and keep the release untrusted until verification is completed elsewhere.

## Bad Deck Artifact Recovery

Use this when generated TSV, APKG, media, or release-gate output is incorrect.

1. Identify whether the defect came from tracked templates/code, ignored local data, media source, or packaging.
2. Do not edit generated artifacts by hand to make tests pass.
3. Fix the tracked source, importer, exporter, media manifest, or review contract that owns the defect.
4. Rebuild artifacts through governed commands.
5. Keep manual QA evidence separate from automated gate output.

Relevant commands:

```bash
npm run lint
npm run typecheck
npm test
npm run ci:smoke
npm run release:gate
npm run deck:ready -- --levels=<level>
npm run product:artifacts:kanji:release-qa
```

For card content defects, rerun the applicable Gold, Platinum, Obsidian, source, audio, stroke-order, accessibility, and product gates from [verification.md](verification.md). Do not use green package output as proof that real card data was rereviewed.

## Dependency Recovery

Use this when a dependency update, advisory, lockfile drift, or install-script change breaks trust.

1. Confirm the dependency change from `git diff package.json package-lock.json`.
2. Run:

```bash
npm run supply-chain:audit
npm run security:advisories
npm run security:licenses
npm run security:sbom
```

3. If the dependency is unsafe, revert or replace it through a focused commit. Do not hand-edit `node_modules`.
4. If a lifecycle-script or dependency-license exception is still needed, update [supply-chain-security.md](supply-chain-security.md), [../templates/dependency_license_policy.json](../templates/dependency_license_policy.json), tests, and [risk-register.md](risk-register.md) with a specific reason.
5. Re-run lint, typecheck, tests, supply-chain, license, advisory, and SBOM gates.

## Source-Input Recovery

Use this when source evidence, source worksheets, source access, OCR, or generated source contracts are wrong.

1. Pause promotion from the affected source lane.
2. Identify whether the bad data is tracked evidence, ignored local worksheet data, generated normalized input, or a source-access assumption.
3. Run the relevant preflight in dry-run mode before writing:

```bash
npm run data:audit:jlpt:source-inputs -- --source=<source-id> --strict
npm run data:import:jlpt:source-input -- --source=<source-id>
npm run data:audit:jlpt:sources -- --governance-strict --limit=25
```

4. Correct tracked pins, source-input config, assignment evidence, or reviewer status only with permitted minimal evidence.
5. Do not copy restricted source lists or passages into tracked files.
6. Re-run source audits and affected deck gates before resuming review.

## Local Runtime Recovery

Use this when local server, Docker, VOICEVOX, media sync, or local generated output is stale or broken.

VOICEVOX:

```bash
npm run voicevox:status
npm run doctor:voicevox
npm run voicevox:start
```

If the helper reports stale container shape, use the governed recreate command rather than manual Docker edits:

```bash
npm run voicevox:start:fresh
npm run doctor:voicevox
```

Local generated outputs:

- Treat `out/` as generated and ignored.
- Prefer regenerating through the owning npm command.
- Do not commit generated recovery artifacts unless a tracked contract explicitly requires them.
- Do not recursively delete broad paths without confirming the absolute target is inside the intended generated-output directory.

## Git Recovery

Use focused commits for recovery. Prefer forward fixes over rewriting history.

Allowed normal flow:

```bash
git status --short --untracked-files=all
git log -5 --oneline
git diff
```

Then fix, verify, stage, and commit.

Avoid:

- `git reset --hard`
- `git checkout -- <path>` on user changes
- force pushes
- moving or deleting tags
- deleting ignored local data without explicit owner approval

## Recovery Exit Criteria

Recovery is complete only when:

- affected risk-register records are updated
- affected docs and changelog are updated when user-facing or release-facing behavior changed
- all relevant automated gates are rerun
- expected failures are named as blockers, not hidden
- manual QA remains separate and recorded when required
- a focused commit records the recovery or mitigation

## Verification For This Runbook

Run after changing this runbook:

```bash
git diff --check
npm run security:secrets
npm run lint
npm test
```

Run the affected recovery commands when the change also modifies release, dependency, source, Docker, deck, or generated-output behavior.

## Update Triggers

Update this runbook when:

- release workflow, release artifact list, checksum, SBOM, dependency-license summary, or attestation behavior changes
- dependency policy, install-script exceptions, or dependency-license exceptions change
- source-input import, source-access, OCR, or source-evidence workflows change
- generated-output cleanup or package boundaries change
- incident response or post-incident review finds a missing recovery step
