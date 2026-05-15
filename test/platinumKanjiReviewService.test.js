const test = require("node:test");
const assert = require("node:assert/strict");

const {
    ALLOWED_KANJI_VERIFICATION_LIMITATION_FIELDS,
    CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
    REQUIRED_KANJI_INTERNAL_CHECK_TYPES,
    REQUIRED_KANJI_QUALITY_GATES,
    REQUIRED_KANJI_REVIEW_EVIDENCE_TYPES,
    REQUIRED_KANJI_SOURCE_EVIDENCE_TYPES,
    evaluatePlatinumKanjiReviewSet,
    formatPlatinumKanjiReviewReport,
} = require("../src/services/platinumKanjiReviewService");

function buildQualityGates(overrides = {}) {
    return Object.fromEntries(REQUIRED_KANJI_QUALITY_GATES.map((gate) => [gate, overrides[gate] ?? true]));
}

function buildRow(overrides = {}) {
    return {
        kanji: "日",
        levelLabel: "N5",
        displayWord: "日",
        meaningJP: "day",
        primaryReading: "ひ",
        kanjiMeanings: "day / sun",
        studyWordKanji: "",
        onReading: "On: ニチ、 ジツ",
        kunReading: "Kun: ひ、 か",
        strokeOrder: "<img src=\"65E5_日-stroke-order.gif\" />",
        audio: "[sound:65E5_日-kanji-reading-日-ひ.wav]",
        radical: "日",
        notes: "<ruby>日<rt>ひ</rt></ruby> - day ／ <ruby>日本<rt>にほん</rt></ruby> - Japan",
        exampleSentence: "雨の日です。 ／ あめのひです。 ／ It is a rainy day.",
        ...overrides,
    };
}

function buildSourceEvidence() {
    const details = {
        "japanese-source": "Japanese dictionary-style source verified 日 primary reading ひ, primary meaning day, and broader meanings day and sun.",
    };

    return REQUIRED_KANJI_SOURCE_EVIDENCE_TYPES.map((type) => ({
        type,
        source: "Kanjipedia https://www.kanjipedia.jp/kanji/0006416300; Bunka Joyo Kanji reading index",
        detail: details[type],
    }));
}

function buildInternalChecks() {
    const details = {
        "generated-surface": "Generated card surface inspected for 日: single-kanji anchor, primary reading ひ, meaning, notes, example 雨の日です。, audio, and stroke-order fields.",
        "golden-regression": "Separate golden regression gate checked 日; this regression gate protects generated field expectations but is not source truth and not source evidence.",
        "media-audit": "Managed media provenance audit checked 日 exact audio media fragment kanji-reading-日-ひ and stroke-order media source policy.",
        "audio-review": "Audio review checked 日 exact asset fragment kanji-reading-日-ひ.",
        "stroke-order-review": "Visual stroke-order review checked target 日 against source-policy governed media.",
    };

    return REQUIRED_KANJI_INTERNAL_CHECK_TYPES.map((type) => ({
        type,
        source: "test fixture source",
        detail: details[type],
    }));
}

function buildReviewEvidence() {
    return [
        {
            type: "manual-review",
            source: "manual kanji product review fixture",
            detail: "Manual review judged 日 as an individual-kanji learner card.",
        },
        {
            type: "current-standard-review",
            source: "current-standard fixture review",
            detail: "Current-standard review revalidated 日|ひ with separated evidence lanes, generated surface, Japanese-source evidence, PrimaryReading ひ, MeaningJP day, KanjiMeanings day and sun, example sentence 雨の日です。, reading あめのひです。, translation It is a rainy day., notes/support surface 日 and 日本, audio kanji-reading-日-ひ, stroke-order media, release-quality support-only example usage, learner-friendly, useful, level-appropriate, natural sentence review, and verification limitations with no active limitations present.",
        },
    ];
}

function buildLegacyEntry(overrides = {}) {
    return {
        kanji: "日",
        status: "platinum",
        readingIncludes: ["ひ"],
        meaningIncludes: ["day"],
        kanjiMeaningsIncludes: ["day", "sun"],
        levelIncludes: ["N5"],
        notesIncludes: ["日", "日本"],
        exampleIncludes: ["雨の日です。"],
        primaryReadingRationale: "Uses the common learner-facing kun reading ひ for the individual kanji 日.",
        reviewedAt: "2026-05-02",
        reviewer: "content-review",
        sourceEvidence: buildSourceEvidence(),
        internalChecks: buildInternalChecks(),
        reviewEvidence: buildReviewEvidence(),
        qualityGates: buildQualityGates(),
        ...overrides,
    };
}

function buildEntry(overrides = {}) {
    return buildLegacyEntry({
        reviewStandard: CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
        revalidatedAt: "2026-05-13",
        revalidationSummary: "Revalidated evidence lanes for generated surface, Japanese-source evidence, example sentence, notes/support surface, audio, stroke-order media, and verification limitations under the current kanji platinum standard.",
        sourceEvidence: buildSourceEvidence(),
        internalChecks: buildInternalChecks(),
        reviewEvidence: buildReviewEvidence(),
        ...overrides,
    });
}

function buildCurrentStandardEntry(overrides = {}) {
    return buildEntry(overrides);
}

test("evaluatePlatinumKanjiReviewSet passes active platinum entries with strict kanji card gates", () => {
    const report = evaluatePlatinumKanjiReviewSet({
        rows: [buildRow()],
        entries: [buildEntry()],
        requireAllRows: true,
    });

    assert.equal(report.passed, true);
    assert.equal(report.activePlatinumCount, 1);
    assert.equal(report.failedCount, 0);
});

test("evaluatePlatinumKanjiReviewSet tracks explicit non-core verification limitations", () => {
    const limitationLabel = "Stroke-order sequence unverified";
    const reviewEvidence = buildReviewEvidence().map((evidence) => (
        evidence.type === "manual-review" || evidence.type === "current-standard-review"
            ? {
                ...evidence,
                detail: `${evidence.detail} ${limitationLabel} is visibly labeled after an unsuccessful independent sequence-source check.`,
            }
            : evidence
    ));

    const report = evaluatePlatinumKanjiReviewSet({
        rows: [buildRow({
            notes: `<ruby>日<rt>ひ</rt></ruby> - day ／ ${limitationLabel}`,
        })],
        entries: [buildEntry({
            reviewEvidence,
            notesIncludes: ["日", limitationLabel],
            verificationLimitations: [{
                field: "strokeOrderSequence",
                status: "externally_unverified",
                label: limitationLabel,
                reviewNote: "Governed stroke-order media was visually checked for 日, but no independent sequence source was available.",
            }],
        })],
        requireAllRows: true,
    });

    assert.equal(report.passed, true);
    assert.equal(report.verificationLimitationCount, 1);
    assert.equal(report.verificationLimitationKanjiCount, 1);
    assert.equal(report.verificationLimitationFieldCounts.strokeOrderSequence, 1);
    assert.match(formatPlatinumKanjiReviewReport(report), /Stroke-order sequence unverified/);
});

test("evaluatePlatinumKanjiReviewSet treats legacy review history as non-certifying backlog", () => {
    const legacyReport = evaluatePlatinumKanjiReviewSet({
        rows: [buildRow()],
        entries: [buildLegacyEntry()],
        requireAllRows: true,
        requireCurrentReviewStandard: true,
    });
    const legacyCompatReport = evaluatePlatinumKanjiReviewSet({
        rows: [buildRow()],
        entries: [buildLegacyEntry()],
        requireAllRows: true,
        requireCurrentReviewStandard: false,
    });
    const revalidationReport = evaluatePlatinumKanjiReviewSet({
        rows: [buildRow()],
        entries: [buildLegacyEntry({
            status: "needs_revalidation",
            previousStatus: "platinum",
            decisionReason: "Legacy fixture retained only as non-certifying review history.",
        })],
        requireAllRows: true,
        requireCurrentReviewStandard: true,
    });
    const currentReport = evaluatePlatinumKanjiReviewSet({
        rows: [buildRow()],
        entries: [buildCurrentStandardEntry()],
        requireAllRows: true,
        requireCurrentReviewStandard: true,
    });

    assert.equal(legacyReport.passed, false);
    assert.equal(legacyReport.activePlatinumCount, 0);
    assert.equal(legacyReport.activePlatinumStatusCount, 1);
    assert.equal(legacyReport.currentStandardPlatinumCount, 0);
    assert.equal(legacyReport.legacyOrUnversionedPlatinumCount, 1);
    assert.deepEqual(legacyReport.missingPlatinumRows, ["日"]);
    assert.deepEqual(legacyReport.missingCurrentStandardRows, ["日"]);
    assert.match(legacyReport.results[0].failures.join("\n"), /active platinum status requires current-standard revalidation/);
    assert.equal(legacyCompatReport.activePlatinumCount, 0);
    assert.equal(legacyCompatReport.results[0].passed, false);
    assert.match(legacyCompatReport.results[0].failures.join("\n"), /active platinum status requires current-standard revalidation/);
    assert.equal(revalidationReport.failedCount, 0);
    assert.equal(revalidationReport.activePlatinumCount, 0);
    assert.equal(revalidationReport.revalidationBacklogCount, 1);
    assert.deepEqual(revalidationReport.missingPlatinumRows, ["日"]);
    assert.equal(currentReport.passed, true);
    assert.equal(currentReport.activePlatinumCount, 1);
    assert.equal(currentReport.currentStandardPlatinumCount, 1);
    assert.equal(currentReport.legacyOrUnversionedPlatinumCount, 0);
});

test("evaluatePlatinumKanjiReviewSet requires complete current-standard revalidation evidence", () => {
    const missingEvidenceReport = evaluatePlatinumKanjiReviewSet({
        rows: [buildRow()],
        entries: [buildLegacyEntry({
            reviewStandard: CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
            revalidatedAt: "2026-05-13",
            revalidationSummary: "Revalidated evidence lanes for generated surface, Japanese-source evidence, example sentence, notes/support surface, audio, stroke-order media, and verification limitations under the current kanji platinum standard.",
            reviewEvidence: buildReviewEvidence().filter((evidence) => evidence.type !== "current-standard-review"),
        })],
        requireAllRows: true,
        requireCurrentReviewStandard: true,
    });
    const report = evaluatePlatinumKanjiReviewSet({
        rows: [buildRow()],
        entries: [buildCurrentStandardEntry({
            revalidationSummary: "Revalidated generated surface and audio.",
        })],
        requireAllRows: true,
        requireCurrentReviewStandard: true,
    });

    assert.equal(missingEvidenceReport.passed, false);
    assert.match(
        missingEvidenceReport.results[0].failures.join("\n"),
        /reviewEvidence must include evidence type: current-standard-review/
    );
    const failures = report.results[0].failures.join("\n");
    assert.equal(report.passed, false);
    assert.match(failures, /revalidationSummary must mention Japanese source evidence/);
    assert.match(failures, /revalidationSummary must mention example sentence/);
    assert.match(failures, /revalidationSummary must mention verification limitations/);
});

test("evaluatePlatinumKanjiReviewSet rejects core-field or hidden verification limitations", () => {
    const hiddenLabel = "Stroke-order sequence unverified";
    const reviewEvidence = buildReviewEvidence().map((evidence) => (
        evidence.type === "manual-review"
            ? {
                ...evidence,
                detail: `${evidence.detail} ${hiddenLabel} was reviewed as a limitation.`,
            }
            : evidence
    ));
    const coreFieldReport = evaluatePlatinumKanjiReviewSet({
        rows: [buildRow({ notes: `<ruby>日<rt>ひ</rt></ruby> - day ／ ${hiddenLabel}` })],
        entries: [buildEntry({
            reviewEvidence,
            verificationLimitations: [{
                field: "primaryReading",
                status: "externally_unverified",
                label: hiddenLabel,
                reviewNote: "Fixture limitation.",
            }],
        })],
    });
    const hiddenReport = evaluatePlatinumKanjiReviewSet({
        rows: [buildRow()],
        entries: [buildEntry({
            reviewEvidence,
            verificationLimitations: [{
                field: "strokeOrderSequence",
                status: "externally_unverified",
                label: hiddenLabel,
                reviewNote: "Fixture limitation.",
            }],
        })],
    });

    assert.ok(ALLOWED_KANJI_VERIFICATION_LIMITATION_FIELDS.includes("strokeOrderSequence"));
    assert.equal(coreFieldReport.passed, false);
    assert.match(coreFieldReport.results[0].failures.join("\n"), /cannot be a core kanji-card truth field: primaryReading/);
    assert.equal(hiddenReport.passed, false);
    assert.match(hiddenReport.results[0].failures.join("\n"), /Notes must include verification limitation label/);
});

test("evaluatePlatinumKanjiReviewSet rejects entries when the kanji card anchor drifts", () => {
    const report = evaluatePlatinumKanjiReviewSet({
        rows: [buildRow({ displayWord: "日本", studyWordKanji: "<span>本: JLPT N5</span>" })],
        entries: [buildEntry()],
    });

    assert.equal(report.passed, false);
    assert.match(report.results[0].failures.join("\n"), /DisplayWord does not equal the target kanji/);
    assert.match(report.results[0].failures.join("\n"), /StudyWordKanji must be blank/);
});

test("evaluatePlatinumKanjiReviewSet rejects non-exact primary-reading audio", () => {
    const report = evaluatePlatinumKanjiReviewSet({
        rows: [buildRow({ audio: "[sound:word-日本-にほん.wav]" })],
        entries: [buildEntry()],
    });

    assert.equal(report.passed, false);
    assert.match(report.results[0].failures.join("\n"), /Audio field is not kanji-reading audio/);
});

test("evaluatePlatinumKanjiReviewSet rejects active entries with missing quality gates", () => {
    const report = evaluatePlatinumKanjiReviewSet({
        rows: [buildRow()],
        entries: [
            buildEntry({
                qualityGates: buildQualityGates({ individualKanjiAnchor: false }),
            }),
        ],
    });

    assert.equal(report.passed, false);
    assert.match(report.results[0].failures.join("\n"), /quality gate must be true: individualKanjiAnchor/);
});

test("evaluatePlatinumKanjiReviewSet requires primary-reading rationale and structured evidence", () => {
    const report = evaluatePlatinumKanjiReviewSet({
        rows: [buildRow()],
        entries: [
            buildEntry({
                primaryReadingRationale: "",
                sourceEvidence: ["free text evidence is not enough"],
            }),
        ],
    });

    const failures = report.results[0].failures.join("\n");
    assert.equal(report.passed, false);
    assert.match(failures, /primaryReadingRationale must explain/);
    assert.match(failures, /sourceEvidence must contain structured evidence entries/);
    assert.match(failures, /sourceEvidence must include evidence type: japanese-source/);
});

test("evaluatePlatinumKanjiReviewSet rejects golden review as source evidence", () => {
    const report = evaluatePlatinumKanjiReviewSet({
        rows: [buildRow()],
        entries: [
            buildEntry({
                sourceEvidence: [
                    ...buildSourceEvidence(),
                    {
                        type: "golden-review",
                        source: "templates/golden_n5_review_set.json",
                        detail: "N5 golden review protects 日.",
                    },
                ],
            }),
        ],
    });

    assert.equal(report.passed, false);
    assert.match(report.results[0].failures.join("\n"), /golden-review must not be used in sourceEvidence/);
});

test("evaluatePlatinumKanjiReviewSet rejects source evidence that does not bind to reviewed field values", () => {
    const report = evaluatePlatinumKanjiReviewSet({
        rows: [buildRow()],
        entries: [
            buildEntry({
                sourceEvidence: REQUIRED_KANJI_SOURCE_EVIDENCE_TYPES.map((type) => ({
                    type,
                    source: "Kanjipedia https://www.kanjipedia.jp/kanji/0006416300",
                    detail: "Reviewed this field.",
                })),
                internalChecks: REQUIRED_KANJI_INTERNAL_CHECK_TYPES.map((type) => ({
                    type,
                    source: "test fixture source",
                    detail: "Reviewed this field.",
                })),
                reviewEvidence: REQUIRED_KANJI_REVIEW_EVIDENCE_TYPES.map((type) => ({
                    type,
                    source: "review fixture source",
                    detail: "Reviewed this field.",
                })),
            }),
        ],
    });

    const failures = report.results[0].failures.join("\n");
    assert.equal(report.passed, false);
    assert.match(failures, /japanese-source evidence must explicitly support/);
    assert.match(failures, /audio-review evidence must explicitly support/);
    assert.match(failures, /stroke-order-review evidence must explicitly support/);
});

test("evaluatePlatinumKanjiReviewSet rejects generated-only japanese-source evidence", () => {
    const localOnlyEvidence = buildSourceEvidence().map((evidence) => (
        evidence.type === "japanese-source"
            ? {
                ...evidence,
                source: "templates/starter_curated_study_data.json; templates/jlpt_kanji_source_evidence.json; out/build/exports/kanji-n5.tsv",
                detail: "Local starter/source-governance/generated files list 日 with primary reading ひ, primary meaning day, and broader meanings day and sun.",
            }
            : evidence
    ));

    const report = evaluatePlatinumKanjiReviewSet({
        rows: [buildRow()],
        entries: [buildEntry({ sourceEvidence: localOnlyEvidence })],
    });

    const failures = report.results[0].failures.join("\n");
    assert.equal(report.passed, false);
    assert.match(failures, /japanese-source evidence must cite a governed source allowed for kanji-field-verification for kanji card accuracy/);
});

test("evaluatePlatinumKanjiReviewSet requires every structured evidence type", () => {
    const report = evaluatePlatinumKanjiReviewSet({
        rows: [buildRow()],
        entries: [
            buildEntry({
                internalChecks: REQUIRED_KANJI_INTERNAL_CHECK_TYPES
                    .filter((type) => type !== "audio-review")
                    .map((type) => ({
                        type,
                        source: "test fixture",
                        detail: `Reviewed ${type} evidence for 日.`,
                    })),
            }),
        ],
    });

    assert.equal(report.passed, false);
    assert.match(report.results[0].failures.join("\n"), /internalChecks must include evidence type: audio-review/);
});

test("evaluatePlatinumKanjiReviewSet can require every generated kanji to be platinum reviewed", () => {
    const report = evaluatePlatinumKanjiReviewSet({
        rows: [
            buildRow(),
            buildRow({ kanji: "月", displayWord: "月", primaryReading: "つき", audio: "[sound:6708_月-kanji-reading-月-つき.wav]" }),
        ],
        entries: [buildEntry()],
        requireAllRows: true,
    });

    assert.equal(report.passed, false);
    assert.deepEqual(report.missingPlatinumRows, ["月"]);
    assert.match(formatPlatinumKanjiReviewReport(report), /missing Platinum Candidate entries for generated kanji: 1/);
    assert.match(formatPlatinumKanjiReviewReport(report), /月/);
});

test("evaluatePlatinumKanjiReviewSet does not pass an empty platinum set by default", () => {
    const report = evaluatePlatinumKanjiReviewSet({
        rows: [buildRow()],
        entries: [],
    });

    assert.equal(report.passed, false);
    assert.deepEqual(report.coverageFailures, ["no Platinum Candidate entries have been reviewed"]);
});

test("evaluatePlatinumKanjiReviewSet requires reviewer and date for non-shipping decisions", () => {
    const report = evaluatePlatinumKanjiReviewSet({
        rows: [],
        entries: [{
            kanji: "日",
            status: "removed",
            decisionReason: "Not appropriate for this surface.",
        }],
    });

    const failures = report.results[0].failures.join("\n");
    assert.equal(report.passed, false);
    assert.match(failures, /reviewedAt is required/);
    assert.match(failures, /reviewer is required/);
});
