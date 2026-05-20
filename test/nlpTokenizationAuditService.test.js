const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    NLP_TOKENIZATION_AUTHORITY,
} = require("../src/datasets/nlpTokenizationArtifact");
const {
    buildNlpTokenizationAuditReport,
    buildReviewSignal,
    formatNlpTokenizationAuditReport,
} = require("../src/services/nlpTokenizationAuditService");

function buildManifest() {
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

function writeArtifact(dir, name, artifact) {
    const filePath = path.join(dir, name);
    fs.writeFileSync(filePath, `${JSON.stringify(artifact, null, 2)}\n`);
    return filePath;
}

test("buildReviewSignal turns tokenization items into assistive review-packet signals", () => {
    const artifact = buildArtifact();
    const signal = buildReviewSignal({
        artifactPath: "out/nlp-tokenization/fixture.json",
        artifact,
        item: artifact.items[0],
    });

    assert.equal(signal.targetIdentity, "word-card|N5|日本語|にほんご");
    assert.equal(signal.reviewPriority, "attention");
    assert.deepEqual(signal.tokenSurfaces, ["日本", "語"]);
    assert.equal(signal.normalizedTokenReading, "にほんご");
    assert.equal(signal.readingAlignment.matches, true);
    assert.equal(signal.signalKinds.includes("multi-token-surface"), true);
    assert.equal(signal.authority.certifiesCards, false);
    assert.equal(signal.humanReviewRequired, true);
});

test("buildNlpTokenizationAuditReport summarizes review signals without certification authority", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-token-audit-"));
    writeArtifact(dir, "tokens.json", buildArtifact());

    const report = buildNlpTokenizationAuditReport({
        artifactDir: dir,
        loadManifestFn: () => buildManifest(),
    });

    assert.equal(report.passed, true);
    assert.equal(report.counts.artifacts, 1);
    assert.equal(report.counts.signals, 1);
    assert.equal(report.counts.attentionSignals, 1);
    assert.equal(report.counts.multiTokenItems, 1);
    assert.equal(report.counts.readingMismatchItems, 0);
    assert.equal(report.counts.signalsByKind["routine-tokenization-review"], 1);
    assert.equal(report.counts.signalsByKind["multi-token-surface"], 1);
    assert.equal(report.releaseBoundary.tokenizationAuditCertifiesCards, false);
    assert.equal(report.releaseBoundary.tokenizationAuditMayWriteTrackedTemplatesDirectly, false);
});

test("buildNlpTokenizationAuditReport flags unknown tokens and reading mismatches", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-token-audit-"));
    writeArtifact(dir, "tokens.json", buildArtifact({
        items: [{
            id: "n5-word-token-002",
            target: {
                kind: "word-card",
                deckKind: "word",
                level: 5,
                written: "謎",
                reading: "なぞ",
            },
            inputText: "謎",
            tokens: [{
                surface: "謎",
                start: 0,
                end: 1,
                lemma: "謎",
                reading: "メイ",
                partOfSpeech: ["名詞"],
                known: false,
            }],
            warnings: ["Fixture warning."],
            limitations: ["Fixture tokenization only."],
        }],
    }));

    const report = buildNlpTokenizationAuditReport({
        artifactDir: dir,
        loadManifestFn: () => buildManifest(),
    });

    assert.equal(report.passed, true);
    assert.equal(report.counts.unknownTokenItems, 1);
    assert.equal(report.counts.readingMismatchItems, 1);
    assert.equal(report.counts.warningItems, 1);
    assert.equal(report.signals[0].signalKinds.includes("unknown-token"), true);
    assert.equal(report.signals[0].signalKinds.includes("token-reading-card-reading-mismatch"), true);
    assert.equal(report.signals[0].signalKinds.includes("artifact-warning"), true);
});

test("buildNlpTokenizationAuditReport fails closed on invalid tokenization artifacts", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-token-audit-"));
    fs.writeFileSync(path.join(dir, "broken.json"), "{ nope");

    const report = buildNlpTokenizationAuditReport({
        artifactDir: dir,
        loadManifestFn: () => buildManifest(),
    });

    assert.equal(report.passed, false);
    assert.equal(report.signals.length, 0);
    assert.match(report.errors.join("\n"), /contains invalid JSON/);
});

test("formatNlpTokenizationAuditReport renders review signals and release boundaries", () => {
    const text = formatNlpTokenizationAuditReport({
        passed: true,
        manifestPath: "templates/nlp_model_manifest.json",
        artifactDir: "out/nlp-tokenization",
        missingArtifactDir: false,
        counts: {
            artifacts: 1,
            signals: 1,
            attentionSignals: 1,
            routineSignals: 0,
            multiTokenItems: 1,
            unknownTokenItems: 0,
            missingTokenReadingItems: 0,
            readingMismatchItems: 0,
            warningItems: 0,
            signalsByKind: {
                "routine-tokenization-review": 1,
                "multi-token-surface": 1,
            },
            signalsByLevel: {
                N5: 1,
            },
        },
        signals: [{
            targetIdentity: "word-card|N5|日本語|にほんご",
            reviewPriority: "attention",
            tokenSurfaces: ["日本", "語"],
            signalKinds: ["routine-tokenization-review", "multi-token-surface"],
        }],
        errors: [],
        releaseBoundary: {
            tokenizationAuditCertifiesCards: false,
            tokenizationAuditMayWriteTrackedTemplatesDirectly: false,
            tokenizationAuditClaimsReleaseReadiness: false,
            promotionRequiresHumanReview: true,
        },
    });

    assert.match(text, /NLP Tokenization Audit/);
    assert.match(text, /Review signals/);
    assert.match(text, /tokenization audit certifies cards: no/);
    assert.match(text, /human promotion required: yes/);
});
