## Summary

- 

## Scope And Authority

- Change type: <!-- code / data layout / deck content / docs / CI / security / release -->
- Affected surfaces: <!-- files, scripts, decks, docs, workflows -->
- Certification/proof impact: <!-- none / read-only status / proof ledger changed / deck content changed -->
- Lane boundaries preserved: <!-- source evidence, generated checks, review evidence, media identity, NLP support, proof ledger -->

## Implementation Notes

- 

## Verification

Paste exact commands and classify each result as pass, fail, expected fail, skipped, or not applicable.

```bash
# exact commands run
```

## Generated Output And Counts

- Generated files changed: <!-- yes/no; list paths or explain ignored output only -->
- Deck/card counts changed: <!-- yes/no; include before/after if yes -->
- Proof ledgers changed: <!-- yes/no; list files if yes -->
- Local overlay or ignored data used: <!-- yes/no; include resolved path and stale/clean status when relevant -->

## Risks And Limits

- Known risks:
- Not verified:
- Follow-up work:

## Docs Updated

- [ ] `README.md` updated when behavior, architecture, configuration, or process changed
- [ ] Additional docs updated when needed
- [ ] `CHANGELOG.md` updated when the change affects a release milestone or tagged artifact contract

## Required Checklist

- [ ] Scope is focused and reviewable
- [ ] Tests added or updated when behavior changed
- [ ] Lint, typecheck, and tests pass locally, or exceptions are documented above
- [ ] No hidden card-content, generated-output, or proof-ledger changes are included
- [ ] CODEOWNERS-covered paths checked against the current single-maintainer policy
- [ ] CI is expected to pass

## Conditional Checks

- [ ] `supply-chain:audit` run when dependency manifests, npm scripts, workflows, or release artifact boundaries changed
- [ ] `security:advisories` run when dependency manifests or lockfiles changed
- [ ] `security:branch-protection` run when CI job names, required checks, branch policy, or protected-branch docs changed
- [ ] `security:licenses` run when dependency manifests, lockfiles, dependency-license policy, release-bundle paths, or supply-chain workflows changed
- [ ] `security:requirements` run when security requirements, risk records, runbooks, release blockers, workflows, or verification commands changed
- [ ] `security:sdlc-metrics` run when training checklist, SDLC metrics, risk register, security requirements, workflows, or security governance docs changed
- [ ] `security:secrets` run when configuration, scripts, fixtures, docs, or workflows could introduce credentials
- [ ] `security:sbom` run when dependency manifests, lockfiles, release-bundle paths, or supply-chain workflows changed
- [ ] CodeQL is expected to pass when source code or GitHub Actions workflows changed
- [ ] Release provenance and SBOM attestations are expected when tagged release-bundle workflow paths changed
- [ ] `data:audit:jlpt`, read-only `data:audit:jlpt:sources -- --governance-strict --limit=25`, and relevant strict `data:audit:jlpt:source-inputs -- --source=<source-id> --strict` run when JLPT taxonomy, source-evidence inputs, starter curation, golden review placement, or deck-membership logic changed
- [ ] `nlp:governance-gate` run when assistive NLP manifests, runtimes, artifact contracts, or governance docs changed
- [ ] Source-evidence imports dry-run `data:import:jlpt:source-input -- --source=<source-id>` before any `--write`
- [ ] `release:gate` run when packaging, CI, or toolchain behavior changed
