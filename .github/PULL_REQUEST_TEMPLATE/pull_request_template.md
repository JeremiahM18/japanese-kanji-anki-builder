## Summary

- 

## Why This Change

- 

## Implementation Notes

- 

## Verification

```bash
# paste exact commands run
```

## Risks

- 

## Docs Updated

- [ ] `README.md` updated when behavior, architecture, configuration, or process changed
- [ ] Additional docs updated when needed
- [ ] `CHANGELOG.md` updated when the change affects a release milestone or tagged artifact contract

## Checklist

- [ ] Scope is focused and reviewable
- [ ] Tests added or updated when behavior changed
- [ ] Lint, typecheck, and tests pass locally
- [ ] `supply-chain:audit` run when dependency manifests, npm scripts, workflows, or release artifact boundaries changed
- [ ] `security:advisories` run when dependency manifests or lockfiles changed
- [ ] `security:branch-protection` run when CI job names, required checks, branch policy, or protected-branch docs changed
- [ ] `security:requirements` run when security requirements, risk records, runbooks, release blockers, workflows, or verification commands changed
- [ ] `security:secrets` run when configuration, scripts, fixtures, docs, or workflows could introduce credentials
- [ ] `security:sbom` run when dependency manifests, lockfiles, release-bundle paths, or supply-chain workflows changed
- [ ] CodeQL is expected to pass when source code or GitHub Actions workflows changed
- [ ] Release provenance and SBOM attestations are expected when tagged release-bundle workflow paths changed
- [ ] CI is expected to pass
- [ ] `data:audit:jlpt`, read-only `data:audit:jlpt:sources -- --governance-strict --limit=25`, and relevant strict `data:audit:jlpt:source-inputs -- --source=<source-id> --strict` run when JLPT taxonomy, source-evidence inputs, starter curation, golden review placement, or deck-membership logic changed
- [ ] `nlp:governance-gate` run when assistive NLP manifests, runtimes, artifact contracts, or governance docs changed
- [ ] Source-evidence imports dry-run `data:import:jlpt:source-input -- --source=<source-id>` before any `--write`
- [ ] `release:gate` run when packaging, CI, or toolchain behavior changed
- [ ] CODEOWNERS review requested when touching protected paths
