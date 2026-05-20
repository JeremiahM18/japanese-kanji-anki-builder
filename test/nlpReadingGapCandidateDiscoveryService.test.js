const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildCandidateInput,
    buildGapIntentInput,
    buildNlpReadingGapCandidateArtifact,
    collectScoredCandidates,
    writeNlpReadingGapCandidateArtifact,
} = require("../src/services/nlpReadingGapCandidateDiscoveryService");
const {
    buildNlpSuggestionArtifactReport,
} = require("../src/services/nlpSuggestionArtifactService");

function buildManifest() {
    return {
        manifestPath: "templates/nlp_model_manifest.json",
        models: {
            fixtureEmbeddingModel: {
                status: "active",
                runtimeId: "transformers-js",
                task: "embedding",
                modelFamily: "fixture-family",
                modelVersion: "fixture-version",
                origin: {
                    huggingFaceModelId: "fixture/model",
                },
                licenseUse: {
                    status: "approved",
                    license: "Apache-2.0",
                    notes: "Fixture approved.",
                },
                allowedUses: ["assistive-candidate-discovery"],
                outputAuthority: "assistive_only",
                promotionPolicy: "human_review_required",
                embeddingConfig: {
                    embeddingDimension: 3,
                    pooling: "mean",
                    normalized: true,
                    distanceMetric: "cosine",
                    dtype: "q8",
                },
            },
        },
    };
}

function writeManifest(dir) {
    const manifestPath = path.join(dir, "nlp_model_manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(buildManifest(), null, 2));
    return manifestPath;
}

function buildGapPlan() {
    return {
        levelLabel: "N4",
        summary: {
            totalTriageItems: 1,
            activePlanItems: 1,
        },
        items: [{
            rank: 1,
            kanji: "所",
            displayWord: "所",
            readingType: "on",
            reading: "しょ",
            priority: "high",
            suggestedAction: "editorial_review",
            reason: "needs a learner-facing governed support word",
            editorialNote: "Fixture note: human review required.",
            suggestedWordCandidates: [{
                written: "場所",
                reading: "ばしょ",
                meaning: "place",
                source: "tracked_word",
                action: "extend_existing_word_contract",
                score: 167,
                reason: "already tracked; add explicit coverage intent",
                quality: "strong",
                constituentKanji: ["場", "所"],
                scoreBreakdown: [{ key: "tracked_word_contract", value: 45 }],
            }],
        }],
        kanjiClusters: [],
    };
}

test("reading-gap discovery inputs preserve gap and candidate context", () => {
    const plan = buildGapPlan();
    const gapInput = buildGapIntentInput(plan.items[0]);
    const candidateInput = buildCandidateInput({
        candidate: plan.items[0].suggestedWordCandidates[0],
    });

    assert.match(gapInput, /reading gap kanji: 所/);
    assert.match(gapInput, /target reading: しょ/);
    assert.match(candidateInput, /candidate word: 場所/);
    assert.match(candidateInput, /candidate meaning: place/);
});

test("collectScoredCandidates combines model and gap-plan scores", async () => {
    const scored = await collectScoredCandidates({
        gapPlan: buildGapPlan(),
        embedTextFn: async (input) => input.includes("candidate word") ? [1, 0, 0] : [1, 0, 0],
    });

    assert.equal(scored.length, 1);
    assert.equal(scored[0].candidate.written, "場所");
    assert.ok(scored[0].combinedScore > scored[0].planScore);
});

test("buildNlpReadingGapCandidateArtifact emits governed candidate suggestions", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-reading-gap-"));
    const manifestPath = writeManifest(dir);
    const artifact = await buildNlpReadingGapCandidateArtifact({
        gapPlan: buildGapPlan(),
        inputHashes: [{
            path: "out/word-build/exports/jlpt-n4-words.tsv",
            sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            byteSize: 128,
        }],
        manifestPath,
        workspaceRoot: dir,
        level: 4,
        modelId: "fixtureEmbeddingModel",
        now: () => new Date("2026-05-20T00:00:00.000Z"),
        loadManifestFn: () => ({
            ...buildManifest(),
            manifestPath,
        }),
        buildEmbedTextFn: async () => async (input) => input.includes("candidate word") ? [1, 0, 0] : [1, 0, 0],
    });

    assert.equal(artifact.scope.lane, "assistive-candidate-discovery");
    assert.equal(artifact.suggestions.length, 1);
    assert.equal(artifact.suggestions[0].action, "candidate");
    assert.equal(artifact.suggestions[0].target.written, "場所");
    assert.equal(artifact.suggestions[0].target.reading, "ばしょ");
    assert.equal(artifact.suggestions[0].evidence.some((entry) => entry.sourceType === "human-note"), true);
    assert.equal(artifact.authority.certifiesCards, false);
});

test("writeNlpReadingGapCandidateArtifact writes artifacts accepted by the validator", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-reading-gap-"));
    const manifestPath = writeManifest(dir);
    const outPath = path.join(dir, "suggestions.json");
    const result = await writeNlpReadingGapCandidateArtifact({
        gapPlan: buildGapPlan(),
        outPath,
        manifestPath,
        workspaceRoot: dir,
        level: 4,
        modelId: "fixtureEmbeddingModel",
        now: () => new Date("2026-05-20T00:00:00.000Z"),
        loadManifestFn: () => ({
            ...buildManifest(),
            manifestPath,
        }),
        buildEmbedTextFn: async () => async (input) => input.includes("candidate word") ? [1, 0, 0] : [1, 0, 0],
    });
    const report = buildNlpSuggestionArtifactReport({
        artifactPath: result.outPath,
        loadManifestFn: () => buildManifest(),
    });

    assert.equal(fs.existsSync(outPath), true);
    assert.equal(report.passed, true);
    assert.equal(report.counts.suggestions, 1);
});
