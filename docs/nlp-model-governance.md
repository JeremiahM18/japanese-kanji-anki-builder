# NLP Model Governance

This document defines the governed deep NLP boundary for Japanese Kanji Builder.

The current deck pipeline remains contract-driven. NLP is not a new certification path. It is a governed review-amplification layer between generated card output and human promotion. NLP models may assist candidate discovery, example reranking, sense-fit audits, duplicate clustering, level-fit audits, review prioritization, and draft-proposal scaffolding. NLP model output is not Gold, Sapphire, Platinum, Obsidian, Deck Ready, release readiness, or source truth.

## Obsidian workflow with NLP present

A clean NLP packet is not Obsidian. A passing NLP gate is not Obsidian. A draft proposal is not Obsidian.

Obsidian means the current non-human governed native/fluent-quality rereview used the live generated card plus tracked evidence, considered any NLP signals as support context, fixed any real issue, and recorded structured non-mechanical rereview proof. For words, that proof must bind exact written+reading identity and include the full word-card checklist. For kanji, that proof must bind the card identity and include actual example-sentence quality review evidence. Future human/native review records human-reviewed provenance for the same standard; it is not a different content standard.

### Word decks

1. Generate live word rows with the normal word deck build for the target levels.
2. Run `npm run deck:words:expansion-support -- --levels=<levels>`.
3. Use the generated review packets to inspect exact word-reading targets, tokenizer issues, example alternatives, sense-fit risks, reading-gap candidates, and draft notes.
4. Inspect the actual generated row and tracked evidence. If an NLP signal exposes a real issue, fix tracked source/card data first.
5. Regenerate, rerun relevant gates, and rerun NLP if the affected support artifact changed.
6. Add Obsidian proof only after the live word card has actually been rereviewed.
7. Check certification with `npm run deck:words:obsidian:rereview-status -- --levels=<levels>` and `npm run deck:words:obsidian:certify-status -- --levels=<levels>`.

`deck:words:expansion-support` is broad and model-backed. It runs model/runtime checks, a cache-aware embedding smoke gate, tokenization, embeddings, example reranking, sense-fit warnings, reading-gap candidate discovery, review packets, draft proposals, artifact validation, and `nlp:governance-gate`.

### Kanji decks

1. Generate or refresh the kanji TSV with the normal kanji build for the target levels.
2. Run `npm run deck:kanji:nlp-signals -- --levels=<levels>`.
3. Use the generated kanji packets to inspect tokenizer/readability coverage, reading-variant context, coverage gaps, and draft notes.
4. Inspect the live kanji card: primary reading, meanings, example sentence, reading/translation, audio identity, stroke-order media, notes/support surface, source evidence, limitations, and learner usefulness.
5. If a signal exposes a real card/source issue, fix tracked data first.
6. Regenerate, rerun relevant gates, and rerun NLP if the affected support artifact changed.
7. Add Obsidian proof only after the live kanji card has actually been rereviewed.
8. Check certification with `npm run deck:kanji:obsidian:rereview-status -- --levels=<levels>` and `npm run deck:kanji:obsidian:certify-status -- --levels=<levels>`.

`deck:kanji:nlp-signals` is intentionally narrower than the word lane. It audits the NLP manifest/runtime, refreshes generated kanji TSVs, tokenizes bare kanji-card anchors, creates kanji-scoped review packets and draft notes, validates artifacts, and runs `nlp:governance-gate`. It does not run word expansion, word reading-gap discovery, word example reranking, word sense-fit audits, or word-card embeddings.

The difference is deliberate: word cards have written+reading identity, meaning, example, and notes context, so embeddings, reranking, sense-fit, and reading-gap candidate discovery are useful review-amplification tools. Bare-kanji embeddings or sense-fit scoring would be much less reliable, so kanji NLP stays focused on tokenizer coverage and review packet scaffolding. Kanji tokenizer differences are usually reading variants or tokenizer coverage gaps, not automatic defects, because one bare kanji can legitimately have multiple readings.

## Current state

The first governed surface is the tracked model registry:

```bash
npm run nlp:models:audit
```

The registry lives at [../templates/nlp_model_manifest.json](../templates/nlp_model_manifest.json). It currently has two active runtimes: `kuromoji-js` for local morphological tokenization and `transformers-js` for local model inference. It has one active embedding model, `paraphrase-multilingual-minilm-l12-v2-q8`, backed by the local ignored cache path recorded in the manifest. Model output remains assistive-only.

The governed model-backed artifact surface starts with suggestion validation:

```bash
npm run deck:words:expansion-support -- --levels=5,4,3,2,1
npm run deck:kanji:nlp-signals -- --levels=5,4,3,2,1
npm run nlp:examples:rerank -- --level=5
npm run nlp:sense-fit:audit -- --level=5
npm run nlp:reading-gaps:discover -- --level=5 --include-deferred
npm run nlp:suggestions:validate
npm run nlp:review-packets:generate -- --level=5
npm run nlp:review-packets:validate
npm run nlp:drafts:generate -- --level=5
npm run nlp:drafts:validate
```

`deck:words:expansion-support` is the word expansion integration surface. It runs the governed NLP support stack for every selected N level: model/runtime checks, a cache-aware embedding smoke gate, tokenization, embeddings, example reranking, sense-fit warnings, reading-gap candidate discovery, governed review packets, draft proposals, artifact validation, and the aggregate NLP governance gate. The embedding smoke gate reuses a prior passing smoke result only when manifest, benchmark, model, cache mode, and remote-model policy are unchanged; pass `--force-smoke` when deliberately revalidating local model/runtime wiring. The level-specific aliases `deck:words:expansion-support:n5` through `deck:words:expansion-support:n1` are the default way to attach NLP evidence to word expansion review without treating NLP as certification.

`deck:kanji:nlp-signals` is the separate kanji-card signal surface. It refreshes generated kanji TSVs, tokenizes the bare kanji-card anchors with the active tokenizer, audits tokenizer/card-reading signals, and writes kanji-scoped review packets. Because a bare kanji can legitimately have several readings, normal tokenizer/primary-reading differences are recorded as kanji-card reading variants instead of automatic defects. Bare-kanji unknown tokens and missing tokenizer readings are recorded as kanji tokenizer coverage gaps so reviewers can see tokenizer/dictionary limitations without treating them as card-risk attention by themselves. Unrelated artifact warnings and other hard signals still require attention. It does not run word expansion, word reading-gap discovery, word example reranking, word sense-fit audits, or word-card embeddings.

The example reranker reads generated word rows, the local sentence corpus, and validated word-card embedding artifacts, then emits ranked review suggestions under `out/nlp-suggestions/`. The sense-fit audit reads generated word rows and validated word-card embeddings, compares meaning-focused and example-focused embedding views, and emits warning suggestions for possible meaning/example/translation alignment risks. Full-scope example-reranking and sense-fit writers reuse an existing artifact only when the pinned input hashes, level/lane/scope, model id, and generation parameters still match; reranking includes `minCandidates`, and sense-fit includes `threshold`. Limited artifacts are not reused as full-scope artifacts. Reading-gap candidate discovery reuses an existing candidate artifact only when the pinned plan/source/manifest input hashes, level/lane/scope, model id, and generation parameters still match; `fullScope`, `limit`, `maxCandidatesPerGap`, and `minModelScore` are part of that guard, so limited reading-gap artifacts remain limited. The reading-gap discovery command reads the governed word reading-gap plan, optionally including explicitly deferred gaps, and emits candidate suggestions without changing any gap disposition. Sentence support in this lane is reading-bound: a corpus row only boosts a candidate when the row reading contains the candidate reading, so rare alternate readings cannot borrow evidence from common same-written rows. By default the suggestion validator checks JSON artifacts under `out/nlp-suggestions/`. A missing directory is treated as an empty suggestion lane. Non-empty suggestion artifacts must bind to an active model in the manifest, use an allowed assistive lane, include pinned input hashes, carry per-suggestion evidence and limitations, and repeat the human-promotion boundary on each suggestion.

The governed review packet generator aggregates validated suggestion artifacts and tokenization audit signals into ignored JSON and Markdown packets under `out/nlp-review-packets/`. It reuses unchanged JSON and Markdown packets only when input hashes, scope, counts, and packet contents still match. Packets are a review convenience layer only: they point the Obsidian pass to exact targets, signal summaries, evidence digests, limitations, and checklist items, but they do not promote data, certify cards, or claim readiness.

The draft-proposal generator reads validated model-backed suggestion artifacts and validated governed review packets, then writes ignored JSON and Markdown draft packets under `out/nlp-drafts/`. It reuses unchanged JSON and Markdown drafts only when input hashes, source model IDs, scope, counts, and proposal contents still match. These drafts can scaffold candidate fields and review notes, but they are not free-form generative truth: model-backed draft kinds must declare active manifest-authorized source model IDs, preserve suggestion/source evidence refs, carry blockers and promotion checklists, and keep the no-certification/no-template-write/no-readiness boundary. Tokenization-only draft notes are allowed as review scaffolds, but they do not count as model-backed evidence.

The first capability lane is governed tokenization:

```bash
npm run nlp:tokenization:generate -- --level=5
npm run nlp:tokenization:generate -- --deck=kanji --level=5
npm run nlp:tokenization:validate
npm run nlp:tokenization:audit
```

The generator reads the generated word TSV by default, tokenizes each written word-card surface with the active `kuromoji-js` runtime, and writes an ignored JSON artifact under `out/nlp-tokenization/`. With `--deck=kanji`, it reads the generated kanji TSV and tokenizes the bare kanji-card anchor. Tokenization generation reuses an existing artifact before building the tokenizer only when generated TSV hash, manifest hash, runtime evidence, scope, level, and exact target row identities still match. The validator treats a missing directory as an empty tokenizer lane. Non-empty tokenization artifacts must bind to an active runtime in the manifest, use a runtime that allows `tokenization`, carry pinned input hashes, preserve contiguous token spans over the input text, bind word-card targets by exact written plus reading identity, and bind kanji-card targets to the generated kanji row. The audit command converts validated tokenization artifacts into assistive review-packet signals such as exact-reading word segmentation context, unknown tokens, missing token readings, word-card token/card reading mismatches, kanji-card tokenizer reading variants, and kanji-card tokenizer coverage gaps.

Tracked word tokenizer mismatch exceptions live in [../templates/nlp_word_tokenization_mismatch_exceptions.json](../templates/nlp_word_tokenization_mismatch_exceptions.json). They are narrow by design: an exception applies only when the current generated row, level, written form, card reading, tokenizer reading, token surfaces, and covered signal kinds all match the reviewed entry. Each entry must include generated-row evidence plus tracked-source or human-review evidence, and artifact-warning exceptions must state a tokenizer or dictionary limitation. These exceptions keep proven date/counter irregular readings, alternate lexical readings, proper-noun variants, and similar tokenizer-dictionary limitations visible as routine review context. They do not certify the card, prove source truth, approve Platinum or Obsidian, or claim release readiness. If tokenizer output or generated rows drift, the exception stops applying and the attention signal returns.

Word segmentation with exact joined token reading remains visible as tokenizer context without creating card-risk attention or draft notes by itself. Word-card reading mismatches, unknown tokens, missing token readings, and artifact warnings still require attention unless an exact tracked exception covers the current signal. Routine exceptions stay visible in review packets with their exception class and evidence refs, but routine tokenization context does not create draft-proposal notes.

The embedding artifact surface is:

```bash
npm run nlp:embeddings:evaluate
npm run nlp:embeddings:smoke-gate
npm run nlp:embeddings:generate -- --level=5
npm run nlp:embeddings:validate
```

The evaluation command re-runs the tracked Japanese semantic-similarity smoke benchmark at [../templates/nlp_embedding_model_benchmark.json](../templates/nlp_embedding_model_benchmark.json) against the active local embedding model. The smoke-gate command runs the same check or reuses a generated prior passing smoke result under `out/nlp-runtime-smoke/` when the pinned inputs still match. Both commands are runtime/model wiring and coarse-separation checks only, not production model-quality proof or card certification evidence. The generator reads generated word TSV rows and builds exact written-reading-bound `word-card-semantic-v2` inputs from written form, reading, meaning, and example sentence. It deliberately excludes the unbounded Notes field because Notes commonly contain source/placement provenance rather than core semantic surface; the artifact repeats this limitation and reviewers must inspect Notes separately. Before inference, the active manifest's `inputPolicy` counts Unicode code points and tokenizer `input_ids`, rejects character or token overflow, and invokes Transformers.js with `truncation: false`; silent clipping is not allowed. Full-scope embedding generation reuses an existing artifact only when the pinned input hashes, model evidence, input policy, input-composition version, level/lane/scope, generation parameters, row count, and exact written-reading input text still match. Limited artifacts are not reused as full-scope artifacts. By default the validator checks JSON artifacts under that directory. A missing directory is treated as an empty embedding lane. Non-empty embedding artifacts must bind to an active model in the manifest whose task is `embedding`, use an allowed assistive lane, carry pinned input hashes, include model evidence, input policy, and deterministic policy, bind word-like targets by exact written plus reading identity, and keep every vector length aligned with the declared embedding dimension. This validates embedding outputs only.

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
- It must not approve Gold, Sapphire, Platinum, Obsidian, Deck Ready, or release readiness.
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
- explicit maximum input characters, maximum tokenizer IDs, and reject-only overflow policy for embedding models
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
