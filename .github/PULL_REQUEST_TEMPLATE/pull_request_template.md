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
- [ ] Lint and tests pass locally
- [ ] CI is expected to pass
- [ ] `data:audit:jlpt`, read-only `data:audit:jlpt:sources -- --limit=25`, and relevant `data:audit:jlpt:source-inputs -- --source=<source-id>` run when JLPT taxonomy, source-evidence inputs, starter curation, golden review placement, or deck-membership logic changed
- [ ] `release:gate` run when packaging, CI, or toolchain behavior changed
- [ ] CODEOWNERS review requested when touching protected paths
