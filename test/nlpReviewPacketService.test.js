const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildNlpReviewPacketArtifactFromSignals,
    formatNlpReviewPacketMarkdown,
    writeNlpReviewPacketArtifact,
} = require("../src/services/nlpReviewPacketService");
const {
    buildNlpReviewPacketArtifactReport,
} = require("../src/services/nlpReviewPacketArtifactService");

function buildSuggestionRef() {
    return {
        target: {
            deckKind: "word",
            level: 5,
            written: "日本語",
            reading: "にほんご",
        },
        ref: {
            id: "n5-word-sense-fit-0001",
            task: "assistive-sense-fit-audit",
            action: "warn",
            score: 0.8,
            summary: "Review possible sense-fit issue for 日本語|にほんご.",
            rationale: "Fixture rationale.",
            sourceArtifactPath: "out/nlp-suggestions/fixture.json",
            evidenceDigest: ["generated-row 日本語|にほんご: fixture evidence"],
            limitations: ["Fixture suggestion only."],
        },
    };
}

function buildTokenizationRef() {
    return {
        target: {
            kind: "word-card",
            deckKind: "word",
            level: 5,
            written: "日本語",
            reading: "にほんご",
        },
        ref: {
            id: "n5-word-tokenization-0001",
            reviewPriority: "attention",
            signalKinds: ["routine-tokenization-review", "multi-token-surface"],
            surface: "日本語",
            tokenSurfaces: ["日本", "語"],
            normalizedTokenReading: "にほんご",
            normalizedCardReading: "にほんご",
            readingAlignment: {
                comparable: true,
                matches: true,
            },
            sourceArtifactPath: "out/nlp-tokenization/fixture.json",
            limitations: ["Fixture tokenization only."],
        },
    };
}

test("buildNlpReviewPacketArtifactFromSignals aggregates suggestions and tokenization signals", () => {
    const artifact = buildNlpReviewPacketArtifactFromSignals({
        suggestionRefs: [buildSuggestionRef()],
        tokenizationSignalRefs: [buildTokenizationRef()],
        inputHashes: [{
            path: "out/nlp-suggestions/fixture.json",
            sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            byteSize: 128,
        }],
        now: () => new Date("2026-05-20T00:00:00.000Z"),
    });

    assert.equal(artifact.artifactType, "nlp_review_packet_batch");
    assert.equal(artifact.counts.packets, 1);
    assert.equal(artifact.counts.suggestions, 1);
    assert.equal(artifact.counts.tokenizationSignals, 1);
    assert.equal(artifact.packets[0].priority, "attention");
    assert.equal(artifact.packets[0].target.reading, "にほんご");
    assert.match(artifact.packets[0].reviewChecklist.join("\n"), /exact written and reading identity/);
    assert.equal(artifact.authority.certifiesCards, false);
});

test("formatNlpReviewPacketMarkdown renders packet boundaries and checklist", () => {
    const artifact = buildNlpReviewPacketArtifactFromSignals({
        suggestionRefs: [buildSuggestionRef()],
        tokenizationSignalRefs: [],
        inputHashes: [{
            path: "out/nlp-suggestions/fixture.json",
            sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            byteSize: 128,
        }],
        now: () => new Date("2026-05-20T00:00:00.000Z"),
    });
    const markdown = formatNlpReviewPacketMarkdown(artifact);

    assert.match(markdown, /NLP Human Review Packets/);
    assert.match(markdown, /Review packets certify cards: no/);
    assert.match(markdown, /日本語 \(にほんご\)/);
});

test("writeNlpReviewPacketArtifact writes artifacts accepted by the validator", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-review-packets-"));
    const outPath = path.join(dir, "packets.json");
    const markdownOutPath = path.join(dir, "packets.md");
    const result = writeNlpReviewPacketArtifact({
        outPath,
        markdownOutPath,
        now: () => new Date("2026-05-20T00:00:00.000Z"),
        buildSuggestionReportFn: () => ({ passed: true, errors: [] }),
        buildTokenizationAuditReportFn: () => ({
            passed: true,
            errors: [],
            artifacts: [],
            signals: [],
        }),
        resolveSuggestionArtifactPathsFn: () => ({ artifactPaths: [], missingArtifactDir: true, artifactDir: dir }),
    });
    const report = buildNlpReviewPacketArtifactReport({
        artifactPath: result.outPath,
    });

    assert.equal(fs.existsSync(outPath), true);
    assert.equal(fs.existsSync(markdownOutPath), true);
    assert.equal(report.passed, true);
    assert.equal(report.counts.packets, 0);
});
