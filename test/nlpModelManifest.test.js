const test = require("node:test");
const assert = require("node:assert/strict");

const {
    loadNlpModelManifest,
    parseNlpModelManifest,
} = require("../src/datasets/nlpModelManifest");

function buildManifest(overrides = {}) {
    return {
        version: 1,
        checkedAt: "2026-05-20",
        policy: {
            authority: "assistive_only",
            description: "Fixture policy.",
            allowedUses: ["assistive-candidate-discovery", "assistive-example-reranking"],
            disallowedUses: ["direct-template-write", "gold-approval", "platinum-approval", "obsidian-certification", "release-readiness-claim"],
            promotionPolicy: "human_review_required",
        },
        runtimes: {
            fixtureRuntime: {
                name: "Fixture runtime",
                status: "active",
                runtimeType: "javascript",
                packageName: "fixture-runtime",
                packageVersion: "1.0.0",
                packageIntegrity: "sha512-fixture",
                origin: {
                    url: "https://example.com/runtime",
                },
                licenseUse: {
                    status: "approved",
                    license: "Fixture",
                    notes: "Fixture approved.",
                },
                allowedTasks: ["embedding", "reranking"],
                checkedAt: "2026-05-20",
            },
        },
        models: {
            fixtureModel: {
                name: "Fixture model",
                status: "active",
                runtimeId: "fixtureRuntime",
                task: "embedding",
                modelFamily: "fixture",
                modelVersion: "1.0.0",
                origin: {
                    url: "https://example.com/model",
                },
                licenseUse: {
                    status: "approved",
                    license: "Fixture",
                    notes: "Fixture approved.",
                },
                allowedUses: ["assistive-candidate-discovery"],
                disallowedUses: ["direct-template-write"],
                outputAuthority: "assistive_only",
                promotionPolicy: "human_review_required",
                deterministic: {
                    requiresPinnedModel: true,
                    requiresPinnedInputs: true,
                    requiresPinnedRuntime: true,
                    seedPolicy: "not-applicable",
                },
                checkedAt: "2026-05-20",
                localArtifact: {
                    path: "models/fixture.onnx",
                    sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                    byteSize: 128,
                },
                evaluation: {
                    benchmarkId: "fixture-benchmark",
                    benchmarkPath: "test/fixtures/fixture.json",
                    evaluatedAt: "2026-05-20",
                    metrics: {
                        accuracy: 1,
                    },
                    limitations: ["Fixture only."],
                },
            },
        },
        ...overrides.manifest,
    };
}

test("parseNlpModelManifest validates active model governance", () => {
    const parsed = parseNlpModelManifest(buildManifest());
    assert.equal(parsed.policy.authority, "assistive_only");
    assert.equal(parsed.models.fixtureModel.status, "active");

    assert.throws(() => parseNlpModelManifest(buildManifest({
        manifest: {
            models: {
                fixtureModel: {
                    ...buildManifest().models.fixtureModel,
                    runtimeId: "missingRuntime",
                },
            },
        },
    })), /references missing runtime/);

    assert.throws(() => parseNlpModelManifest(buildManifest({
        manifest: {
            models: {
                fixtureModel: {
                    ...buildManifest().models.fixtureModel,
                    task: "tokenization",
                },
            },
        },
    })), /does not allow it/);

    assert.throws(() => parseNlpModelManifest(buildManifest({
        manifest: {
            models: {
                fixtureModel: {
                    ...buildManifest().models.fixtureModel,
                    localArtifact: undefined,
                },
            },
        },
    })), /must pin a local model artifact/);

    assert.throws(() => parseNlpModelManifest(buildManifest({
        manifest: {
            models: {
                fixtureModel: {
                    ...buildManifest().models.fixtureModel,
                    localArtifact: {
                        artifactKind: "directory",
                        path: "models/fixture",
                        sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                        byteSize: 128,
                    },
                },
            },
        },
    })), /directory artifact must pin fileCount/);

    assert.throws(() => parseNlpModelManifest(buildManifest({
        manifest: {
            models: {
                fixtureModel: {
                    ...buildManifest().models.fixtureModel,
                    evaluation: undefined,
                },
            },
        },
    })), /must include tracked evaluation evidence/);

    assert.throws(() => parseNlpModelManifest(buildManifest({
        manifest: {
            models: {
                fixtureModel: {
                    ...buildManifest().models.fixtureModel,
                    allowedUses: ["assistive-sense-fit-audit"],
                },
            },
        },
    })), /global NLP policy does not allow/);
});

test("parseNlpModelManifest requires pinned active runtime evidence", () => {
    assert.throws(() => parseNlpModelManifest(buildManifest({
        manifest: {
            runtimes: {
                fixtureRuntime: {
                    ...buildManifest().runtimes.fixtureRuntime,
                    packageVersion: undefined,
                },
            },
        },
    })), /must declare packageVersion/);

    assert.throws(() => parseNlpModelManifest(buildManifest({
        manifest: {
            runtimes: {
                fixtureRuntime: {
                    ...buildManifest().runtimes.fixtureRuntime,
                    packageIntegrity: undefined,
                },
            },
        },
    })), /must declare packageIntegrity/);

    assert.throws(() => parseNlpModelManifest(buildManifest({
        manifest: {
            runtimes: {
                fixtureRuntime: {
                    ...buildManifest().runtimes.fixtureRuntime,
                    allowedTasks: ["tokenization"],
                },
            },
            models: {},
        },
    })), /must pin dictionary evidence/);
});

test("tracked NLP model manifest loads with assistive-only boundaries", () => {
    const manifest = loadNlpModelManifest();
    assert.equal(manifest.policy.authority, "assistive_only");
    assert.equal(manifest.policy.promotionPolicy, "human_review_required");
    assert.equal(Object.keys(manifest.models).length, 0);
    assert.equal(manifest.runtimes["transformers-js"].status, "active");
    assert.equal(manifest.runtimes["transformers-js"].packageVersion, "4.2.0");
    assert.equal(manifest.runtimes["onnxruntime-node"].status, "registered");
    assert.equal(manifest.runtimes["kuromoji-js"].status, "active");
    assert.equal(manifest.runtimes["kuromoji-js"].packageVersion, "0.1.2");
    assert.equal(manifest.runtimes["kuromoji-js"].dictionary.fileCount, 12);
});
