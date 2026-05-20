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
const { parseArgs: parseNlpModelGovernanceArgs } = require("../scripts/reportNlpModelGovernance");
const { parseArgs: parseNlpTokenizationGenerateArgs } = require("../scripts/generateNlpTokenization");
const { parseArgs: parseNlpTokenizationArgs } = require("../scripts/validateNlpTokenization");
const { parseArgs: parseNlpTokenizationAuditArgs } = require("../scripts/auditNlpTokenization");
const { parseArgs: parseNlpSuggestionArgs } = require("../scripts/validateNlpSuggestions");
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

test("prepareDeck parseArgs records unsupported flags, json mode, and strict override", () => {
    const options = parsePrepareArgs(["--levels=5,4", "--json", "--allow-export-fallbacks", "--oops"]);

    assert.deepEqual(options.levels, [5, 4]);
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

test("buildArtifacts parseArgs records unsupported flags and export issue gates", () => {
    const options = parseBuildArtifactsArgs(["--levels=5,4", "--skip-media-sync", "--fail-on-export-issues", "--max-fallback-ratio=0.05", "--oops"]);

    assert.deepEqual(options.levels, [5, 4]);
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

test("NLP governance gate parseArgs records all gate inputs", () => {
    const options = parseNlpGovernanceGateArgs([
        "--manifest=templates/nlp_model_manifest.json",
        "--suggestions-dir=out/nlp-suggestions",
        "--tokenization-dir=out/nlp-tokenization",
        "--workspace-root=.",
        "--package-json=package.json",
        "--package-lock=package-lock.json",
        "--json",
        "--oops",
    ]);

    assert.equal(options.manifestPath, "templates/nlp_model_manifest.json");
    assert.equal(options.suggestionArtifactDir, "out/nlp-suggestions");
    assert.equal(options.tokenizationArtifactDir, "out/nlp-tokenization");
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
