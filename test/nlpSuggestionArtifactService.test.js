const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    NLP_SUGGESTION_AUTHORITY,
    NLP_SUGGESTION_PROMOTION_POLICY,
} = require("../src/datasets/nlpSuggestionArtifact");
const {
    buildNlpSuggestionArtifactReport,
    formatNlpSuggestionArtifactReport,
    resolveNlpSuggestionArtifactPaths,
} = require("../src/services/nlpSuggestionArtifactService");

function buildManifest(modelOverrides = {}) {
    return {
        manifestPath: "templates/nlp_model_manifest.json",
        models: {
            fixtureModel: {
                status: "active",
                allowedUses: ["assistive-example-reranking"],
                outputAuthority: "assistive_only",
                promotionPolicy: "human_review_required",
                ...modelOverrides,
            },
        },
    };
}

function buildArtifact(overrides = {}) {
    const artifact = {
        version: 1,
        artifactType: "nlp_suggestion_batch",
        generatedAt: "2026-05-20T00:00:00.000Z",
        generator: {
            modelId: "fixtureModel",
            runId: "fixture-run",
            manifestPath: "templates/nlp_model_manifest.json",
            createdBy: "test fixture",
            inputHashes: [{
                path: "out/word.tsv",
                sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                byteSize: 128,
            }],
        },
        authority: { ...NLP_SUGGESTION_AUTHORITY },
        scope: {
            deckKind: "word",
            levels: [5],
            lane: "assistive-example-reranking",
        },
        suggestions: [{
            id: "n5-word-example-001",
            task: "assistive-example-reranking",
            action: "rank",
            target: {
                deckKind: "word",
                level: 5,
                written: "日本",
                reading: "にほん",
            },
            score: 0.88,
            rank: 1,
            summary: "Review example ranking.",
            rationale: "Fixture rationale.",
            evidence: [{
                sourceType: "generated-row",
                sourceId: "日本|にほん",
                note: "Fixture generated row identity.",
            }],
            limitations: ["Fixture only."],
            promotion: { ...NLP_SUGGESTION_PROMOTION_POLICY },
        }],
    };

    return {
        ...artifact,
        ...overrides,
        generator: {
            ...artifact.generator,
            ...(overrides.generator || {}),
        },
        authority: {
            ...artifact.authority,
            ...(overrides.authority || {}),
        },
        scope: {
            ...artifact.scope,
            ...(overrides.scope || {}),
        },
    };
}

function writeArtifact(dir, name, artifact) {
    const filePath = path.join(dir, name);
    fs.writeFileSync(filePath, `${JSON.stringify(artifact, null, 2)}\n`);
    return filePath;
}

test("resolveNlpSuggestionArtifactPaths treats a missing suggestion directory as empty", () => {
    const missingDir = path.join(os.tmpdir(), `missing-nlp-suggestions-${Date.now()}`);
    const resolved = resolveNlpSuggestionArtifactPaths({ artifactDir: missingDir });

    assert.equal(resolved.missingArtifactDir, true);
    assert.deepEqual(resolved.artifactPaths, []);
});

test("buildNlpSuggestionArtifactReport validates governed suggestion artifacts", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-suggestions-"));
    writeArtifact(dir, "suggestions.json", buildArtifact());

    const report = buildNlpSuggestionArtifactReport({
        artifactDir: dir,
        loadManifestFn: () => buildManifest(),
    });

    assert.equal(report.passed, true);
    assert.equal(report.counts.artifacts, 1);
    assert.equal(report.counts.suggestions, 1);
    assert.equal(report.counts.suggestionsByTask["assistive-example-reranking"], 1);
    assert.equal(report.releaseBoundary.suggestionArtifactsAreCertificationEvidence, false);
});

test("buildNlpSuggestionArtifactReport fails inactive or under-authorized models", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-suggestions-"));
    writeArtifact(dir, "suggestions.json", buildArtifact());

    const inactive = buildNlpSuggestionArtifactReport({
        artifactDir: dir,
        loadManifestFn: () => buildManifest({ status: "registered" }),
    });

    assert.equal(inactive.passed, false);
    assert.match(inactive.errors.join("\n"), /require an active model/);

    const wrongUse = buildNlpSuggestionArtifactReport({
        artifactDir: dir,
        loadManifestFn: () => buildManifest({ allowedUses: ["assistive-sense-fit-audit"] }),
    });

    assert.equal(wrongUse.passed, false);
    assert.match(wrongUse.errors.join("\n"), /does not allow artifact lane/);
});

test("buildNlpSuggestionArtifactReport reports invalid artifact JSON without throwing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-suggestions-"));
    fs.writeFileSync(path.join(dir, "broken.json"), "{ nope");

    const report = buildNlpSuggestionArtifactReport({
        artifactDir: dir,
        loadManifestFn: () => buildManifest(),
    });

    assert.equal(report.passed, false);
    assert.match(report.errors.join("\n"), /Expected property name/);
});

test("formatNlpSuggestionArtifactReport renders the release boundary", () => {
    const text = formatNlpSuggestionArtifactReport({
        passed: true,
        manifestPath: "templates/nlp_model_manifest.json",
        artifactDir: "out/nlp-suggestions",
        missingArtifactDir: true,
        counts: {
            artifacts: 0,
            suggestions: 0,
            suggestionsByTask: {},
            suggestionsByDeckKind: {},
        },
        artifacts: [],
        errors: [],
        releaseBoundary: {
            suggestionArtifactsAreCertificationEvidence: false,
            suggestionArtifactsMayWriteTrackedTemplatesDirectly: false,
            promotionRequiresHumanReview: true,
        },
    });

    assert.match(text, /NLP Suggestion Artifact Validation/);
    assert.match(text, /suggestion artifacts certify cards: no/);
    assert.match(text, /human promotion required: yes/);
});
