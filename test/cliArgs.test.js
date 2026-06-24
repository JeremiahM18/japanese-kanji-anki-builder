const test = require("node:test");
const assert = require("node:assert/strict");

const { invokeCliMain } = require("../src/utils/cliArgs");
const { parseArgs: parseBuildArtifactsArgs } = require("../scripts/buildArtifacts");
const { parseArgs: parsePreviewArgs } = require("../scripts/previewDeck");
const { parseArgs: parseReadinessArgs } = require("../scripts/reportDeckReadiness");
const { parseArgs: parseSyncArgs } = require("../scripts/syncMedia");
const { parseArgs: parsePrepareArgs } = require("../scripts/prepareDeck");
const { parseArgs: parseAdditionalKanjiArgs } = require("../scripts/prepareAdditionalKanjiDeck");
const { parseArgs: parseKanjiReviewStatusArgs } = require("../scripts/reportKanjiDeckReviewStatus");
const { parseArgs: parseAdditionalKanjiReviewArgs } = require("../scripts/reviewGoldenAdditionalKanjiLevel");
const { parseArgs: parseImportKanjiVgArgs } = require("../scripts/importKanjiVgStrokeOrder");
const { parseArgs: parseDoctorArgs } = require("../scripts/doctor");
const { parseArgs: parseVoicevoxDoctorArgs } = require("../scripts/doctorVoicevox");
const { parseArgs: parseAudioPolicyArgs } = require("../scripts/auditAudioPolicy");
const { parseArgs: parseReleaseGateArgs } = require("../scripts/releaseGate");
const { parseArgs: parseMediaCoverageArgs } = require("../scripts/reportMediaCoverage");
const { parseArgs: parseMediaPlanArgs } = require("../scripts/reportMediaPlan");
const { parseArgs: parseMediaSourcesArgs } = require("../scripts/reportMediaSources");
const { parseArgs: parseSentenceCorpusCoverageArgs } = require("../scripts/reportSentenceCorpusCoverage");
const { parseArgs: parseNormalizeSentenceCorpusArgs } = require("../scripts/normalizeSentenceCorpus");
const { parseArgs: parseProductReadinessArgs } = require("../scripts/productReadiness");
const { parseArgs: parseWordAudioReviewArgs } = require("../scripts/reportWordAudioReview");
const { parseArgs: parseMissingManagedAnimationsArgs } = require("../scripts/reportMissingManagedAnimations");
const { parseArgs: parseImportAudioArgs } = require("../scripts/importAudio");
const { parseArgs: parseImportFreeStrokeOrderArgs } = require("../scripts/importFreeStrokeOrder");
const { parseArgs: parseNlpModelGovernanceArgs } = require("../scripts/reportNlpModelGovernance");
const { parseArgs: parseNlpTokenizationGenerateArgs } = require("../scripts/generateNlpTokenization");
const { parseArgs: parseNlpTokenizationArgs } = require("../scripts/validateNlpTokenization");
const { parseArgs: parseNlpTokenizationAuditArgs } = require("../scripts/auditNlpTokenization");
const { parseArgs: parseNlpEmbeddingEvaluateArgs } = require("../scripts/evaluateNlpEmbeddingModel");
const { parseArgs: parseNlpEmbeddingGenerateArgs } = require("../scripts/generateNlpEmbeddings");
const { parseArgs: parseNlpEmbeddingArgs } = require("../scripts/validateNlpEmbeddings");
const { parseArgs: parseNlpExampleRerankArgs } = require("../scripts/rerankNlpExamples");
const { parseArgs: parseNlpSenseFitAuditArgs } = require("../scripts/auditNlpSenseFit");
const { parseArgs: parseNlpReadingGapDiscoveryArgs } = require("../scripts/discoverNlpReadingGapCandidates");
const { parseArgs: parseNlpSuggestionArgs } = require("../scripts/validateNlpSuggestions");
const { parseArgs: parseNlpReviewPacketGenerateArgs } = require("../scripts/generateNlpReviewPackets");
const { parseArgs: parseNlpReviewPacketArgs } = require("../scripts/validateNlpReviewPackets");
const { parseArgs: parseNlpDraftGenerateArgs } = require("../scripts/generateNlpDraftProposals");
const { parseArgs: parseNlpDraftArgs } = require("../scripts/validateNlpDraftProposals");
const { parseArgs: parseNlpDoctorArgs } = require("../scripts/doctorNlpRuntime");
const { parseArgs: parseNlpGovernanceGateArgs } = require("../scripts/runNlpGovernanceGate");

test("syncMedia parseArgs accepts --levels alias for one level", () => {
    const options = parseSyncArgs(["--levels=5", "--limit=79"]);

    assert.equal(options.level, 5);
    assert.equal(options.limit, 79);
    assert.deepEqual(options.unknownArgs, []);
});

test("syncMedia parseArgs records unsupported flags", () => {
    const options = parseSyncArgs(["--bogus=1", "--kanji=日,本"]);

    assert.deepEqual(options.unknownArgs, ["--bogus=1"]);
    assert.deepEqual(options.kanji, ["日", "本"]);
});

test("syncMedia parseArgs rejects multi-level alias input", () => {
    assert.throws(() => parseSyncArgs(["--levels=5,4"]), /one level at a time/);
});

test("importKanjiVg parseArgs accepts explicit kanji outside JLPT inventory", () => {
    const options = parseImportKanjiVgArgs(["--input-dir=downloads/kanjivg", "--kanji=椅,瓜", "--json"]);

    assert.equal(options.inputDir, "downloads/kanjivg");
    assert.deepEqual(options.kanji, ["椅", "瓜"]);
    assert.equal(options.json, true);
});

test("prepareDeck parseArgs records unsupported flags, output isolation, json mode, and strict override", () => {
    const options = parsePrepareArgs([
        "--levels=5,4",
        "--out-dir-base=out/runs",
        "--run-id=batch-001",
        "--json",
        "--allow-export-fallbacks",
        "--oops",
    ]);

    assert.deepEqual(options.levels, [5, 4]);
    assert.equal(options.outDirBase, "out/runs");
    assert.equal(options.runId, "batch-001");
    assert.equal(options.json, true);
    assert.equal(options.allowExportFallbacks, true);
    assert.deepEqual(options.unknownArgs, ["--oops"]);
});

test("prepareAdditionalKanjiDeck parseArgs records scope levels and unsupported flags", () => {
    const options = parseAdditionalKanjiArgs([
        "--levels=5,4",
        "--candidate-scope=all-source-claims",
        "--include-disputed",
        "--out-dir=out/additional",
        "--json",
        "--oops",
    ]);

    assert.deepEqual(options.levels, [5, 4]);
    assert.equal(options.candidateScope, "all-source-claims");
    assert.equal(options.includeDisputed, true);
    assert.equal(options.outDir, "out/additional");
    assert.equal(options.json, true);
    assert.deepEqual(options.unknownArgs, ["--oops"]);
});

test("reportKanjiDeckReviewStatus parseArgs records output roots and unsupported flags", () => {
    const options = parseKanjiReviewStatusArgs([
        "--levels=5,1",
        "--candidate-scope=all-source-claims",
        "--core-out-dir=out/core",
        "--additional-out-dir=out/additional",
        "--include-disputed",
        "--json",
        "--oops",
    ]);

    assert.deepEqual(options.levels, [5, 1]);
    assert.equal(options.candidateScope, "all-source-claims");
    assert.equal(options.coreOutDir, "out/core");
    assert.equal(options.additionalOutDir, "out/additional");
    assert.equal(options.includeDisputed, true);
    assert.equal(options.json, true);
    assert.deepEqual(options.unknownArgs, ["--oops"]);
});

test("reviewGoldenAdditionalKanjiLevel parseArgs records level output root and unsupported flags", () => {
    const options = parseAdditionalKanjiReviewArgs([
        "--level=4",
        "--out-dir=out/additional",
        "--require-all",
        "--json",
        "--oops",
    ]);

    assert.equal(options.level, 4);
    assert.equal(options.outDir, "out/additional");
    assert.equal(options.requireAllRows, true);
    assert.equal(options.json, true);
    assert.deepEqual(options.unknownArgs, ["--oops"]);
});

test("buildArtifacts parseArgs records unsupported flags, output isolation, and export issue gates", () => {
    const options = parseBuildArtifactsArgs([
        "--levels=5,4",
        "--out-dir-base=out/runs",
        "--run-id=batch-002",
        "--skip-media-sync",
        "--fail-on-export-issues",
        "--max-fallback-ratio=0.05",
        "--oops",
    ]);

    assert.deepEqual(options.levels, [5, 4]);
    assert.equal(options.outDirBase, "out/runs");
    assert.equal(options.runId, "batch-002");
    assert.equal(options.skipMediaSync, true);
    assert.equal(options.failOnExportIssues, true);
    assert.equal(options.maxFallbackRatio, 0.05);
    assert.deepEqual(options.unknownArgs, ["--oops"]);
});

test("previewDeck parseArgs records unsupported flags", () => {
    const options = parsePreviewArgs(["--level=5", "--kanji=日,本", "--json", "--oops"]);

    assert.equal(options.level, 5);
    assert.deepEqual(options.kanji, ["日", "本"]);
    assert.equal(options.json, true);
    assert.deepEqual(options.unknownArgs, ["--oops"]);
});

test("reportDeckReadiness parseArgs records unsupported flags", () => {
    const options = parseReadinessArgs(["--json", "--oops"]);

    assert.equal(options.json, true);
    assert.deepEqual(options.unknownArgs, ["--oops"]);
});

test("small diagnostic parseArgs functions record unsupported flags", () => {
    assert.deepEqual(parseDoctorArgs(["--json", "--oops"]), {
        json: true,
        unknownArgs: ["--oops"],
    });
    assert.deepEqual(parseVoicevoxDoctorArgs(["--json", "--oops"]), {
        json: true,
        unknownArgs: ["--oops"],
    });
    assert.deepEqual(parseAudioPolicyArgs(["--json", "--oops"]), {
        json: true,
        unknownArgs: ["--oops"],
    });
});

test("releaseGate parseArgs records unsupported flags through the shared path", () => {
    const options = parseReleaseGateArgs([
        "--root-dir=.release-gate",
        "--keep-temp-dir",
        "--require-apkg-tools",
        "--oops",
    ]);

    assert.equal(options.rootDir, ".release-gate");
    assert.equal(options.keepTempDir, true);
    assert.equal(options.requireApkgTools, true);
    assert.deepEqual(options.unknownArgs, ["--oops"]);
});

test("media parseArgs functions use shared option helpers and unknown tracking", () => {
    const plan = parseMediaPlanArgs(["--levels=5,4", "--limit=10", "--json", "--oops"]);
    const sources = parseMediaSourcesArgs(["--level=4", "--limit=11", "--json", "--oops"]);
    const coverage = parseMediaCoverageArgs(["--limit=12", "--oops"]);
    const animations = parseMissingManagedAnimationsArgs(["--level=3", "--limit=13", "--json", "--oops"]);

    assert.deepEqual(plan.levels, [5, 4]);
    assert.equal(plan.limit, 10);
    assert.equal(plan.json, true);
    assert.deepEqual(plan.unknownArgs, ["--oops"]);
    assert.deepEqual(sources.levels, [4]);
    assert.equal(sources.limit, 11);
    assert.equal(sources.json, true);
    assert.deepEqual(sources.unknownArgs, ["--oops"]);
    assert.equal(coverage.limit, 12);
    assert.deepEqual(coverage.unknownArgs, ["--oops"]);
    assert.deepEqual(animations.levels, [3]);
    assert.equal(animations.limit, 13);
    assert.equal(animations.json, true);
    assert.deepEqual(animations.unknownArgs, ["--oops"]);
});

test("media import parseArgs functions record unsupported flags", () => {
    const audio = parseImportAudioArgs(["--input-dir=downloads/audio", "--levels=5,4", "--json", "--oops"]);
    const freeStrokeOrder = parseImportFreeStrokeOrderArgs(["--input-dir=downloads/stroke", "--limit=25", "--json", "--oops"]);
    const invalidFreeStrokeOrder = parseImportFreeStrokeOrderArgs(["--limit=0"]);

    assert.equal(audio.inputDir, "downloads/audio");
    assert.deepEqual(audio.levels, [5, 4]);
    assert.equal(audio.json, true);
    assert.deepEqual(audio.unknownArgs, ["--oops"]);
    assert.equal(freeStrokeOrder.inputDir, "downloads/stroke");
    assert.equal(freeStrokeOrder.limit, 25);
    assert.equal(freeStrokeOrder.json, true);
    assert.deepEqual(freeStrokeOrder.unknownArgs, ["--oops"]);
    assert.deepEqual(invalidFreeStrokeOrder.unknownArgs, ["--limit must be a positive integer"]);
});

test("corpus and product parseArgs functions record unsupported flags", () => {
    const corpusCoverage = parseSentenceCorpusCoverageArgs(["--limit=14", "--oops"]);
    const normalizeCorpus = parseNormalizeSentenceCorpusArgs([
        "--input=in.json",
        "--output=out.json",
        "--check",
        "--oops",
    ]);
    const readiness = parseProductReadinessArgs(["--level=5", "--json", "--oops"]);

    assert.equal(corpusCoverage.limit, 14);
    assert.deepEqual(corpusCoverage.unknownArgs, ["--oops"]);
    assert.equal(normalizeCorpus.input, "in.json");
    assert.equal(normalizeCorpus.output, "out.json");
    assert.equal(normalizeCorpus.check, true);
    assert.deepEqual(normalizeCorpus.unknownArgs, ["--oops"]);
    assert.equal(readiness.level, 5);
    assert.equal(readiness.json, true);
    assert.deepEqual(readiness.unknownArgs, ["--oops"]);
});

test("NLP model governance parseArgs records manifest overrides and unsupported flags", () => {
    const options = parseNlpModelGovernanceArgs([
        "--manifest=templates/nlp_model_manifest.json",
        "--json",
        "--oops",
    ]);

    assert.equal(options.manifestPath, "templates/nlp_model_manifest.json");
    assert.equal(options.json, true);
    assert.deepEqual(options.unknownArgs, ["--oops"]);
});

test("NLP suggestion validation parseArgs records artifact inputs and unsupported flags", () => {
    const options = parseNlpSuggestionArgs([
        "--dir=out/nlp-suggestions",
        "--manifest=templates/nlp_model_manifest.json",
        "--json",
        "--oops",
    ]);

    assert.equal(options.artifactDir, "out/nlp-suggestions");
    assert.equal(options.manifestPath, "templates/nlp_model_manifest.json");
    assert.equal(options.json, true);
    assert.deepEqual(options.unknownArgs, ["--oops"]);

    const pathOptions = parseNlpSuggestionArgs(["--path=out/nlp-suggestions/batch.json"]);
    assert.equal(pathOptions.artifactPath, "out/nlp-suggestions/batch.json");
    assert.deepEqual(pathOptions.unknownArgs, []);

    const conflictingOptions = parseNlpSuggestionArgs([
        "--dir=out/nlp-suggestions",
        "--path=out/nlp-suggestions/batch.json",
    ]);
    assert.deepEqual(conflictingOptions.unknownArgs, ["use only one of --dir or --path"]);
});

test("NLP tokenization validation parseArgs records artifact inputs and unsupported flags", () => {
    const options = parseNlpTokenizationArgs([
        "--dir=out/nlp-tokenization",
        "--manifest=templates/nlp_model_manifest.json",
        "--json",
        "--oops",
    ]);

    assert.equal(options.artifactDir, "out/nlp-tokenization");
    assert.equal(options.manifestPath, "templates/nlp_model_manifest.json");
    assert.equal(options.json, true);
    assert.deepEqual(options.unknownArgs, ["--oops"]);

    const pathOptions = parseNlpTokenizationArgs(["--path=out/nlp-tokenization/batch.json"]);
    assert.equal(pathOptions.artifactPath, "out/nlp-tokenization/batch.json");
    assert.deepEqual(pathOptions.unknownArgs, []);

    const conflictingOptions = parseNlpTokenizationArgs([
        "--dir=out/nlp-tokenization",
        "--path=out/nlp-tokenization/batch.json",
    ]);
    assert.deepEqual(conflictingOptions.unknownArgs, ["use only one of --dir or --path"]);
});

test("NLP tokenization generation parseArgs records source and output inputs", () => {
    const options = parseNlpTokenizationGenerateArgs([
        "--deck=word",
        "--level=5",
        "--limit=8",
        "--word-tsv=out/word-build/exports/jlpt-n5-words.tsv",
        "--out=out/nlp-tokenization/word-n5-kuromoji.json",
        "--manifest=templates/nlp_model_manifest.json",
        "--runtime-id=kuromoji-js",
        "--workspace-root=.",
        "--json",
        "--oops",
    ]);

    assert.equal(options.deckKind, "word");
    assert.equal(options.level, 5);
    assert.equal(options.limit, 8);
    assert.equal(options.wordTsvPath, "out/word-build/exports/jlpt-n5-words.tsv");
    assert.equal(options.outPath, "out/nlp-tokenization/word-n5-kuromoji.json");
    assert.equal(options.manifestPath, "templates/nlp_model_manifest.json");
    assert.equal(options.runtimeId, "kuromoji-js");
    assert.equal(options.workspaceRoot, ".");
    assert.equal(options.json, true);
    assert.deepEqual(options.unknownArgs, ["--oops"]);

    const invalidLevel = parseNlpTokenizationGenerateArgs(["--level=9"]);
    assert.deepEqual(invalidLevel.unknownArgs, ["--level must be an integer from 1 to 5"]);

    const kanjiOptions = parseNlpTokenizationGenerateArgs([
        "--deck=kanji",
        "--kanji-tsv=out/build/exports/jlpt-n5.tsv",
    ]);
    assert.equal(kanjiOptions.deckKind, "kanji");
    assert.equal(kanjiOptions.kanjiTsvPath, "out/build/exports/jlpt-n5.tsv");

    const conflictingOptions = parseNlpTokenizationGenerateArgs([
        "--deck=kanji",
        "--word-tsv=out/word-build/exports/jlpt-n5-words.tsv",
    ]);
    assert.deepEqual(conflictingOptions.unknownArgs, ["--word-tsv is only supported with --deck=word"]);
});

test("NLP tokenization audit parseArgs records artifact inputs and signal limits", () => {
    const options = parseNlpTokenizationAuditArgs([
        "--dir=out/nlp-tokenization",
        "--manifest=templates/nlp_model_manifest.json",
        "--signal-limit=5",
        "--json",
        "--oops",
    ]);

    assert.equal(options.artifactDir, "out/nlp-tokenization");
    assert.equal(options.manifestPath, "templates/nlp_model_manifest.json");
    assert.equal(options.signalLimit, 5);
    assert.equal(options.json, true);
    assert.deepEqual(options.unknownArgs, ["--oops"]);

    const pathOptions = parseNlpTokenizationAuditArgs(["--path=out/nlp-tokenization/batch.json"]);
    assert.equal(pathOptions.artifactPath, "out/nlp-tokenization/batch.json");
    assert.deepEqual(pathOptions.unknownArgs, []);

    const conflictingOptions = parseNlpTokenizationAuditArgs([
        "--dir=out/nlp-tokenization",
        "--path=out/nlp-tokenization/batch.json",
    ]);
    assert.deepEqual(conflictingOptions.unknownArgs, ["use only one of --dir or --path"]);

    const invalidLimit = parseNlpTokenizationAuditArgs(["--signal-limit=-1"]);
    assert.deepEqual(invalidLimit.unknownArgs, ["--signal-limit must be a non-negative integer"]);
});

test("NLP embedding validation parseArgs records artifact inputs and unsupported flags", () => {
    const options = parseNlpEmbeddingArgs([
        "--dir=out/nlp-embeddings",
        "--manifest=templates/nlp_model_manifest.json",
        "--json",
        "--oops",
    ]);

    assert.equal(options.artifactDir, "out/nlp-embeddings");
    assert.equal(options.manifestPath, "templates/nlp_model_manifest.json");
    assert.equal(options.json, true);
    assert.deepEqual(options.unknownArgs, ["--oops"]);

    const pathOptions = parseNlpEmbeddingArgs(["--path=out/nlp-embeddings/batch.json"]);
    assert.equal(pathOptions.artifactPath, "out/nlp-embeddings/batch.json");
    assert.deepEqual(pathOptions.unknownArgs, []);

    const conflictingOptions = parseNlpEmbeddingArgs([
        "--dir=out/nlp-embeddings",
        "--path=out/nlp-embeddings/batch.json",
    ]);
    assert.deepEqual(conflictingOptions.unknownArgs, ["use only one of --dir or --path"]);
});

test("NLP embedding generation parseArgs records source, model, and output inputs", () => {
    const options = parseNlpEmbeddingGenerateArgs([
        "--level=5",
        "--limit=8",
        "--word-tsv=out/word-build/exports/jlpt-n5-words.tsv",
        "--out=out/nlp-embeddings/word-n5.json",
        "--manifest=templates/nlp_model_manifest.json",
        "--model-id=fixtureEmbeddingModel",
        "--lane=assistive-example-reranking",
        "--workspace-root=.",
        "--cache-dir=cache/nlp-models/transformers-js",
        "--allow-remote-models",
        "--json",
        "--oops",
    ]);

    assert.equal(options.level, 5);
    assert.equal(options.limit, 8);
    assert.equal(options.wordTsvPath, "out/word-build/exports/jlpt-n5-words.tsv");
    assert.equal(options.outPath, "out/nlp-embeddings/word-n5.json");
    assert.equal(options.manifestPath, "templates/nlp_model_manifest.json");
    assert.equal(options.modelId, "fixtureEmbeddingModel");
    assert.equal(options.lane, "assistive-example-reranking");
    assert.equal(options.workspaceRoot, ".");
    assert.equal(options.cacheDir, "cache/nlp-models/transformers-js");
    assert.equal(options.allowRemoteModels, true);
    assert.equal(options.json, true);
    assert.deepEqual(options.unknownArgs, ["--oops"]);

    const invalidLevel = parseNlpEmbeddingGenerateArgs(["--level=9"]);
    assert.deepEqual(invalidLevel.unknownArgs, ["--level must be an integer from 1 to 5"]);
});

test("NLP embedding evaluation parseArgs records model inputs and unsupported flags", () => {
    const options = parseNlpEmbeddingEvaluateArgs([
        "--manifest=templates/nlp_model_manifest.json",
        "--benchmark=templates/nlp_embedding_model_benchmark.json",
        "--model-id=fixtureEmbeddingModel",
        "--cache-dir=cache/nlp-models/transformers-js",
        "--output=out/nlp-embedding-eval/report.json",
        "--allow-remote-models",
        "--json",
        "--oops",
    ]);

    assert.equal(options.manifestPath, "templates/nlp_model_manifest.json");
    assert.equal(options.benchmarkPath, "templates/nlp_embedding_model_benchmark.json");
    assert.equal(options.modelId, "fixtureEmbeddingModel");
    assert.equal(options.cacheDir, "cache/nlp-models/transformers-js");
    assert.equal(options.outputPath, "out/nlp-embedding-eval/report.json");
    assert.equal(options.allowRemoteModels, true);
    assert.equal(options.json, true);
    assert.deepEqual(options.unknownArgs, ["--oops"]);
});

test("NLP example reranking parseArgs records source and artifact inputs", () => {
    const options = parseNlpExampleRerankArgs([
        "--level=5",
        "--limit=8",
        "--min-candidates=2",
        "--word-tsv=out/word-build/exports/jlpt-n5-words.tsv",
        "--sentence-corpus=data/sentence_corpus.json",
        "--embeddings=out/nlp-embeddings/word-n5.json",
        "--out=out/nlp-suggestions/rerank.json",
        "--manifest=templates/nlp_model_manifest.json",
        "--model-id=fixtureEmbeddingModel",
        "--workspace-root=.",
        "--cache-dir=cache/nlp-models/transformers-js",
        "--allow-remote-models",
        "--json",
        "--oops",
    ]);

    assert.equal(options.level, 5);
    assert.equal(options.limit, 8);
    assert.equal(options.minCandidates, 2);
    assert.equal(options.wordTsvPath, "out/word-build/exports/jlpt-n5-words.tsv");
    assert.equal(options.sentenceCorpusPath, "data/sentence_corpus.json");
    assert.equal(options.embeddingArtifactPath, "out/nlp-embeddings/word-n5.json");
    assert.equal(options.outPath, "out/nlp-suggestions/rerank.json");
    assert.equal(options.manifestPath, "templates/nlp_model_manifest.json");
    assert.equal(options.modelId, "fixtureEmbeddingModel");
    assert.equal(options.workspaceRoot, ".");
    assert.equal(options.cacheDir, "cache/nlp-models/transformers-js");
    assert.equal(options.allowRemoteModels, true);
    assert.equal(options.json, true);
    assert.deepEqual(options.unknownArgs, ["--oops"]);

    const invalidLevel = parseNlpExampleRerankArgs(["--level=9", "--min-candidates=0"]);
    assert.deepEqual(invalidLevel.unknownArgs, [
        "--level must be an integer from 1 to 5",
        "--min-candidates must be a positive integer",
    ]);
});

test("NLP sense-fit audit parseArgs records source and threshold inputs", () => {
    const options = parseNlpSenseFitAuditArgs([
        "--level=5",
        "--limit=8",
        "--threshold=0.7",
        "--word-tsv=out/word-build/exports/jlpt-n5-words.tsv",
        "--embeddings=out/nlp-embeddings/word-n5.json",
        "--out=out/nlp-suggestions/sense-fit.json",
        "--manifest=templates/nlp_model_manifest.json",
        "--model-id=fixtureEmbeddingModel",
        "--workspace-root=.",
        "--cache-dir=cache/nlp-models/transformers-js",
        "--allow-remote-models",
        "--json",
        "--oops",
    ]);

    assert.equal(options.level, 5);
    assert.equal(options.limit, 8);
    assert.equal(options.threshold, 0.7);
    assert.equal(options.wordTsvPath, "out/word-build/exports/jlpt-n5-words.tsv");
    assert.equal(options.embeddingArtifactPath, "out/nlp-embeddings/word-n5.json");
    assert.equal(options.outPath, "out/nlp-suggestions/sense-fit.json");
    assert.equal(options.manifestPath, "templates/nlp_model_manifest.json");
    assert.equal(options.modelId, "fixtureEmbeddingModel");
    assert.equal(options.workspaceRoot, ".");
    assert.equal(options.cacheDir, "cache/nlp-models/transformers-js");
    assert.equal(options.allowRemoteModels, true);
    assert.equal(options.json, true);
    assert.deepEqual(options.unknownArgs, ["--oops"]);

    const invalid = parseNlpSenseFitAuditArgs(["--level=9", "--threshold=2"]);
    assert.deepEqual(invalid.unknownArgs, [
        "--level must be an integer from 1 to 5",
        "--threshold must be a number from 0 to 1",
    ]);
});

test("NLP reading-gap discovery parseArgs records gap-plan and model inputs", () => {
    const options = parseNlpReadingGapDiscoveryArgs([
        "--level=4",
        "--limit=8",
        "--suggestions=2",
        "--min-suggestion-score=75",
        "--quality=review",
        "--only=contract-extensions",
        "--min-model-score=0.6",
        "--include-deferred",
        "--out=out/nlp-suggestions/reading-gaps.json",
        "--manifest=templates/nlp_model_manifest.json",
        "--model-id=fixtureEmbeddingModel",
        "--workspace-root=.",
        "--cache-dir=cache/nlp-models/transformers-js",
        "--allow-remote-models",
        "--json",
        "--oops",
    ]);

    assert.equal(options.level, 4);
    assert.equal(options.limit, 8);
    assert.equal(options.suggestions, 2);
    assert.equal(options.minSuggestionScore, 75);
    assert.equal(options.quality, "review");
    assert.equal(options.only, "contract-extensions");
    assert.equal(options.minModelScore, 0.6);
    assert.equal(options.includeDeferred, true);
    assert.equal(options.outPath, "out/nlp-suggestions/reading-gaps.json");
    assert.equal(options.manifestPath, "templates/nlp_model_manifest.json");
    assert.equal(options.modelId, "fixtureEmbeddingModel");
    assert.equal(options.workspaceRoot, ".");
    assert.equal(options.cacheDir, "cache/nlp-models/transformers-js");
    assert.equal(options.allowRemoteModels, true);
    assert.equal(options.json, true);
    assert.deepEqual(options.unknownArgs, ["--oops"]);

    const invalid = parseNlpReadingGapDiscoveryArgs([
        "--level=0",
        "--limit=0",
        "--suggestions=-1",
        "--only=nope",
        "--quality=nope",
        "--min-model-score=2",
    ]);
    assert.deepEqual(invalid.unknownArgs, [
        "--level must be an integer from 1 to 5",
        "--limit must be a positive integer",
        "--suggestions must be a non-negative integer",
        "--only must be one of: all, contract-extensions",
        "--quality must be one of: weak, review, strong",
        "--min-model-score must be a number from 0 to 1",
    ]);
});

test("NLP runtime doctor parseArgs records manifest and workspace overrides", () => {
    const options = parseNlpDoctorArgs([
        "--manifest=templates/nlp_model_manifest.json",
        "--package-json=package.json",
        "--package-lock=package-lock.json",
        "--workspace-root=.",
        "--json",
        "--oops",
    ]);

    assert.equal(options.manifestPath, "templates/nlp_model_manifest.json");
    assert.equal(options.packageJsonPath, "package.json");
    assert.equal(options.packageLockJsonPath, "package-lock.json");
    assert.equal(options.workspaceRoot, ".");
    assert.equal(options.json, true);
    assert.deepEqual(options.unknownArgs, ["--oops"]);
});

test("NLP review packet parseArgs records generation and validation inputs", () => {
    const generateOptions = parseNlpReviewPacketGenerateArgs([
        "--deck=word",
        "--level=5",
        "--limit=8",
        "--out=out/nlp-review-packets/word-n5.json",
        "--markdown-out=out/nlp-review-packets/word-n5.md",
        "--suggestions-dir=out/nlp-suggestions",
        "--tokenization-dir=out/nlp-tokenization",
        "--manifest=templates/nlp_model_manifest.json",
        "--workspace-root=.",
        "--json",
        "--oops",
    ]);

    assert.equal(generateOptions.deckKind, "word");
    assert.equal(generateOptions.level, 5);
    assert.equal(generateOptions.limit, 8);
    assert.equal(generateOptions.outPath, "out/nlp-review-packets/word-n5.json");
    assert.equal(generateOptions.markdownOutPath, "out/nlp-review-packets/word-n5.md");
    assert.equal(generateOptions.suggestionArtifactDir, "out/nlp-suggestions");
    assert.equal(generateOptions.tokenizationArtifactDir, "out/nlp-tokenization");
    assert.equal(generateOptions.manifestPath, "templates/nlp_model_manifest.json");
    assert.equal(generateOptions.workspaceRoot, ".");
    assert.equal(generateOptions.json, true);
    assert.deepEqual(generateOptions.unknownArgs, ["--oops"]);

    const invalidGenerate = parseNlpReviewPacketGenerateArgs([
        "--deck=nope",
        "--level=9",
        "--limit=0",
        "--suggestions-dir=out/nlp-suggestions",
        "--suggestion-path=out/nlp-suggestions/batch.json",
        "--tokenization-dir=out/nlp-tokenization",
        "--tokenization-path=out/nlp-tokenization/batch.json",
    ]);
    assert.deepEqual(invalidGenerate.unknownArgs, [
        "--deck must be one of: kanji, word, all",
        "--level must be an integer from 1 to 5",
        "--limit must be a positive integer",
        "use only one of --suggestions-dir or --suggestion-path",
        "use only one of --tokenization-dir or --tokenization-path",
    ]);

    const validateOptions = parseNlpReviewPacketArgs([
        "--artifact-dir=out/nlp-review-packets",
        "--json",
        "--oops",
    ]);
    assert.equal(validateOptions.artifactDir, "out/nlp-review-packets");
    assert.equal(validateOptions.json, true);
    assert.deepEqual(validateOptions.unknownArgs, ["--oops"]);
});

test("NLP draft proposal parseArgs records generation and validation inputs", () => {
    const generateOptions = parseNlpDraftGenerateArgs([
        "--deck=word",
        "--level=5",
        "--limit=12",
        "--out=out/nlp-drafts/word-n5.json",
        "--markdown-out=out/nlp-drafts/word-n5.md",
        "--suggestions-dir=out/nlp-suggestions",
        "--review-packets-dir=out/nlp-review-packets",
        "--manifest=templates/nlp_model_manifest.json",
        "--workspace-root=.",
        "--no-tokenization-drafts",
        "--json",
        "--oops",
    ]);

    assert.equal(generateOptions.deckKind, "word");
    assert.equal(generateOptions.level, 5);
    assert.equal(generateOptions.limit, 12);
    assert.equal(generateOptions.outPath, "out/nlp-drafts/word-n5.json");
    assert.equal(generateOptions.markdownOutPath, "out/nlp-drafts/word-n5.md");
    assert.equal(generateOptions.suggestionArtifactDir, "out/nlp-suggestions");
    assert.equal(generateOptions.reviewPacketArtifactDir, "out/nlp-review-packets");
    assert.equal(generateOptions.manifestPath, "templates/nlp_model_manifest.json");
    assert.equal(generateOptions.workspaceRoot, ".");
    assert.equal(generateOptions.includeTokenizationDrafts, false);
    assert.equal(generateOptions.json, true);
    assert.deepEqual(generateOptions.unknownArgs, ["--oops"]);

    const invalidGenerate = parseNlpDraftGenerateArgs([
        "--deck=nope",
        "--level=0",
        "--limit=0",
        "--suggestions-dir=out/nlp-suggestions",
        "--suggestion-path=out/nlp-suggestions/batch.json",
        "--review-packets-dir=out/nlp-review-packets",
        "--review-packet-path=out/nlp-review-packets/batch.json",
    ]);
    assert.deepEqual(invalidGenerate.unknownArgs, [
        "--deck must be one of: kanji, word, all",
        "--level must be an integer from 1 to 5",
        "--limit must be a positive integer",
        "use only one of --suggestions-dir or --suggestion-path",
        "use only one of --review-packets-dir or --review-packet-path",
    ]);

    const validateOptions = parseNlpDraftArgs([
        "--artifact-dir=out/nlp-drafts",
        "--manifest=templates/nlp_model_manifest.json",
        "--json",
        "--oops",
    ]);
    assert.equal(validateOptions.artifactDir, "out/nlp-drafts");
    assert.equal(validateOptions.manifestPath, "templates/nlp_model_manifest.json");
    assert.equal(validateOptions.json, true);
    assert.deepEqual(validateOptions.unknownArgs, ["--oops"]);
});

test("NLP governance gate parseArgs records all gate inputs", () => {
    const options = parseNlpGovernanceGateArgs([
        "--manifest=templates/nlp_model_manifest.json",
        "--suggestions-dir=out/nlp-suggestions",
        "--tokenization-dir=out/nlp-tokenization",
        "--embeddings-dir=out/nlp-embeddings",
        "--review-packets-dir=out/nlp-review-packets",
        "--drafts-dir=out/nlp-drafts",
        "--workspace-root=.",
        "--package-json=package.json",
        "--package-lock=package-lock.json",
        "--json",
        "--oops",
    ]);

    assert.equal(options.manifestPath, "templates/nlp_model_manifest.json");
    assert.equal(options.suggestionArtifactDir, "out/nlp-suggestions");
    assert.equal(options.tokenizationArtifactDir, "out/nlp-tokenization");
    assert.equal(options.embeddingArtifactDir, "out/nlp-embeddings");
    assert.equal(options.reviewPacketArtifactDir, "out/nlp-review-packets");
    assert.equal(options.draftProposalArtifactDir, "out/nlp-drafts");
    assert.equal(options.workspaceRoot, ".");
    assert.equal(options.packageJsonPath, "package.json");
    assert.equal(options.packageLockJsonPath, "package-lock.json");
    assert.equal(options.json, true);
    assert.deepEqual(options.unknownArgs, ["--oops"]);

    const conflictingOptions = parseNlpGovernanceGateArgs([
        "--suggestions-dir=out/nlp-suggestions",
        "--suggestion-path=out/nlp-suggestions/batch.json",
    ]);
    assert.deepEqual(conflictingOptions.unknownArgs, ["use only one of --suggestions-dir or --suggestion-path"]);

    const conflictingTokenizationOptions = parseNlpGovernanceGateArgs([
        "--tokenization-dir=out/nlp-tokenization",
        "--tokenization-path=out/nlp-tokenization/batch.json",
    ]);
    assert.deepEqual(conflictingTokenizationOptions.unknownArgs, ["use only one of --tokenization-dir or --tokenization-path"]);

    const conflictingEmbeddingOptions = parseNlpGovernanceGateArgs([
        "--embeddings-dir=out/nlp-embeddings",
        "--embedding-path=out/nlp-embeddings/batch.json",
    ]);
    assert.deepEqual(conflictingEmbeddingOptions.unknownArgs, ["use only one of --embeddings-dir or --embedding-path"]);

    const conflictingReviewPacketOptions = parseNlpGovernanceGateArgs([
        "--review-packets-dir=out/nlp-review-packets",
        "--review-packet-path=out/nlp-review-packets/batch.json",
    ]);
    assert.deepEqual(conflictingReviewPacketOptions.unknownArgs, ["use only one of --review-packets-dir or --review-packet-path"]);

    const conflictingDraftOptions = parseNlpGovernanceGateArgs([
        "--drafts-dir=out/nlp-drafts",
        "--draft-path=out/nlp-drafts/batch.json",
    ]);
    assert.deepEqual(conflictingDraftOptions.unknownArgs, ["use only one of --drafts-dir or --draft-path"]);
});

test("word audio review parseArgs records filters and unsupported flags", () => {
    const options = parseWordAudioReviewArgs([
        "--level=4",
        "--limit=15",
        "--word=学校,春雨",
        "--tsv-path=out/word.tsv",
        "--json",
        "--oops",
    ]);

    assert.equal(options.level, 4);
    assert.equal(options.limit, 15);
    assert.deepEqual(options.words, ["学校", "春雨"]);
    assert.equal(options.tsvPath, "out/word.tsv");
    assert.equal(options.json, true);
    assert.deepEqual(options.unknownArgs, ["--oops"]);
});


test("invokeCliMain resolves both sync and async entrypoints", async () => {
    await assert.doesNotReject(() => invokeCliMain(() => 42));
    await assert.doesNotReject(() => invokeCliMain(async () => 42));
    await assert.rejects(() => invokeCliMain(() => { throw new Error("boom"); }), /boom/);
});
