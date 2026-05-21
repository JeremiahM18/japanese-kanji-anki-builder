const test = require("node:test");
const assert = require("node:assert/strict");

const {
    WORD_TOKENIZATION_EXCEPTION_AUTHORITY,
    buildNlpWordTokenizationMismatchExceptionMap,
    loadNlpWordTokenizationMismatchExceptions,
    parseNlpWordTokenizationMismatchExceptions,
} = require("../src/datasets/nlpWordTokenizationMismatchExceptions");

function buildEntry(overrides = {}) {
    return {
        written: "三百",
        reading: "さんびゃく",
        level: 5,
        tokenizerReading: "さんひゃく",
        tokenSurfaces: ["三", "百"],
        exceptionKind: "counter-sound-change-reading",
        appliesToSignalKinds: [
            "multi-token-surface",
            "token-reading-card-reading-mismatch",
        ],
        evidence: [{
            type: "generated-row",
            source: "out/word-build/exports/jlpt-n5-words.tsv",
            detail: "Exact generated row evidence for 三百|さんびゃく.",
        }, {
            type: "tracked-source",
            source: "templates/starter_word_study_data.json:三百|さんびゃく",
            detail: "Exact tracked source evidence for 三百|さんびゃく.",
        }],
        reviewNote: "Reviewed tokenizer/card reading exception for an exact word-card identity.",
        limitations: [
            "Applies only to the exact tokenizer reading, token surfaces, level, written form, and card reading.",
        ],
        ...overrides,
    };
}

function buildArtifact(entries = [buildEntry()]) {
    return {
        version: 1,
        artifactType: "nlp_word_tokenization_mismatch_exceptions",
        reviewedAt: "2026-05-21",
        reviewer: "test fixture",
        reviewStandard: "test-word-tokenization-mismatch-exceptions",
        authority: { ...WORD_TOKENIZATION_EXCEPTION_AUTHORITY },
        entries,
    };
}

test("parseNlpWordTokenizationMismatchExceptions accepts exact level-scoped proof", () => {
    const artifact = parseNlpWordTokenizationMismatchExceptions(buildArtifact([
        buildEntry(),
        buildEntry({
            level: 4,
            evidence: [{
                type: "generated-row",
                source: "out/word-build/exports/jlpt-n4-words.tsv",
                detail: "Exact generated row evidence for the N4 fixture.",
            }, {
                type: "human-review",
                source: "templates/platinum_n4_word_review_set.json:三百|さんびゃく",
                detail: "Exact human review evidence for the N4 fixture.",
            }],
        }),
    ]));
    const map = buildNlpWordTokenizationMismatchExceptionMap(artifact);

    assert.equal(artifact.entries.length, 2);
    assert.equal(map.get("N5|三百|さんびゃく").level, 5);
    assert.equal(map.get("N4|三百|さんびゃく").level, 4);
});

test("parseNlpWordTokenizationMismatchExceptions rejects duplicate exact-level identities", () => {
    assert.throws(
        () => parseNlpWordTokenizationMismatchExceptions(buildArtifact([buildEntry(), buildEntry()])),
        /Duplicate NLP word tokenization mismatch exception: N5\|三百\|さんびゃく/
    );
});

test("parseNlpWordTokenizationMismatchExceptions requires mismatch coverage and source proof", () => {
    assert.throws(
        () => parseNlpWordTokenizationMismatchExceptions(buildArtifact([
            buildEntry({ appliesToSignalKinds: ["multi-token-surface"] }),
        ])),
        /must apply to token-reading-card-reading-mismatch/
    );

    assert.throws(
        () => parseNlpWordTokenizationMismatchExceptions(buildArtifact([
            buildEntry({
                evidence: [{
                    type: "tracked-source",
                    source: "templates/starter_word_study_data.json:三百|さんびゃく",
                    detail: "Exact tracked source evidence for 三百|さんびゃく.",
                }, {
                    type: "source-manifest",
                    source: "templates/word_source_manifest.json:jmdict:三百|さんびゃく",
                    detail: "Exact source manifest evidence for 三百|さんびゃく.",
                }],
            }),
        ])),
        /must include generated-row evidence/
    );

    assert.throws(
        () => parseNlpWordTokenizationMismatchExceptions(buildArtifact([
            buildEntry({
                evidence: [{
                    type: "generated-row",
                    source: "out/word-build/exports/jlpt-n5-words.tsv",
                    detail: "Exact generated row evidence for 三百|さんびゃく.",
                }, {
                    type: "source-manifest",
                    source: "templates/word_source_manifest.json:jmdict:三百|さんびゃく",
                    detail: "Exact source manifest evidence for 三百|さんびゃく.",
                }],
            }),
        ])),
        /must include tracked-source or human-review evidence/
    );
});

test("parseNlpWordTokenizationMismatchExceptions requires tokenizer limitation for artifact warnings", () => {
    assert.throws(
        () => parseNlpWordTokenizationMismatchExceptions(buildArtifact([
            buildEntry({
                appliesToSignalKinds: [
                    "token-reading-card-reading-mismatch",
                    "artifact-warning",
                ],
                limitations: ["Fixture exception only."],
            }),
        ])),
        /cannot ignore artifact warnings without a tokenizer\/dictionary limitation/
    );
});

test("tracked NLP word tokenization mismatch exceptions parse with reviewed class counts", () => {
    const artifact = loadNlpWordTokenizationMismatchExceptions();
    const counts = artifact.entries.reduce((accumulator, entry) => {
        accumulator[entry.exceptionKind] = (accumulator[entry.exceptionKind] || 0) + 1;
        return accumulator;
    }, {});

    assert.equal(artifact.entries.length, 63);
    assert.deepEqual(counts, {
        "counter-sound-change-reading": 3,
        "date-counter-irregular-reading": 20,
        "fixed-expression-reading-assimilation": 1,
        "formal-compound-alternate-reading": 1,
        "lexical-alternate-reading": 34,
        "modern-kana-tokenizer-reading-variant": 1,
        "orthographic-function-word-reading": 1,
        "proper-noun-reading-variant": 2,
    });
});
