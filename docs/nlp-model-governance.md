# NLP Model Governance

This document defines the future deep NLP boundary for Japanese Kanji Builder.

The current deck pipeline remains contract-driven. NLP models may assist candidate discovery, example reranking, sense-fit audits, duplicate clustering, level-fit audits, and review prioritization. NLP model output is not Gold, Platinum, Obsidian, release readiness, or source truth.

## Current state

The first governed surface is the tracked model registry:

```bash
npm run nlp:models:audit
```

The registry lives at [../templates/nlp_model_manifest.json](../templates/nlp_model_manifest.json). It currently registers candidate runtimes only. No model is active yet.

## Authority boundary

NLP output must stay assistive-only:

- It may create generated review packets, rankings, warnings, and candidate queues.
- It must not write tracked templates directly.
- It must not count as card certification evidence.
- It must not approve Gold, Platinum, Obsidian, or release readiness.
- Human review must promote any accepted suggestion into tracked contracts.

## Activation requirements

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
