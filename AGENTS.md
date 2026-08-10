# Repository Guidance For Codex

## Purpose

Treat this repository as a governed production system for Japanese-learning
content and deterministic Anki artifacts. Protect learner trust, data
authority, review-lane integrity, reproducibility, and release evidence.

This file is durable operating guidance. It routes to the canonical contracts;
it does not replace live schemas, validators, command implementations, tests,
hosted GitHub evidence, or release-specific artifact QA.

## Required Orientation

Before changing a governed surface, read the relevant current sources:

- [README.md](README.md) for product and repository orientation.
- [CONTRIBUTING.md](CONTRIBUTING.md) for branch, PR, and validation standards.
- [docs/review-system-forward-contract.md](docs/review-system-forward-contract.md)
  for program-wide lane authority.
- [docs/review-tier-governance.md](docs/review-tier-governance.md) and
  [docs/platinum-obsidian-review-contract.md](docs/platinum-obsidian-review-contract.md)
  before Silver, Gold, Sapphire, Platinum, or Obsidian work.
- [docs/command-reference.md](docs/command-reference.md) and the live
  `package.json` entry before citing or running a command.
- [docs/verification.md](docs/verification.md) for verification scope.
- [docs/release-process.md](docs/release-process.md) and
  [docs/release-qa-checklist.md](docs/release-qa-checklist.md) for release work.
- [docs/recovery-and-rollback.md](docs/recovery-and-rollback.md) before recovery
  or governed writes.

Read the live schema, validator, service, write path, and tests before
describing or changing their contract. Counts and status prose are snapshots;
rerun the owning command for current evidence.

## Authority Boundaries

- Keep kanji decks and word decks separate. Do not transfer counts, schemas,
  proof, or readiness claims between them.
- Keep Candidate discovery, Silver, Gold, Sapphire, Platinum, Obsidian,
  source governance, NLP support, media, Deck Ready, CI, release trust, and
  human/device release QA as distinct authorities.
- Candidate, source, migration, and triage rows are pre-trust workflow inputs.
  Silver begins only when a learner-facing generated row exists for the scoped
  product. Gold is generated-output regression. Sapphire is structural
  certification. Platinum is current card-surface inspection. Obsidian is
  explicit non-mechanical
  current-version content-certification proof.
- A prior lane never proves a later lane. Platinum is not Obsidian proof.
  Clean CI and Deck Ready are not release readiness.
- Tracked contracts, manifests, and canonical JSONL proof ledgers outrank
  generated reports, ignored `data/` or `out/` files, caches, and vault notes.
- Obsidian vault notes and the Obsidian certification lane are unrelated
  authorities. Never use a vault note as certification evidence.
- NLP and model output are assistive only unless a live validator explicitly
  grants a narrower authority. They cannot approve cards or write proof.

## Change And Git Discipline

- Establish a live baseline with `git status --short --branch`, the current
  commit, branches/worktrees, and remote state when the task depends on them.
- Treat pre-existing changes as user-owned. Inspect the full diff and stage
  explicit paths; do not publish a mixed worktree wholesale.
- Use a focused `worker/` branch. Do not push directly to protected `main`.
- Keep commits intentional and reviewable. Separate unrelated dependency,
  schema/data migration, NLP, transaction, documentation, and release work.
- Use a pull request, hosted required checks, resolved review threads, and the
  repository's permitted merge method. Refresh local `main` and remove merged
  temporary branches only after the merge is verified.
- Do not delete, reset, overwrite, rename, or recursively clean without
  resolving the exact target and proving ownership and scope first.

## Data And Write Safety

- Inspect and dry-run before any governed write.
- Use the repository's transaction, promotion, migration, proof-appender, and
  recovery commands. Do not hand-edit canonical proof or fabricate review
  evidence.
- Preserve exact word identity as `written|reading` and the repository's live
  kanji identity rules.
- Do not treat generated output as tracked source truth or commit ignored
  runtime data accidentally.
- Preserve deterministic ordering, schema validation, source roles, evidence
  lanes, verification limitations, and post-write reconciliation.
- A human/device-review field may be marked passed only from actual review
  evidence. When a live release contract permits an accepted-risk preview,
  record the exact governed limitation and risk ID; never translate automation
  into human evidence or carry the exception into production/GA.

## Verification

Choose the smallest complete set that proves the change, then run the broader
merge gates required by the affected authority.

Baseline engineering checks:

```bash
npm run lint
npm run typecheck
npm test
npm run docs:status-audit
npm run lane:authority:audit
git diff --check
```

Run the applicable declared test scope during iteration:

```bash
npm test -- --scope=<scope>
```

The full suite intentionally exercises real Node, Git, Python, APKG, and other
child-process boundaries. If a restricted Windows runner denies those
processes (for example, `spawnSync EPERM`) or prevents package construction,
preserve the exact nonzero result and rerun the complete, unmodified
`npm test` command on a supported host. Do not add skips, mocks, fallbacks,
weaker assertions, or smaller scopes to make an incapable runner appear green.
The supported-host rerun qualifies the environment failure; it does not erase
the first result, and focused retries never replace the full-suite merge gate.

Dependency, workflow, security, or release-boundary changes also require the
applicable gates from the canonical docs, including:

```bash
npm run supply-chain:audit
npm run security:advisories
npm run security:requirements
npm run security:licenses
npm run security:secrets
npm run security:sbom
npm run ci:smoke
npm run release:gate
```

Lane, deck, source, NLP, media, and release changes require their own owning
commands. Do not substitute the baseline suite for those gates.

## Failure Classification

Never hide a nonzero result or report only a passing retry. Classify it with
evidence as one of:

- expected incomplete backlog;
- blocked prerequisite or external/manual dependency;
- reviewed-row, schema, evidence, or authority failure;
- engineering regression;
- environment-qualified limitation.

Record the exact command, exit status, important counts, retry history, what
the result proves, and what it does not prove.

## Release Rules

- Define one exact release candidate: commit, deck kinds, JLPT levels, and
  exclusions. N5-only, N4-inclusive, and all-level scopes are not equivalent.
- Do not create a release-ready claim from unit tests, lane counts, or a tagged
  workflow alone.
- Release-specific evidence must cover exact APKG bytes and structure,
  managed-media provenance, source posture, checksums, SBOM, provenance, and
  attestations. Production/GA also requires passed native import/rendering,
  mobile, accessibility, listening/naturalness, and visual media evidence.
- A semantic automation-reviewed prerelease may defer only the exact
  human/device limitations allowed by the live packet schema, with owner-
  accepted risk, conspicuous labeling, and no production/GA claim.
- Do not tag while required automated pre-release gates, packet evidence, or
  release-class policy requirements are unresolved.
- Do not close post-tag security requirements until the hosted Release run and
  downloaded artifact verification actually prove them.

## Done Means

Report the exact files changed, commands and outcomes, hosted PR/CI state,
remaining backlog or blockers, and final Git state. Do not claim completion
while a material scope is uninspected, a required check is missing, or a human,
device, accepted-risk, or hosted authority is misrepresented.
