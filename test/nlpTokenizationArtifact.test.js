const test = require("node:test");
const assert = require("node:assert/strict");

const {
    NLP_TOKENIZATION_AUTHORITY,
    parseNlpTokenizationArtifact,
} = require("../src/datasets/nlpTokenizationArtifact");

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
            tokens: [
                {
                    surface: "日本",
                    start: 0,
                    end: 2,
                    lemma: "日本",
                    reading: "ニホン",
                    partOfSpeech: ["名詞"],
                    known: true,
                },
                {
                    surface: "語",
                    start: 2,
                    end: 3,
                    lemma: "語",
                    reading: "ゴ",
                    partOfSpeech: ["名詞"],
                    known: true,
                },
            ],
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

test("parseNlpTokenizationArtifact accepts strict assistive-only tokenization batches", () => {
    const parsed = parseNlpTokenizationArtifact(buildArtifact());
    assert.equal(parsed.authority.outputAuthority, "assistive_only");
    assert.equal(parsed.authority.writesTrackedTemplates, false);
    assert.equal(parsed.items[0].tokens.length, 2);
});

test("parseNlpTokenizationArtifact allows empty batches without a runtime id", () => {
    const parsed = parseNlpTokenizationArtifact(buildArtifact({
        generator: { runtimeId: undefined },
        items: [],
    }));

    assert.equal(parsed.generator.runtimeId, undefined);
    assert.equal(parsed.items.length, 0);
});

test("parseNlpTokenizationArtifact rejects certification authority", () => {
    assert.throws(() => parseNlpTokenizationArtifact(buildArtifact({
        authority: { certifiesCards: true },
    })), /Invalid input/);
});

test("parseNlpTokenizationArtifact rejects unbound or mismatched runtime evidence", () => {
    assert.throws(() => parseNlpTokenizationArtifact(buildArtifact({
        generator: { runtimeId: undefined },
    })), /must declare generator.runtimeId/);

    assert.throws(() => parseNlpTokenizationArtifact(buildArtifact({
        runtime: { runtimeId: "otherRuntime" },
    })), /does not match runtime evidence/);
});

test("parseNlpTokenizationArtifact rejects duplicate, out-of-scope, and unbound word items", () => {
    assert.throws(() => parseNlpTokenizationArtifact(buildArtifact({
        items: [
            buildArtifact().items[0],
            buildArtifact().items[0],
        ],
    })), /Duplicate NLP tokenization item id/);

    assert.throws(() => parseNlpTokenizationArtifact(buildArtifact({
        items: [{
            ...buildArtifact().items[0],
            target: {
                kind: "word-card",
                deckKind: "word",
                level: 4,
                written: "日本語",
                reading: "にほんご",
            },
        }],
    })), /outside artifact levels/);

    assert.throws(() => parseNlpTokenizationArtifact(buildArtifact({
        items: [{
            ...buildArtifact().items[0],
            target: {
                kind: "word-card",
                deckKind: "word",
                level: 5,
                written: "日本語",
            },
        }],
    })), /must bind target.reading/);
});

test("parseNlpTokenizationArtifact rejects non-contiguous or mismatched token spans", () => {
    assert.throws(() => parseNlpTokenizationArtifact(buildArtifact({
        items: [{
            ...buildArtifact().items[0],
            tokens: [{
                ...buildArtifact().items[0].tokens[0],
                start: 1,
            }],
        }],
    })), /non-contiguous token start/);

    assert.throws(() => parseNlpTokenizationArtifact(buildArtifact({
        items: [{
            ...buildArtifact().items[0],
            tokens: [{
                ...buildArtifact().items[0].tokens[0],
                surface: "語",
            }],
        }],
    })), /does not match surface/);
});
