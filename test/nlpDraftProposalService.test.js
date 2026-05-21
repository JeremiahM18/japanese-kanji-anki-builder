const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    NLP_DRAFT_PROPOSAL_AUTHORITY,
    parseNlpDraftProposalArtifact,
} = require("../src/datasets/nlpDraftProposalArtifact");
const {
    NLP_REVIEW_PACKET_AUTHORITY,
} = require("../src/datasets/nlpReviewPacketArtifact");
const {
    NLP_SUGGESTION_AUTHORITY,
    NLP_SUGGESTION_PROMOTION_POLICY,
} = require("../src/datasets/nlpSuggestionArtifact");
const {
    buildNlpDraftProposalArtifact,
    writeNlpDraftProposalArtifact,
} = require("../src/services/nlpDraftProposalService");
const {
    buildNlpDraftProposalArtifactReport,
} = require("../src/services/nlpDraftProposalArtifactService");

function buildManifest(modelOverrides = {}) {
    return {
        manifestPath: "templates/nlp_model_manifest.json",
        models: {
            fixtureModel: {
                status: "active",
                allowedUses: [
                    "assistive-example-reranking",
                    "assistive-draft-proposal",
                ],
                outputAuthority: "assistive_only",
                promotionPolicy: "human_review_required",
                ...modelOverrides,
            },
        },
    };
}

function writeJson(dir, name, value) {
    const filePath = path.join(dir, name);
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    return filePath;
}

function buildSuggestionArtifact() {
    return {
        version: 1,
        artifactType: "nlp_suggestion_batch",
        generatedAt: "2026-05-20T00:00:00.000Z",
        generator: {
            modelId: "fixtureModel",
            runId: "fixture-suggestion-run",
            manifestPath: "templates/nlp_model_manifest.json",
            createdBy: "test fixture",
            inputHashes: [{
                path: "out/word-build/exports/jlpt-n5-words.tsv",
                sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                byteSize: 128,
            }],
        },
        authority: { ...NLP_SUGGESTION_AUTHORITY },
        scope: {
            deckKind: "word",
            levels: [5],
            lane: "assistive-example-reranking",
            description: "Fixture suggestions.",
        },
        suggestions: [{
            id: "n5-word-example-0001",
            task: "assistive-example-reranking",
            action: "rank",
            target: {
                deckKind: "word",
                level: 5,
                written: "日本語",
                reading: "にほんご",
            },
            score: 0.92,
            rank: 1,
            summary: "Review example ranking for 日本語.",
            rationale: "Fixture embedding score surfaced this example for review.",
            evidence: [{
                sourceType: "corpus",
                sourceId: "sentence-fixture-1",
                path: "data/sentence_corpus.json",
                excerpt: "日本語を勉強します。 / にほんごをべんきょうします。 / I study Japanese.",
                note: "Fixture corpus candidate.",
            }, {
                sourceType: "model-score",
                sourceId: "fixtureModel",
                excerpt: "cosine=0.92",
                note: "Fixture model score.",
            }],
            limitations: ["Fixture suggestion only."],
            promotion: { ...NLP_SUGGESTION_PROMOTION_POLICY },
        }],
    };
}

function buildReviewPacketArtifact() {
    return {
        version: 1,
        artifactType: "nlp_review_packet_batch",
        generatedAt: "2026-05-20T00:00:00.000Z",
        generator: {
            createdBy: "test fixture",
            inputHashes: [{
                path: "out/nlp-tokenization/fixture.json",
                sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                byteSize: 128,
            }],
        },
        scope: {
            deckKind: "word",
            levels: [5],
            description: "Fixture review packets.",
        },
        authority: { ...NLP_REVIEW_PACKET_AUTHORITY },
        counts: {
            packets: 1,
            suggestions: 0,
            tokenizationSignals: 1,
            attentionPackets: 1,
            reviewPackets: 0,
            routinePackets: 0,
        },
        packets: [{
            id: "nlp-review-word-n5-0001",
            target: {
                deckKind: "word",
                level: 5,
                written: "日本語",
                reading: "にほんご",
            },
            priority: "attention",
            summary: "Review 日本語: tokenization attention signal.",
            reviewChecklist: ["Inspect token/card reading alignment."],
            suggestionRefs: [],
            tokenizationSignalRefs: [{
                id: "n5-word-tokenization-0001",
                reviewPriority: "attention",
                signalKinds: ["multi-token-surface"],
                surface: "日本語",
                tokenSurfaces: ["日本", "語"],
                normalizedTokenReading: "にほんご",
                normalizedCardReading: "にほんご",
                readingAlignment: {
                    comparable: true,
                    matches: true,
                },
                sourceArtifactPath: "out/nlp-tokenization/fixture.json",
                limitations: ["Fixture signal only."],
            }],
            limitations: ["Fixture review packet only."],
            authority: { ...NLP_REVIEW_PACKET_AUTHORITY },
        }],
    };
}

function buildKanjiCoverageGapReviewPacketArtifact() {
    return {
        version: 1,
        artifactType: "nlp_review_packet_batch",
        generatedAt: "2026-05-20T00:00:00.000Z",
        generator: {
            createdBy: "test fixture",
            inputHashes: [{
                path: "out/nlp-tokenization/kanji-n4-kuromoji.json",
                sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
                byteSize: 128,
            }],
        },
        scope: {
            deckKind: "kanji",
            levels: [4],
            description: "Fixture kanji review packets.",
        },
        authority: { ...NLP_REVIEW_PACKET_AUTHORITY },
        counts: {
            packets: 1,
            suggestions: 0,
            tokenizationSignals: 1,
            attentionPackets: 0,
            reviewPackets: 0,
            routinePackets: 1,
        },
        packets: [{
            id: "nlp-review-kanji-n4-0001",
            target: {
                deckKind: "kanji",
                level: 4,
                written: "曜",
                reading: "よう",
            },
            priority: "routine",
            summary: "Review 曜: tokenization coverage gap.",
            reviewChecklist: ["Treat kanji tokenizer coverage gaps as tokenizer evidence."],
            suggestionRefs: [],
            tokenizationSignalRefs: [{
                id: "n4-kanji-tokenization-0001",
                reviewPriority: "routine",
                signalKinds: [
                    "routine-tokenization-review",
                    "unknown-token",
                    "missing-token-reading",
                    "kanji-card-tokenizer-coverage-gap",
                    "artifact-warning",
                ],
                surface: "曜",
                tokenSurfaces: ["曜"],
                normalizedTokenReading: null,
                normalizedCardReading: "よう",
                readingAlignment: {
                    comparable: false,
                    matches: false,
                },
                sourceArtifactPath: "out/nlp-tokenization/kanji-n4-kuromoji.json",
                limitations: ["Fixture signal only."],
            }],
            limitations: ["Fixture review packet only."],
            authority: { ...NLP_REVIEW_PACKET_AUTHORITY },
        }],
    };
}

function buildWordSegmentationContextReviewPacketArtifact() {
    return {
        version: 1,
        artifactType: "nlp_review_packet_batch",
        generatedAt: "2026-05-20T00:00:00.000Z",
        generator: {
            createdBy: "test fixture",
            inputHashes: [{
                path: "out/nlp-tokenization/word-n5-kuromoji.json",
                sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
                byteSize: 128,
            }],
        },
        scope: {
            deckKind: "word",
            levels: [5],
            description: "Fixture word review packets.",
        },
        authority: { ...NLP_REVIEW_PACKET_AUTHORITY },
        counts: {
            packets: 1,
            suggestions: 0,
            tokenizationSignals: 1,
            attentionPackets: 0,
            reviewPackets: 0,
            routinePackets: 1,
        },
        packets: [{
            id: "nlp-review-word-n5-0001",
            target: {
                deckKind: "word",
                level: 5,
                written: "日本語",
                reading: "にほんご",
            },
            priority: "routine",
            summary: "Review 日本語: tokenization segmentation context.",
            reviewChecklist: ["Treat exact-reading word segmentation context as tokenizer evidence."],
            suggestionRefs: [],
            tokenizationSignalRefs: [{
                id: "n5-word-tokenization-0001",
                reviewPriority: "routine",
                signalKinds: [
                    "routine-tokenization-review",
                    "multi-token-surface",
                    "word-card-tokenizer-segmentation-context",
                ],
                surface: "日本語",
                tokenSurfaces: ["日本", "語"],
                normalizedTokenReading: "にほんご",
                normalizedCardReading: "にほんご",
                readingAlignment: {
                    comparable: true,
                    matches: true,
                },
                sourceArtifactPath: "out/nlp-tokenization/word-n5-kuromoji.json",
                limitations: ["Fixture signal only."],
            }],
            limitations: ["Fixture review packet only."],
            authority: { ...NLP_REVIEW_PACKET_AUTHORITY },
        }],
    };
}

test("buildNlpDraftProposalArtifact creates governed drafts from suggestions and review packets", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-drafts-"));
    const suggestionPath = writeJson(dir, "suggestions.json", buildSuggestionArtifact());
    const reviewPacketPath = writeJson(dir, "review-packets.json", buildReviewPacketArtifact());
    const manifestPath = writeJson(dir, "manifest.json", { fixture: true });

    const artifact = buildNlpDraftProposalArtifact({
        suggestionArtifactPath: suggestionPath,
        reviewPacketArtifactPath: reviewPacketPath,
        manifestPath,
        workspaceRoot: dir,
        now: () => new Date("2026-05-20T00:00:00.000Z"),
        loadManifestFn: () => buildManifest(),
        buildSuggestionReportFn: () => ({ passed: true, errors: [] }),
        buildReviewPacketReportFn: () => ({ passed: true, errors: [] }),
    });

    assert.equal(artifact.artifactType, "nlp_draft_proposal_batch");
    assert.equal(artifact.generator.modelIds[0], "fixtureModel");
    assert.equal(artifact.counts.proposals, 2);
    assert.equal(artifact.counts.proposalsByKind["example-candidate"], 1);
    assert.equal(artifact.counts.proposalsByKind["tokenization-review-note"], 1);
    assert.equal(artifact.authority.certifiesCards, false);
    assert.equal(artifact.authority.writesTrackedTemplates, false);

    const exampleDraft = artifact.proposals.find((proposal) => proposal.draftKind === "example-candidate");
    assert.equal(exampleDraft.proposedFields.exampleJapanese, "日本語を勉強します。");
    assert.equal(exampleDraft.sourceRefs.some((sourceRef) => sourceRef.sourceType === "corpus"), true);
    assert.equal(exampleDraft.sourceRefs.some((sourceRef) => sourceRef.sourceType === "model-score"), true);

    const tokenizationDraft = artifact.proposals.find((proposal) => proposal.draftKind === "tokenization-review-note");
    assert.equal(tokenizationDraft.sourceRefs.some((sourceRef) => sourceRef.sourceType === "tokenization-signal"), true);
    assert.match(tokenizationDraft.proposedFields.tokenizationReviewNoteDraft, /multi-token-surface/);
});

test("buildNlpDraftProposalArtifact does not draft routine kanji tokenizer coverage gaps", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-drafts-"));
    const suggestionPath = writeJson(dir, "suggestions.json", {
        ...buildSuggestionArtifact(),
        suggestions: [],
    });
    const reviewPacketPath = writeJson(dir, "kanji-review-packets.json", buildKanjiCoverageGapReviewPacketArtifact());
    const manifestPath = writeJson(dir, "manifest.json", { fixture: true });

    const artifact = buildNlpDraftProposalArtifact({
        suggestionArtifactPath: suggestionPath,
        reviewPacketArtifactPath: reviewPacketPath,
        manifestPath,
        workspaceRoot: dir,
        deckKind: "kanji",
        level: 4,
        now: () => new Date("2026-05-20T00:00:00.000Z"),
        loadManifestFn: () => buildManifest(),
        buildSuggestionReportFn: () => ({ passed: true, errors: [] }),
        buildReviewPacketReportFn: () => ({ passed: true, errors: [] }),
    });

    assert.deepEqual(artifact.generator.modelIds, []);
    assert.equal(artifact.counts.sourcePackets, 1);
    assert.equal(artifact.counts.proposals, 0);
    assert.deepEqual(artifact.proposals, []);
});

test("buildNlpDraftProposalArtifact does not draft routine word segmentation context", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-drafts-"));
    const suggestionPath = writeJson(dir, "suggestions.json", {
        ...buildSuggestionArtifact(),
        suggestions: [],
    });
    const reviewPacketPath = writeJson(dir, "word-review-packets.json", buildWordSegmentationContextReviewPacketArtifact());
    const manifestPath = writeJson(dir, "manifest.json", { fixture: true });

    const artifact = buildNlpDraftProposalArtifact({
        suggestionArtifactPath: suggestionPath,
        reviewPacketArtifactPath: reviewPacketPath,
        manifestPath,
        workspaceRoot: dir,
        deckKind: "word",
        level: 5,
        now: () => new Date("2026-05-20T00:00:00.000Z"),
        loadManifestFn: () => buildManifest(),
        buildSuggestionReportFn: () => ({ passed: true, errors: [] }),
        buildReviewPacketReportFn: () => ({ passed: true, errors: [] }),
    });

    assert.deepEqual(artifact.generator.modelIds, []);
    assert.equal(artifact.counts.sourcePackets, 1);
    assert.equal(artifact.counts.proposals, 0);
    assert.deepEqual(artifact.proposals, []);
});

test("buildNlpDraftProposalArtifact does not claim source models for out-of-scope suggestions", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-drafts-"));
    const suggestionPath = writeJson(dir, "suggestions.json", buildSuggestionArtifact());
    const reviewPacketPath = writeJson(dir, "review-packets.json", buildReviewPacketArtifact());
    const manifestPath = writeJson(dir, "manifest.json", { fixture: true });

    const artifact = buildNlpDraftProposalArtifact({
        suggestionArtifactPath: suggestionPath,
        reviewPacketArtifactPath: reviewPacketPath,
        manifestPath,
        workspaceRoot: dir,
        deckKind: "kanji",
        level: 5,
        now: () => new Date("2026-05-20T00:00:00.000Z"),
        loadManifestFn: () => buildManifest(),
        buildSuggestionReportFn: () => ({ passed: true, errors: [] }),
        buildReviewPacketReportFn: () => ({ passed: true, errors: [] }),
    });

    assert.deepEqual(artifact.generator.modelIds, []);
    assert.equal(artifact.counts.proposals, 0);
    assert.equal(artifact.counts.sourceSuggestions, 0);
    assert.equal(artifact.counts.sourcePackets, 0);
    assert.deepEqual(artifact.proposals, []);
});

test("parseNlpDraftProposalArtifact fails closed for loose model-backed proof", () => {
    const artifact = {
        version: 1,
        artifactType: "nlp_draft_proposal_batch",
        generatedAt: "2026-05-20T00:00:00.000Z",
        generator: {
            modelIds: [],
            runId: "fixture-run",
            manifestPath: "templates/nlp_model_manifest.json",
            createdBy: "test fixture",
            inputHashes: [{
                path: "out/nlp-suggestions/fixture.json",
                sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
                byteSize: 128,
            }],
        },
        scope: {
            deckKind: "word",
            levels: [5],
            lane: "assistive-draft-proposal",
            description: "Fixture draft proposals.",
        },
        authority: { ...NLP_DRAFT_PROPOSAL_AUTHORITY },
        counts: {
            proposals: 1,
            proposalsByKind: {
                "example-candidate": 1,
            },
            proposalsByPriority: {
                review: 1,
            },
            sourceSuggestions: 1,
            sourcePackets: 0,
        },
        proposals: [{
            id: "nlp-draft-0001",
            draftKind: "example-candidate",
            target: {
                deckKind: "word",
                level: 5,
                written: "日本語",
                reading: "にほんご",
            },
            priority: "review",
            title: "Draft example candidate.",
            rationale: "Fixture rationale.",
            proposedFields: {
                exampleJapanese: "日本語を勉強します。",
            },
            blockers: ["Needs human review."],
            promotionChecklist: ["Do not certify from this draft."],
            sourceRefs: [{
                sourceType: "suggestion",
                sourceId: "n5-word-example-0001",
                note: "Fixture suggestion.",
            }],
            limitations: ["Fixture only."],
            authority: { ...NLP_DRAFT_PROPOSAL_AUTHORITY },
        }],
    };

    assert.throws(
        () => parseNlpDraftProposalArtifact(artifact),
        /must declare generator\.modelIds/
    );
});

test("NLP draft proposal writer emits artifacts accepted by the validator", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-drafts-"));
    const suggestionPath = writeJson(dir, "suggestions.json", buildSuggestionArtifact());
    const reviewPacketPath = writeJson(dir, "review-packets.json", buildReviewPacketArtifact());
    const manifestPath = writeJson(dir, "manifest.json", { fixture: true });
    const outPath = path.join(dir, "drafts.json");
    const markdownOutPath = path.join(dir, "drafts.md");

    const result = writeNlpDraftProposalArtifact({
        outPath,
        markdownOutPath,
        suggestionArtifactPath: suggestionPath,
        reviewPacketArtifactPath: reviewPacketPath,
        manifestPath,
        workspaceRoot: dir,
        now: () => new Date("2026-05-20T00:00:00.000Z"),
        loadManifestFn: () => buildManifest(),
        buildSuggestionReportFn: () => ({ passed: true, errors: [] }),
        buildReviewPacketReportFn: () => ({ passed: true, errors: [] }),
    });
    const report = buildNlpDraftProposalArtifactReport({
        artifactPath: result.outPath,
        manifestPath,
        loadManifestFn: () => buildManifest(),
    });

    assert.equal(fs.existsSync(outPath), true);
    assert.equal(fs.existsSync(markdownOutPath), true);
    assert.equal(report.passed, true);
    assert.equal(report.counts.proposals, 2);
    assert.equal(report.releaseBoundary.draftProposalsAreCertificationEvidence, false);
});

test("NLP draft proposal validation fails under-authorized source models and bad JSON", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-drafts-"));
    const suggestionPath = writeJson(dir, "suggestions.json", buildSuggestionArtifact());
    const reviewPacketPath = writeJson(dir, "review-packets.json", buildReviewPacketArtifact());
    const manifestPath = writeJson(dir, "manifest.json", { fixture: true });
    const outPath = path.join(dir, "drafts.json");

    writeNlpDraftProposalArtifact({
        outPath,
        suggestionArtifactPath: suggestionPath,
        reviewPacketArtifactPath: reviewPacketPath,
        manifestPath,
        workspaceRoot: dir,
        now: () => new Date("2026-05-20T00:00:00.000Z"),
        loadManifestFn: () => buildManifest(),
        buildSuggestionReportFn: () => ({ passed: true, errors: [] }),
        buildReviewPacketReportFn: () => ({ passed: true, errors: [] }),
    });

    const wrongUse = buildNlpDraftProposalArtifactReport({
        artifactPath: outPath,
        manifestPath,
        loadManifestFn: () => buildManifest({ allowedUses: ["assistive-example-reranking"] }),
    });
    assert.equal(wrongUse.passed, false);
    assert.match(wrongUse.errors.join("\n"), /does not allow draft lane/);

    fs.writeFileSync(outPath, "{ nope", "utf8");
    const badJson = buildNlpDraftProposalArtifactReport({
        artifactPath: outPath,
        manifestPath,
        loadManifestFn: () => buildManifest(),
    });
    assert.equal(badJson.passed, false);
    assert.match(badJson.errors.join("\n"), /NLP draft proposal artifact contains invalid JSON/);
    assert.match(badJson.errors.join("\n"), /Parser detail:/);
});
