# NLP Model Governance

This document defines the governed deep NLP boundary for Japanese Kanji Builder.

The current deck pipeline remains contract-driven. NLP models may assist candidate discovery, example reranking, sense-fit audits, duplicate clustering, level-fit audits, review prioritization, and draft-proposal scaffolding. NLP model output is not Gold, Platinum, Obsidian, release readiness, or source truth.

## Current state

The first governed surface is the tracked model registry:

```bash
npm run nlp:models:audit
```

The registry lives at [../templates/nlp_model_manifest.json](../templates/nlp_model_manifest.json). It currently has two active runtimes: `kuromoji-js` for local morphological tokenization and `transformers-js` for local model inference. It has one active embedding model, `paraphrase-multilingual-minilm-l12-v2-q8`, backed by the local ignored cache path recorded in the manifest. Model output remains assistive-only.

The governed model-backed artifact surface starts with suggestion validation:

```bash
npm run deck:words:expansion-support -- --levels=5,4,3,2,1
npm run deck:kanji:nlp-signals -- --levels=5,4
npm run nlp:examples:rerank -- --level=5
npm run nlp:sense-fit:audit -- --level=5
npm run nlp:reading-gaps:discover -- --level=5 --include-deferred
npm run nlp:suggestions:validate
npm run nlp:review-packets:generate -- --level=5
npm run nlp:review-packets:validate
npm run nlp:drafts:generate -- --level=5
npm run nlp:drafts:validate
```

`deck:words:expansion-support` is the word expansion integration surface. It runs the governed NLP support stack for every selected N level: model/runtime checks, tokenization, embeddings, example reranking, sense-fit warnings, reading-gap candidate discovery, human review packets, draft proposals, artifact validation, and the aggregate NLP governance gate. The level-specific aliases `deck:words:expansion-support:n5` through `deck:words:expansion-support:n1` are the default way to attach NLP evidence to word expansion review without treating NLP as certification.

`deck:kanji:nlp-signals` is the separate kanji-card signal surface. It refreshes generated kanji TSVs, tokenizes the bare kanji-card anchors with the active tokenizer, audits tokenizer/card-reading signals, and writes kanji-scoped review packets plus tokenization-only draft notes. It does not run word expansion, word reading-gap discovery, word example reranking, word sense-fit audits, or word-card embeddings.

The example reranker reads generated word rows, the local sentence corpus, and validated word-card embedding artifacts, then emits ranked review suggestions under `out/nlp-suggestions/`. The sense-fit audit reads generated word rows and validated word-card embeddings, compares meaning-focused and example-focused embedding views, and emits warning suggestions for possible meaning/example/translation alignment risks. The reading-gap discovery command reads the governed word reading-gap plan, optionally including explicitly deferred gaps, and emits candidate suggestions without changing any gap disposition. Sentence support in this lane is reading-bound: a corpus row only boosts a candidate when the row reading contains the candidate reading, so rare alternate readings cannot borrow evidence from common same-written rows. By default the suggestion validator checks JSON artifacts under `out/nlp-suggestions/`. A missing directory is treated as an empty suggestion lane. Non-empty suggestion artifacts must bind to an active model in the manifest, use an allowed assistive lane, include pinned input hashes, carry per-suggestion evidence and limitations, and repeat the human-promotion boundary on each suggestion.

The human review packet generator aggregates validated suggestion artifacts and tokenization audit signals into ignored JSON and Markdown packets under `out/nlp-review-packets/`. Packets are a review convenience layer only: they point humans to exact targets, signal summaries, evidence digests, limitations, and checklist items, but they do not promote data, certify cards, or claim readiness.

The draft-proposal generator reads validated model-backed suggestion artifacts and validated human review packets, then writes ignored JSON and Markdown draft packets under `out/nlp-drafts/`. These drafts can scaffold candidate fields and review notes for humans, but they are not free-form generative truth: model-backed draft kinds must declare active manifest-authorized source model IDs, preserve suggestion/source evidence refs, carry blockers and promotion checklists, and keep the no-certification/no-template-write/no-readiness boundary. Tokenization-only draft notes are allowed as review scaffolds, but they do not count as model-backed evidence.

The first capability lane is governed tokenization:

```bash
npm run nlp:tokenization:generate -- --level=5
npm run nlp:tokenization:generate -- --deck=kanji --level=5
npm run nlp:tokenization:validate
npm run nlp:tokenization:audit
```

The generator reads the generated word TSV by default, tokenizes each written word-card surface with the active `kuromoji-js` runtime, and writes an ignored JSON artifact under `out/nlp-tokenization/`. With `--deck=kanji`, it reads the generated kanji TSV and tokenizes the bare kanji-card anchor. The validator treats a missing directory as an empty tokenizer lane. Non-empty tokenization artifacts must bind to an active runtime in the manifest, use a runtime that allows `tokenization`, carry pinned input hashes, preserve contiguous token spans over the input text, bind word-card targets by exact written plus reading identity, and bind kanji-card targets to the generated kanji row. The audit command converts validated tokenization artifacts into assistive review-packet signals such as multi-token surfaces, unknown tokens, missing token readings, and token/card reading mismatches.

The embedding artifact surface is:

```bash
npm run nlp:embeddings:evaluate
npm run nlp:embeddings:generate -- --level=5
npm run nlp:embeddings:validate
```

The evaluation command re-runs the tracked Japanese semantic-similarity smoke benchmark at [../templates/nlp_embedding_model_benchmark.json](../templates/nlp_embedding_model_benchmark.json) against the active local embedding model. It is a runtime/model wiring and coarse-separation check only, not production model-quality proof or card certification evidence. The generator reads generated word TSV rows, builds exact written-reading-bound embedding inputs from word, reading, meaning, example sentence, and notes, and writes ignored artifacts under `out/nlp-embeddings/`. By default the validator checks JSON artifacts under that directory. A missing directory is treated as an empty embedding lane. Non-empty embedding artifacts must bind to an active model in the manifest whose task is `embedding`, use an allowed assistive lane, carry pinned input hashes, include model evidence and deterministic policy, bind word-like targets by exact written plus reading identity, and keep every vector length aligned with the declared embedding dimension. This validates embedding outputs only.

The runtime governed surface is runtime readiness:

```bash
npm run nlp:doctor
```

This preflight compares the manifest against the local workspace. Registered JavaScript runtimes may be missing until they are selected, but active JavaScript runtimes must be declared in `package.json`, pinned in `package-lock.json`, resolvable from the workspace, and matched to installed package metadata. Active tokenization runtimes must also pin dictionary file count, byte size, and SHA-256 evidence. Active external workers must declare a local worker path. Active model artifacts must exist and match their tracked byte size and SHA-256 pins. Passing runtime readiness does not activate card-certification authority.

The aggregate gate for CI and release preflight is:

```bash
npm run nlp:governance-gate
```

It runs the model manifest audit, tokenization artifact validator, tokenization audit signal report, embedding artifact validator, suggestion artifact validator, review packet validator, draft-proposal validator, and runtime doctor together. It fails closed when any sub-check fails, while still reporting that NLP gates do not certify cards, write tracked templates, or claim release readiness.

## Authority boundary

NLP output must stay assistive-only:

- It may create generated review packets, rankings, warnings, candidate queues, and draft-proposal scaffolds.
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
- model artifact path, artifact kind (`file` or `directory`), SHA-256, and byte size
- file count for directory model bundles
- embedding dimension, pooling, normalization, distance metric, and dtype for embedding models
- deterministic input and runtime policy
- evaluation benchmark path and metrics
- known limitations
- explicit assistive uses

Active models must use `outputAuthority: "assistive_only"` and `promotionPolicy: "human_review_required"`.

## Active architecture

NLP work is layered in this order:

1. Tokenization and corpus enrichment; kanji-card tokenization is a separate kanji review lane, while word tokenization feeds word expansion.
2. Embedding artifact validation, then model-pinned embedding generation.
3. Example reranking for word cards.
4. Sense-fit and translation-alignment warnings.
5. Candidate discovery for reading-gap and expansion queues.
6. Human review packet generation for promotion decisions.
7. Draft-proposal scaffolding from validated suggestions and review packets.

Generated NLP artifacts should live under ignored output paths such as `out/nlp-tokenization/`, `out/nlp-embeddings/`, `out/nlp-suggestions/`, `out/nlp-review-packets/`, and `out/nlp-drafts/`. Tracked templates should change only through reviewed promotion commits.
