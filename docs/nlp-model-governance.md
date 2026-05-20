# NLP Model Governance

This document defines the future deep NLP boundary for Japanese Kanji Builder.

The current deck pipeline remains contract-driven. NLP models may assist candidate discovery, example reranking, sense-fit audits, duplicate clustering, level-fit audits, and review prioritization. NLP model output is not Gold, Platinum, Obsidian, release readiness, or source truth.

## Current state

The first governed surface is the tracked model registry:

```bash
npm run nlp:models:audit
```

The registry lives at [../templates/nlp_model_manifest.json](../templates/nlp_model_manifest.json). It currently has one active runtime, `kuromoji-js`, for local morphological tokenization. No model is active yet.

The second governed surface is the suggestion artifact validator:

```bash
npm run nlp:suggestions:validate
```

By default it validates JSON artifacts under `out/nlp-suggestions/`. A missing directory is treated as an empty suggestion lane. Non-empty suggestion artifacts must bind to an active model in the manifest, use an allowed assistive lane, include pinned input hashes, carry per-suggestion evidence and limitations, and repeat the human-promotion boundary on each suggestion.

The first capability lane is governed tokenization:

```bash
npm run nlp:tokenization:validate
```

By default it validates JSON artifacts under `out/nlp-tokenization/`. A missing directory is treated as an empty tokenizer lane. Non-empty tokenization artifacts must bind to an active runtime in the manifest, use a runtime that allows `tokenization`, carry pinned input hashes, preserve contiguous token spans over the input text, and bind word-card targets by exact written plus reading identity.

The third governed surface is runtime readiness:

```bash
npm run nlp:doctor
```

This preflight compares the manifest against the local workspace. Registered JavaScript runtimes may be missing until they are selected, but active JavaScript runtimes must be declared in `package.json`, pinned in `package-lock.json`, resolvable from the workspace, and matched to installed package metadata. Active tokenization runtimes must also pin dictionary file count, byte size, and SHA-256 evidence. Active external workers must declare a local worker path. Active model artifacts must exist and match their tracked byte size and SHA-256 pins. Passing runtime readiness does not activate card-certification authority.

The aggregate gate for CI and release preflight is:

```bash
npm run nlp:governance-gate
```

It runs the model manifest audit, tokenization artifact validator, suggestion artifact validator, and runtime doctor together. It fails closed when any sub-check fails, while still reporting that NLP gates do not certify cards, write tracked templates, or claim release readiness.

## Authority boundary

NLP output must stay assistive-only:

- It may create generated review packets, rankings, warnings, and candidate queues.
- It must not write tracked templates directly.
- It must not count as card certification evidence.
- It must not approve Gold, Platinum, Obsidian, or release readiness.
- Human review must promote any accepted suggestion into tracked contracts.

## Activation requirements

Before a runtime can become active, the manifest must track:

- runtime id and task compatibility
- package or worker boundary
- exact package version and package-lock integrity for JavaScript runtimes
- license/use approval
- tokenizer dictionary path, file count, byte size, and SHA-256 when the runtime performs tokenization

Before a model can become active, the manifest must track:

- runtime id and task compatibility
- package or worker boundary
- license/use approval
- model artifact path, SHA-256, and byte size
- deterministic input and runtime policy
- evaluation benchmark path and metrics
- known limitations
- explicit assistive uses

Active models must use `outputAuthority: "assistive_only"` and `promotionPolicy: "human_review_required"`.

## Planned architecture

Future NLP work should be layered in this order:

1. Tokenization and corpus enrichment.
2. Embedding or reranking artifact generation.
3. Suggestion artifact schema validation.
4. Example reranking for word cards.
5. Sense-fit and translation-alignment warnings.
6. Candidate discovery for reading-gap and expansion queues.
7. Review packet generation for human promotion.

Generated NLP artifacts should live under ignored output paths such as `out/nlp-suggestions/`. Tracked templates should change only through reviewed promotion commits.
