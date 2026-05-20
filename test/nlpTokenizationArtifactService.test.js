const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    NLP_TOKENIZATION_AUTHORITY,
} = require("../src/datasets/nlpTokenizationArtifact");
const {
    buildNlpTokenizationArtifactReport,
    formatNlpTokenizationArtifactReport,
    resolveNlpTokenizationArtifactPaths,
} = require("../src/services/nlpTokenizationArtifactService");

function buildManifest(runtimeOverrides = {}) {
    return {
        manifestPath: "templates/nlp_model_manifest.json",
        runtimes: {
            fixtureTokenizer: {
                status: "active",
                runtimeType: "javascript",
                packageName: "fixture-tokenizer",
                allowedTasks: ["tokenization"],
                licenseUse: {
                    status: "approved",
                    notes: "Fixture approved.",
                },
                ...runtimeOverrides,
            },
        },
    };
}

function buildArtifact(overrides = {}) {
    const artifact = {
        version: 1,
        artifactType: "nlp_tokenization_batch",
        generatedAt: "2026-05-20T00:00:00.000Z",
        generator: {
            runtimeId: "fixtureTokenizer",
            runId: "fixture-run",
            manifestPath: "templates/nlp_model_manifest.json",
            createdBy: "test fixture",
            inputHashes: [{
                path: "out/word.tsv",
                sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                byteSize: 128,
            }],
        },
        runtime: {
            runtimeId: "fixtureTokenizer",
            tokenizerKind: "fixture",
            packageName: "fixture-tokenizer",
            dictionaryId: "fixture-dictionary",
            deterministic: {
                requiresPinnedRuntime: true,
                requiresPinnedDictionary: true,
                requiresPinnedInputs: true,
            },
        },
        authority: { ...NLP_TOKENIZATION_AUTHORITY },
        scope: {
            targetKind: "word-card",
            levels: [5],
            source: "generated-word-rows",
        },
        items: [{
            id: "n5-word-token-001",
            target: {
                kind: "word-card",
                deckKind: "word",
                level: 5,
                written: "日本語",
                reading: "にほんご",
            },
            inputText: "日本語",
            tokens: [{
                surface: "日本語",
                start: 0,
                end: 3,
                lemma: "日本語",
                reading: "ニホンゴ",
                partOfSpeech: ["名詞"],
                known: true,
            }],
            limitations: ["Fixture tokenization only."],
        }],
    };

    return {
        ...artifact,
        ...overrides,
        generator: {
            ...artifact.generator,
            ...(overrides.generator || {}),
        },
        runtime: {
            ...artifact.runtime,
            ...(overrides.runtime || {}),
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

test("resolveNlpTokenizationArtifactPaths treats a missing tokenization directory as empty", () => {
    const missingDir = path.join(os.tmpdir(), `missing-nlp-tokenization-${Date.now()}`);
    const resolved = resolveNlpTokenizationArtifactPaths({ artifactDir: missingDir });

    assert.equal(resolved.missingArtifactDir, true);
    assert.deepEqual(resolved.artifactPaths, []);
});

test("buildNlpTokenizationArtifactReport validates governed tokenization artifacts", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-tokenization-"));
    writeArtifact(dir, "tokens.json", buildArtifact());

    const report = buildNlpTokenizationArtifactReport({
        artifactDir: dir,
        loadManifestFn: () => buildManifest(),
    });

    assert.equal(report.passed, true);
    assert.equal(report.counts.artifacts, 1);
    assert.equal(report.counts.items, 1);
    assert.equal(report.counts.tokens, 1);
    assert.equal(report.counts.itemsByTargetKind["word-card"], 1);
    assert.equal(report.releaseBoundary.tokenizationArtifactsAreCertificationEvidence, false);
});

test("buildNlpTokenizationArtifactReport fails inactive or unapproved runtimes", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-tokenization-"));
    writeArtifact(dir, "tokens.json", buildArtifact());

    const inactive = buildNlpTokenizationArtifactReport({
        artifactDir: dir,
        loadManifestFn: () => buildManifest({ status: "registered" }),
    });

    assert.equal(inactive.passed, false);
    assert.match(inactive.errors.join("\n"), /require an active runtime/);

    const unapproved = buildNlpTokenizationArtifactReport({
        artifactDir: dir,
        loadManifestFn: () => buildManifest({
            licenseUse: {
                status: "needs_review",
                notes: "Fixture review pending.",
            },
        }),
    });

    assert.equal(unapproved.passed, false);
    assert.match(unapproved.errors.join("\n"), /approved license\/use/);
});

test("buildNlpTokenizationArtifactReport reports invalid tokenization JSON without throwing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-tokenization-"));
    fs.writeFileSync(path.join(dir, "broken.json"), "{ nope");

    const report = buildNlpTokenizationArtifactReport({
        artifactDir: dir,
        loadManifestFn: () => buildManifest(),
    });

    assert.equal(report.passed, false);
    assert.match(report.errors.join("\n"), /Expected property name/);
});

test("formatNlpTokenizationArtifactReport renders the release boundary", () => {
    const text = formatNlpTokenizationArtifactReport({
        passed: true,
        manifestPath: "templates/nlp_model_manifest.json",
        artifactDir: "out/nlp-tokenization",
        missingArtifactDir: true,
        counts: {
            artifacts: 0,
            items: 0,
            tokens: 0,
            itemsByTargetKind: {},
        },
        artifacts: [],
        errors: [],
        releaseBoundary: {
            tokenizationArtifactsAreCertificationEvidence: false,
            tokenizationArtifactsMayWriteTrackedTemplatesDirectly: false,
            promotionRequiresHumanReview: true,
        },
    });

    assert.match(text, /NLP Tokenization Artifact Validation/);
    assert.match(text, /tokenization artifacts certify cards: no/);
    assert.match(text, /human promotion required: yes/);
});
