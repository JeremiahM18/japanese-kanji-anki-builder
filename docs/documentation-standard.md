# Documentation Standard

## Purpose

This is the repository standard for README, CHANGELOG, and docs work. Use it before changing documentation, release language, status snapshots, workflow runbooks, command references, security notes, or provenance claims.

The goal is not prettier prose. The goal is governed, replayable documentation that lets a future reviewer know what is true, what is local-only, what is generated, what is blocked, and which command proves the claim.

## Scope

This standard applies to tracked repository documentation, including README, CHANGELOG, SECURITY, contribution docs, runbooks, command references, release docs, source-governance docs, security docs, and local-data guidance.

It does not govern private local notes, ignored source worksheets, generated `out/` reports, or external documentation except where tracked docs quote or depend on them.

## Authority Boundary

This file defines the documentation bar. It does not prove that any status claim in another file is current; changed docs still need live command output, tracked manifest evidence, or explicitly historical framing.

## Research Basis

This standard is adapted from public enterprise documentation practices, then narrowed for this repository's Japanese deck-build governance model:

- [Google developer documentation style guide](https://developers.google.com/style) and [Google README guidance](https://google.github.io/styleguide/docguide/READMEs.html): project-specific style first, clear technical docs, accessible/global writing, descriptive links, and README files that explain purpose, status, usage, ownership/contact, and links to deeper docs.
- [Microsoft Writing Style Guide](https://learn.microsoft.com/en-us/style-guide/welcome/) and [Microsoft Learn contributor guidance](https://learn.microsoft.com/en-us/contribute/content/style-quick-start): task-focused writing, concise/scannable sections, everyday language, code examples where useful, and explicit contribution/update process.
- [Apple Style Guide](https://support.apple.com/guide/applestyleguide/welcome/web): consistent voice across documentation, reference material, training, UI text, inclusive language, international style, and technical notation consistency.
- [Oracle Database Release Notes](https://docs.oracle.com/en/database/oracle/oracle-database/19/rnrdm/database-release-notes.pdf): release-grade structure that states audience, accessibility, related resources, conventions, purpose, platform scope, compatibility/security posture, known issues, unsupported products, and late-breaking limitations.

When these sources disagree, follow the local repository standard first. When this standard is silent, follow Google for developer-doc structure, Microsoft for task clarity, Apple for voice/terminology consistency, and Oracle for release-status and known-issue posture.

## Universal Schema

Every changed doc must make these fields clear, either as explicit headings or as obvious local paragraphs:

| Field | Requirement |
| --- | --- |
| Purpose | Say what decision, workflow, product surface, or governance lane the doc supports. |
| Scope | Say which deck kind, JLPT level, artifact, command family, or release surface is covered. |
| Authority boundary | Say what the doc can prove and what it cannot prove. |
| Source of truth | Link to the tracked contract, source file, manifest, workflow, or command that proves the claim. |
| Inputs and outputs | Identify tracked inputs, ignored local inputs, generated outputs, and release artifacts separately. |
| Verification | Give exact commands or tests required for the claims in the doc. |
| Failure semantics | Classify expected backlog failures separately from blockers and regressions. |
| Update trigger | Say when the doc must change, especially when live counts, commands, gates, or source contracts change. |

Do not hide a missing field behind broad language like "verified" or "ready." If the doc cannot state the field, it must state the limitation.

## README Schema

The top-level README is an orientation and routing document. It must remain useful to a first-time technical reviewer without becoming the only source of truth.

Required README sections:

- Product identity and one-command first action.
- Scope and local-only security posture.
- Review lanes before current status snapshots, routed through [review-system-forward-contract.md](review-system-forward-contract.md) and summarized by [review-tier-governance.md](review-tier-governance.md).
- Current baseline with a warning that live commands control release decisions.
- Separate kanji, word, source-governance, NLP, media, release, and local-data boundaries.
- Source-of-truth table for tracked contracts and governance files.
- Verification and release section with exact command families.
- Documentation map that points to this standard and the deeper runbooks.

README status counts are allowed only when they are orientation snapshots from recent live command output. They must not be framed as release decisions unless the release gates and manual QA evidence also pass.

## Workflow Document Schema

Workflow docs and runbooks must be executable by a careful reviewer.

Required workflow fields:

- Starting state checks, including `git status --short --untracked-files=all` when the workflow mutates tracked files.
- Queue or selector commands when work should not be hand-picked.
- The exact files or artifacts the workflow is allowed to change.
- The exact files or artifacts the workflow must not change.
- Focused per-batch gates.
- Final verification bundle.
- Expected-failure classification.
- Commit and no-push posture when relevant.

Workflow docs must keep human-review steps separate from automated gates. NLP, generated TSVs, Gold fixtures, local databases, Deck Ready output, Sapphire structural gates, Platinum, and green tests must never be documented as substitutes for Obsidian proof, source truth, legal permission, media QA, or release readiness.

## Command And Reference Schema

Command/reference docs must describe command behavior, not just list scripts.

For each command family, document:

- Purpose.
- Required inputs.
- Whether ignored local `data/*`, `downloads/*`, or `out/*` are read.
- Whether tracked files are written.
- Whether generated artifacts are written.
- CI-safe versus local-data-only scope.
- Expected failure modes and what they mean.
- Related tests or parity gates.

If a command is a diagnostic, the doc must say it does not mutate contracts or certify readiness. If a command is fail-closed, the doc must say which backlog failures are expected and which failures are blockers.

## Status And Count Claim Rule

Counts, status labels, and readiness language are high-risk claims.

Rules:

- A status/count claim must come from a named live command, tracked manifest, or generated report that was inspected during the work.
- The doc must preserve lane separation: candidate pre-trust queues, Silver generated surface, Gold regression, Sapphire structural certification, Platinum, Obsidian proof, NLP support, JLPT placement evidence, card-field verification, media provenance, tracked-source artifacts, Deck Ready mechanical artifact readiness, release readiness, and manual QA are separate lanes.
- Generated/local artifacts can support inspection, but they are not tracked truth unless a tracked contract explicitly names them as promoted evidence.
- If a count is stale or cannot be verified, remove it or label it as historical/orientation-only.
- Do not turn an expected fail-closed backlog into an error-free status claim.
- When a committed change updates review counts, proof posture, readiness posture, or gate expectations, update every affected README, doc, and CHANGELOG status claim in the same commit.

## Security And Release Schema

Security, supply-chain, and release docs must keep local development, CI, generated artifacts, and public release boundaries separate.

Required fields:

- Threat model and trust boundary.
- Dependency/supply-chain gate.
- Workflow permission posture.
- Release artifact boundary.
- Ignored local data threat model.
- Network, Docker, model-runtime, or external-tool status when inspected.
- Known limitations and manual QA requirements.

Release docs must not claim APKG, mobile, accessibility, listening, managed media, or manual import readiness from green unit tests alone.

## Legal And Provenance Schema

Docs that mention external sources must classify source use:

- Tracked-derived-safe sources.
- Manual-citation-only sources.
- Restricted or blocked sources.
- Occurrence/background/frequency sources that do not vote in placement.
- Generated/local artifacts that cannot become source evidence.

Do not copy restricted source lists or passages into tracked docs. Store only permitted citations, reviewer judgments, governed identifiers, and minimal evidence references when the source lane allows that shape.

## Update Protocol

Before editing docs:

1. Run or inspect `git status --short --untracked-files=all`.
2. Inspect the affected docs with `rg` for stale claim language, counts, commands, and lane names.
3. Verify the command, manifest, or source file that proves the doc change.
4. Research external standards only when this file is insufficient; if the finding becomes durable, update this file instead of relying on memory.

After editing docs:

1. Re-run the focused docs/governance test.
2. Check Markdown local links.
3. Run relevant command or parity gates for any status or command claim changed.
4. Run `git diff --check`.
5. Keep documentation commits focused and avoid mixing unrelated generated artifacts.
6. Keep CHANGELOG release-facing and concise; do not turn it into a per-card or per-batch review log.

## Verification

Run after changing this standard:

```bash
git diff --check
npm run security:requirements
npm run security:sdlc-metrics
```

Run the affected docs, security, release, source, or product gates when this standard changes their required wording, command expectations, or authority boundaries.

## Update Triggers

Update this standard when README requirements, documentation authority boundaries, release/status claim rules, command-reference rules, legal/provenance handling, security/release documentation requirements, or documentation verification expectations change.

## No-Go Rules

- Do not make release-ready claims without release gates and manual QA evidence.
- Do not collapse kanji and word status.
- Do not collapse Sapphire, Platinum, and Obsidian status.
- Do not use NLP as certification.
- Do not use generated TSV, APKG output, SQLite mirrors, or local ignored files as tracked source truth.
- Do not document "clean CI" as proof that local generated rows, Docker, VOICEVOX, APKG import, or mobile behavior were validated.
- Do not preserve stale counts just because they were already in README.
- Do not use memory, old assistant summaries, or old docs as current evidence without live verification.

## Review Checklist

Use this checklist when documentation changes are part of a release-quality task:

- The doc names its purpose and scope.
- The doc separates source-governance, card-field, generated/local, candidate queues, NLP support, media, Sapphire structural, Platinum, Obsidian, Deck Ready, and release lanes.
- All count/status claims have a live command or tracked manifest behind them.
- Commands include exact arguments when those arguments matter.
- Expected failures are classified.
- Local-data-only gates are not represented as CI gates.
- Legal/source-use posture is preserved for restricted sources.
- Security boundaries are preserved for local servers, Docker, generated outputs, dependencies, workflows, and release artifacts.
- README links to the deeper docs rather than duplicating every detail.
- CHANGELOG captures release-facing posture changes without becoming a batch log.
- The final diff is small enough for a future reviewer to audit without guessing.
