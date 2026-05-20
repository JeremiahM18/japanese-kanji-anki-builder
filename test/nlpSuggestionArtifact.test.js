const test = require("node:test");
const assert = require("node:assert/strict");

const {
    NLP_SUGGESTION_AUTHORITY,
    NLP_SUGGESTION_PROMOTION_POLICY,
    parseNlpSuggestionArtifact,
} = require("../src/datasets/nlpSuggestionArtifact");

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

test("parseNlpSuggestionArtifact accepts strict assistive-only suggestion batches", () => {
    const parsed = parseNlpSuggestionArtifact(buildArtifact());
    assert.equal(parsed.authority.outputAuthority, "assistive_only");
    assert.equal(parsed.authority.writesTrackedTemplates, false);
    assert.equal(parsed.suggestions[0].promotion.certificationEvidence, false);
});

test("parseNlpSuggestionArtifact allows empty batches without a model id", () => {
    const parsed = parseNlpSuggestionArtifact(buildArtifact({
        generator: { modelId: undefined },
        suggestions: [],
    }));

    assert.equal(parsed.generator.modelId, undefined);
    assert.equal(parsed.suggestions.length, 0);
});

test("parseNlpSuggestionArtifact rejects direct release authority", () => {
    assert.throws(() => parseNlpSuggestionArtifact(buildArtifact({
        authority: { writesTrackedTemplates: true },
    })), /Invalid input/);

    assert.throws(() => parseNlpSuggestionArtifact(buildArtifact({
        suggestions: [{
            ...buildArtifact().suggestions[0],
            promotion: {
                ...NLP_SUGGESTION_PROMOTION_POLICY,
                certificationEvidence: true,
            },
        }],
    })), /Invalid input/);
});

test("parseNlpSuggestionArtifact rejects unbound, duplicate, and out-of-scope suggestions", () => {
    assert.throws(() => parseNlpSuggestionArtifact(buildArtifact({
        generator: { modelId: undefined },
    })), /must declare generator.modelId/);

    assert.throws(() => parseNlpSuggestionArtifact(buildArtifact({
        suggestions: [
            buildArtifact().suggestions[0],
            buildArtifact().suggestions[0],
        ],
    })), /Duplicate NLP suggestion id/);

    assert.throws(() => parseNlpSuggestionArtifact(buildArtifact({
        suggestions: [{
            ...buildArtifact().suggestions[0],
            task: "assistive-sense-fit-audit",
        }],
    })), /artifact lane/);

    assert.throws(() => parseNlpSuggestionArtifact(buildArtifact({
        suggestions: [{
            ...buildArtifact().suggestions[0],
            target: {
                deckKind: "word",
                level: 5,
                written: "日本",
            },
        }],
    })), /must bind target.reading/);
});
