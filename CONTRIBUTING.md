# Contributing

## Purpose

This repository is maintained with production-style standards even though it is a personal project. Contributions should favor determinism, readability, testability, and operational clarity over quick patches.

## Core Expectations

- Keep behavior deterministic whenever possible.
- Prefer explicit validation at integration boundaries.
- Treat JSDoc contracts as part of the public engineering surface for shared modules.
- Update `README.md` whenever architecture, workflow, configuration, or operational behavior changes.
- Add or update tests for behavioral changes.
- Keep commits focused and professionally titled.
- Do not merge with failing lint, tests, smoke validation, release gates, or CI.

## Development Workflow

1. Create a focused branch.
2. Make the smallest correct change that fully solves the problem.
3. Update documentation in the same change when behavior or repo process changes.
4. Update JSDoc contracts when shared shapes or return values change.
5. Run validation locally before opening a pull request.
6. Open a pull request with a clear summary, risks, and verification notes.

## Local Validation

Run the standard checks before opening a pull request:

```bash
npm run lint
npm test
npm run ci:smoke
npm run release:gate
npm run build:artifacts -- --levels=5 --limit=1 --skip-media-sync
```

If your change affects corpus or curated data workflows, also run:

```bash
npm run corpus:normalize -- --check
npm run curated:normalize -- --check
npm run corpus:report -- --limit=10
npm run curated:report -- --limit=10
```

If your change affects media workflows, also run:

```bash
npm run media:report -- --limit=10
npm run media:sync -- --level=5 --limit=1
```

## Pull Request Standard

Every pull request should include:

- the problem being solved
- the design or implementation approach
- any operational or dataset impact
- exact verification commands that were run
- follow-up work or known limitations, if any

## Scope Guidance

Good pull requests are:

- focused on one concern
- easy to review end-to-end
- documented when behavior changes
- backed by tests or a clear reason tests were not possible

Avoid mixing unrelated refactors with functional changes unless the refactor is required to make the change safe.

## Data And Media Notes

- Do not commit local datasets unless explicitly intended for repository distribution.
- Do not commit generated media artifacts from local experiments.
- Keep managed media and dataset changes traceable through scripts, manifests, and reports.

## Review Bar

Reviews should prioritize:

- correctness
- regressions
- missing validation
- missing tests
- contract drift between runtime behavior and JSDoc-defined shared shapes
- operational/documentation gaps

Style-only feedback is secondary to behavior, safety, and maintainability.
