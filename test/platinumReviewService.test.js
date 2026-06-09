const test = require("node:test");
const assert = require("node:assert/strict");

const {
    CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
    REQUIRED_WORD_INTERNAL_CHECK_TYPES,
    REQUIRED_WORD_QUALITY_GATES,
    REQUIRED_WORD_REVIEW_EVIDENCE_TYPES,
    REQUIRED_WORD_SOURCE_EVIDENCE_TYPES,
    evaluatePlatinumWordReviewSet,
    formatPlatinumWordReviewReport,
} = require("../src/services/platinumReviewService");

function buildQualityGates(overrides = {}) {
    return Object.fromEntries(REQUIRED_WORD_QUALITY_GATES.map((gate) => [gate, overrides[gate] ?? true]));
}

function buildWordPitchAccentData(overrides = {}) {
    const { ["今日|きょう"]: todayOverride = {}, ...extraEntries } = overrides;
    return {
        sources: {
            "kanjium-cc-by-sa-4.0": {
                name: "Kanjium pitch accent database",
                license: "CC BY-SA 4.0",
            },
            "voicevox-nemo-accent-query": {
                name: "VOICEVOX Nemo accent query",
                license: "VOICEVOX Nemo terms",
                attribution: "Accent analysis generated with VOICEVOX Nemo.",
            },
        },
        entries: {
            "今日|きょう": {
                pattern: "0 [heiban]",
                sourceId: "kanjium-cc-by-sa-4.0",
                sourceWord: "今日",
                sourceReading: "きょう",
                sourceAccent: "0",
                ...todayOverride,
            },
            ...extraEntries,
        },
    };
}

function evaluateWordPlatinum(options = {}) {
    return evaluatePlatinumWordReviewSet({
        wordPitchAccentData: buildWordPitchAccentData(),
        kanjiLevelData: {
            今: { jlpt: 5 },
            日: { jlpt: 5 },
        },
        ...options,
    });
}

function buildSourceEvidence() {
    const details = {
        "japanese-source": "JMdict dictionary source verified 今日|きょう, reading きょう, learner meaning today, and example 今日は図書館へ行きます。",
    };

    return REQUIRED_WORD_SOURCE_EVIDENCE_TYPES.map((type) => ({
        type,
        source: "test fixture source",
        detail: details[type],
    }));
}

function buildInternalChecks() {
    const details = {
        "generated-surface": "Generated word-card surface inspected for 今日|きょう: word, reading, meaning today, example 今日は図書館へ行きます。, audio, and pitch accent fields.",
        "golden-regression": "Separate golden regression gate checked 今日|きょう; this regression gate protects generated field expectations but is not source truth and not source evidence.",
        "level-contract": "templates/jlpt_word_level_contract.json lists 今日|きょう for JLPT N5.",
        "media-audit": "Managed media provenance audit checked 今日|きょう exact asset fragment word-reading-今日-きょう in tracked media.",
        "audio-review": "Audio review checked 今日|きょう exact asset fragment word-reading-今日-きょう.",
        "pitch-accent-review": "Pitch accent review checked 今日|きょう source kanjium-cc-by-sa-4.0 pattern 0 [heiban] and rendered label Pitch 1: 0.",
        "label-review": "Label review checked 今日|きょう JLPT N5, JLPT core, focus 今 and 日, and covered readings 今: いま and 日: ひ.",
    };

    return REQUIRED_WORD_INTERNAL_CHECK_TYPES.map((type) => ({
        type,
        source: "test fixture source",
        detail: details[type],
    }));
}

function buildReviewEvidence({ limitationLabel = "" } = {}) {
    const currentStandardDetail = [
        "Current-standard whole-card revalidation for 今日|きょう checked separated evidence lanes, generated surface, Japanese-source evidence, example sentence 今日は図書館へ行きます。, notes/support surface Common N5 word., reading breakdown 今 （いま） and 日 （ひ）, meaning today, labels JLPT N5, JLPT core, focus 今 and 日, covers 今: いま and 日: ひ, audio word-reading-今日-きょう, pitch accent source kanjium-cc-by-sa-4.0 pattern 0 [heiban] rendered Pitch 1: 0, media provenance, release judgment common useful learner-friendly level-appropriate natural, and verification limitations no active limitations.",
        limitationLabel ? `Visible limitation label: ${limitationLabel}.` : "",
    ].filter(Boolean).join(" ");

    return [
        {
            type: "example-review",
            source: "manual example review fixture",
            detail: "Example review checked 今日|きょう, reading きょう, and sentence 今日は図書館へ行きます。 Natural, useful, learner-friendly, and level-appropriate.",
        },
        {
            type: "manual-review",
            source: "manual product review fixture",
            detail: [
                "Manual review judged 今日|きょう common and learner-friendly.",
                limitationLabel ? `Verification limitation: ${limitationLabel}.` : "",
            ].filter(Boolean).join(" "),
        },
        {
            type: "current-standard-review",
            source: "manual current-standard word review fixture",
            detail: currentStandardDetail,
        },
    ];
}

function buildRow(overrides = {}) {
    return {
        word: "今日",
        reading: "きょう",
        readingBreakdown: "<ruby>今日<rt>きょう</rt></ruby>",
        audio: "[sound:4ECA_今日-word-reading-今日-きょう.wav]",
        pitchAccent: "<span aria-label=\"Pitch 1: 0\">きょう: Heiban</span>",
        meaning: "today",
        jlptLevel: "JLPT N5",
        coverageRole: "JLPT core + reading coverage",
        focusKanji: "今、日",
        coversReading: "今: いま ／ 日: ひ",
        kanjiBreakdown: "今 （いま） ／ now ... 日 （ひ） ／ day / sun",
        exampleSentence: "今日は図書館へ行きます。",
        notes: "Common N5 word.",
        ...overrides,
    };
}

function buildEntry(overrides = {}) {
    return {
        word: "今日",
        status: "platinum",
        readingIncludes: ["きょう"],
        meaningIncludes: ["today"],
        jlptLevelIncludes: ["JLPT N5"],
        coverageRoleIncludes: ["JLPT core"],
        focusIncludes: ["今", "日"],
        coversReadingIncludes: ["今: いま", "日: ひ"],
        breakdownIncludes: ["今 （いま）", "日 （ひ）"],
        exampleIncludes: ["今日は図書館へ行きます。"],
        pitchAccentIncludes: ["Pitch 1: 0"],
        selectionRationale: "Common N5 time word that is useful immediately and belongs in the word deck.",
        reviewedAt: "2026-05-02",
        reviewer: "content-review",
        sourceEvidence: buildSourceEvidence(),
        internalChecks: buildInternalChecks(),
        reviewEvidence: buildReviewEvidence(),
        qualityGates: buildQualityGates(),
        ...overrides,
    };
}

function buildCurrentStandardEntry(overrides = {}) {
    return buildEntry({
        reviewStandard: CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
        revalidatedAt: "2026-05-13",
        revalidationSummary: "Revalidated evidence lanes for generated surface, Japanese-source evidence, example sentence, notes/support surface, reading breakdown, labels, audio, pitch accent, media provenance, and verification limitations under the current word platinum standard.",
        notesIncludes: ["Common N5 word."],
        sourceEvidence: buildSourceEvidence(),
        internalChecks: buildInternalChecks(),
        reviewEvidence: buildReviewEvidence(),
        ...overrides,
    });
}

test("evaluatePlatinumWordReviewSet passes active platinum entries with release gates and matching export fields", () => {
    const report = evaluateWordPlatinum({
        rows: [buildRow()],
        entries: [buildEntry()],
        requireAllRows: true,
    });

    assert.equal(report.passed, true);
    assert.equal(report.activePlatinumCount, 1);
    assert.equal(report.failedCount, 0);
});

test("evaluatePlatinumWordReviewSet does not require Obsidian proof for current-standard Platinum", () => {
    const entry = buildCurrentStandardEntry();
    const report = evaluateWordPlatinum({
        rows: [buildRow()],
        entries: [entry],
        requireAllRows: true,
        requireCurrentReviewStandard: true,
    });

    assert.equal(Object.prototype.hasOwnProperty.call(entry, "rereviewProvenance"), false);
    assert.equal(report.passed, true, report.results[0]?.failures.join("\n") || "");
    assert.equal(report.currentStandardPlatinumCount, 1);
    assert.equal(report.failedCount, 0);
});

test("evaluatePlatinumWordReviewSet rejects Platinum entries manufactured from Sapphire authority", () => {
    const report = evaluateWordPlatinum({
        rows: [buildRow()],
        entries: [buildCurrentStandardEntry({
            reviewer: "codex-sapphire-review",
            migrationProvenance: {
                migratedFrom: "native-word-sapphire-review",
                authority: "Native Sapphire structural review entry. This is not Platinum card-surface inspection.",
            },
            reviewEvidence: buildReviewEvidence().map((evidence) => {
                if (evidence.type !== "manual-review") {
                    return evidence;
                }
                return {
                    ...evidence,
                    source: "Sapphire product review",
                    detail: "Manual review copied from current-standard word Sapphire review. This is not Platinum card-surface inspection.",
                };
            }),
        })],
        requireAllRows: true,
        requireCurrentReviewStandard: true,
    });

    const failures = report.results[0].failures.join("\n");
    assert.equal(report.passed, false);
    assert.match(failures, /must not carry Sapphire migrationProvenance/);
    assert.match(failures, /reviewer must not be a Sapphire reviewer identity/);
    assert.match(failures, /reviewEvidence source must not use Sapphire as Platinum review authority/);
    assert.match(failures, /appears copied from Sapphire authority/);
});

test("evaluatePlatinumWordReviewSet enforces Gold and Sapphire preconditions when claiming the lane", () => {
    const baseOptions = {
        rows: [buildRow()],
        entries: [buildCurrentStandardEntry()],
        goldenExpectations: [{
            word: "今日",
            readingIncludes: ["きょう"],
            meaningIncludes: ["today"],
            jlptLevelIncludes: ["JLPT N5"],
            coverageRoleIncludes: ["JLPT core"],
            focusIncludes: ["今", "日"],
            coversReadingIncludes: ["今: いま", "日: ひ"],
            breakdownIncludes: ["今 （いま）", "日 （ひ）"],
            exampleIncludes: ["今日は図書館へ行きます。"],
            notesIncludes: ["Common N5 word."],
        }],
        requireGoldPrecondition: true,
        sapphireEntries: [{
            word: "今日",
            status: "sapphire",
            reviewStandard: "word-sapphire-v1-evidence-lanes",
            readingIncludes: ["きょう"],
        }],
        requireSapphirePrecondition: true,
        requireAllRows: true,
        requireCurrentReviewStandard: true,
    };

    const passingReport = evaluateWordPlatinum(baseOptions);
    const missingGoldReport = evaluateWordPlatinum({
        ...baseOptions,
        goldenExpectations: [],
    });
    const missingSapphireReport = evaluateWordPlatinum({
        ...baseOptions,
        sapphireEntries: [],
    });

    assert.equal(passingReport.passed, true, passingReport.results[0]?.failures.join("\n") || "");
    assert.equal(missingGoldReport.passed, false);
    assert.match(missingGoldReport.results[0].failures.join("\n"), /Platinum requires a prior Gold expectation for 今日\|きょう/);
    assert.equal(missingSapphireReport.passed, false);
    assert.match(missingSapphireReport.results[0].failures.join("\n"), /Platinum requires current-standard Sapphire coverage for 今日\|きょう/);
});

test("evaluatePlatinumWordReviewSet gates current-standard revalidation separately from legacy word platinum", () => {
    const legacyReport = evaluateWordPlatinum({
        rows: [buildRow()],
        entries: [buildEntry()],
        requireAllRows: true,
        requireCurrentReviewStandard: true,
    });
    const currentReport = evaluateWordPlatinum({
        rows: [buildRow()],
        entries: [buildCurrentStandardEntry()],
        requireAllRows: true,
        requireCurrentReviewStandard: true,
    });

    assert.equal(legacyReport.passed, false);
    assert.equal(legacyReport.currentStandardPlatinumCount, 0);
    assert.equal(legacyReport.legacyOrUnversionedPlatinumCount, 1);
    assert.deepEqual(legacyReport.missingCurrentStandardRows, ["今日 (きょう)"]);
    assert.match(legacyReport.results[0].failures.join("\n"), new RegExp(`reviewStandard must be ${CURRENT_WORD_PLATINUM_REVIEW_STANDARD}`));

    assert.equal(currentReport.passed, true);
    assert.equal(currentReport.currentStandardPlatinumCount, 1);
    assert.equal(currentReport.legacyOrUnversionedPlatinumCount, 0);
    assert.deepEqual(currentReport.missingCurrentStandardRows, []);
});

test("evaluatePlatinumWordReviewSet compares escaped generated notes by visible surface text", () => {
    const report = evaluateWordPlatinum({
        rows: [buildRow({
            notes: "Common N5 word; 今 -&gt; いま.",
        })],
        entries: [buildEntry({
            notesIncludes: ["今 -> いま"],
        })],
        requireAllRows: true,
    });

    assert.equal(report.passed, true);
});

test("evaluatePlatinumWordReviewSet requires current-standard evidence to bind the whole word card surface", () => {
    const report = evaluateWordPlatinum({
        rows: [buildRow()],
        entries: [buildCurrentStandardEntry({
            reviewEvidence: buildReviewEvidence().map((evidence) => evidence.type === "current-standard-review"
                ? {
                    ...evidence,
                    detail: "Current-standard review completed for 今日|きょう.",
                }
                : evidence),
        })],
        requireCurrentReviewStandard: true,
    });

    assert.equal(report.passed, false);
    assert.match(report.results[0].failures.join("\n"), /current-standard-review evidence must explicitly support current-standard whole-card revalidation/);
});

test("evaluatePlatinumWordReviewSet tracks word verification limitations without weakening core gates", () => {
    const limitationLabel = "Pitch accent limited verification";
    const report = evaluateWordPlatinum({
        rows: [buildRow({ notes: `Common N5 word. ${limitationLabel}.` })],
        entries: [buildCurrentStandardEntry({
            reviewEvidence: buildReviewEvidence({ limitationLabel }),
            verificationLimitations: [{
                field: "pitchAccent",
                status: "limited_source",
                label: limitationLabel,
                reviewNote: "Pitch accent was reviewed against available source data, but the source set is limited.",
            }],
        })],
        requireAllRows: true,
        requireCurrentReviewStandard: true,
    });

    assert.equal(report.passed, true);
    assert.equal(report.verificationLimitationCount, 1);
    assert.equal(report.verificationLimitationWordCount, 1);
    assert.deepEqual(report.verificationLimitationFieldCounts, { pitchAccent: 1 });
});

test("evaluatePlatinumWordReviewSet rejects unverifiable core word truth fields as limitations", () => {
    const report = evaluateWordPlatinum({
        rows: [buildRow()],
        entries: [buildCurrentStandardEntry({
            verificationLimitations: [{
                field: "reading",
                status: "limited_source",
                label: "Reading limited verification",
                reviewNote: "This would leave a core card field unverified.",
            }],
        })],
        requireCurrentReviewStandard: true,
    });

    assert.equal(report.passed, false);
    assert.match(report.results[0].failures.join("\n"), /cannot be a core word-card truth field: reading/);
});

test("evaluatePlatinumWordReviewSet rejects active entries with missing release-quality gates", () => {
    const report = evaluateWordPlatinum({
        rows: [buildRow()],
        entries: [
            buildEntry({
                qualityGates: buildQualityGates({ commonOrUseful: false }),
            }),
        ],
    });

    assert.equal(report.passed, false);
    assert.match(report.results[0].failures.join("\n"), /quality gate must be true: commonOrUseful/);
});

test("evaluatePlatinumWordReviewSet rejects active entries when media fields are not exported", () => {
    const report = evaluateWordPlatinum({
        rows: [buildRow({ audio: "", pitchAccent: "" })],
        entries: [buildEntry()],
    });

    assert.equal(report.passed, false);
    assert.match(report.results[0].failures.join("\n"), /audio field is empty/);
    assert.match(report.results[0].failures.join("\n"), /pitch accent field is empty/);
});

test("evaluatePlatinumWordReviewSet rejects active entries placed easier than their kanji anchor", () => {
    const report = evaluateWordPlatinum({
        rows: [buildRow()],
        entries: [buildEntry()],
        kanjiLevelData: {
            今: { jlpt: 4 },
            日: { jlpt: 4 },
        },
    });

    assert.equal(report.passed, false);
    assert.match(report.results[0].failures.join("\n"), /lacks a current-level kanji anchor for N5; harder support floor N4: 今:N4, 日:N4/);
});

test("evaluatePlatinumWordReviewSet accepts later learner-fit placement with active rationale", () => {
    const report = evaluateWordPlatinum({
        rows: [buildRow({ jlptLevel: "JLPT N4" })],
        entries: [buildEntry({
            jlptLevelIncludes: ["JLPT N4"],
            selectionRationale: "Common and useful, but better introduced at N4 than N5 because the word load is later than the kanji.",
            internalChecks: buildInternalChecks().map((evidence) => ({
                ...evidence,
                detail: evidence.detail.replace(/N5/g, "N4"),
            })),
        })],
        kanjiLevelData: {
            今: { jlpt: 5 },
            日: { jlpt: 5 },
        },
    });

    assert.equal(report.passed, true);
});

test("evaluatePlatinumWordReviewSet requires selection rationale and structured evidence", () => {
    const report = evaluateWordPlatinum({
        rows: [buildRow()],
        entries: [
            buildEntry({
                selectionRationale: "",
                sourceEvidence: ["free text evidence is not enough"],
            }),
        ],
    });

    const failures = report.results[0].failures.join("\n");
    assert.equal(report.passed, false);
    assert.match(failures, /selectionRationale must explain/);
    assert.match(failures, /sourceEvidence must contain structured evidence entries/);
    assert.match(failures, /sourceEvidence must include evidence type: japanese-source/);
});

test("evaluatePlatinumWordReviewSet rejects golden review as source evidence", () => {
    const report = evaluateWordPlatinum({
        rows: [buildRow()],
        entries: [
            buildCurrentStandardEntry({
                sourceEvidence: [
                    ...buildSourceEvidence(),
                    {
                        type: "golden-review",
                        source: "templates/golden_n5_word_review_set.json",
                        detail: "N5 golden word review protects 今日|きょう.",
                    },
                ],
            }),
        ],
        requireCurrentReviewStandard: true,
    });

    assert.equal(report.passed, false);
    assert.match(
        report.results[0].failures.join("\n"),
        /golden-review must not be used in sourceEvidence/
    );
});

test("evaluatePlatinumWordReviewSet rejects source evidence that does not bind to reviewed field values", () => {
    const report = evaluateWordPlatinum({
        rows: [buildRow()],
        entries: [
            buildEntry({
                sourceEvidence: REQUIRED_WORD_SOURCE_EVIDENCE_TYPES.map((type) => ({
                    type,
                    source: "dictionary source",
                    detail: "Reviewed this field.",
                })),
                internalChecks: REQUIRED_WORD_INTERNAL_CHECK_TYPES.map((type) => ({
                    type,
                    source: "internal source",
                    detail: "Reviewed this field.",
                })),
                reviewEvidence: REQUIRED_WORD_REVIEW_EVIDENCE_TYPES.map((type) => ({
                    type,
                    source: "review source",
                    detail: "Reviewed this field.",
                })),
            }),
        ],
    });

    const failures = report.results[0].failures.join("\n");
    assert.equal(report.passed, false);
    assert.match(failures, /japanese-source evidence must explicitly support/);
    assert.match(failures, /audio-review evidence must explicitly support/);
    assert.match(failures, /label-review evidence must explicitly support/);
});

test("evaluatePlatinumWordReviewSet rejects local generated artifacts as Japanese source evidence", () => {
    const sourceEvidence = buildSourceEvidence().map((entry) => entry.type === "japanese-source"
        ? {
            ...entry,
            source: "templates/starter_word_study_data.json; templates/golden_n5_word_review_set.json; local KanjiAPI word cache where available",
            detail: "Tracked local data says 今日|きょう has reading きょう, learner meaning today, and example 今日は図書館へ行きます。",
        }
        : entry);
    const report = evaluateWordPlatinum({
        rows: [buildRow()],
        entries: [buildEntry({ sourceEvidence })],
    });

    assert.equal(report.passed, false);
    assert.match(report.results[0].failures.join("\n"), /japanese-source evidence must cite a governed source allowed for word-field-verification/);
});

test("evaluatePlatinumWordReviewSet protects exact word audio and pitch accent expectations", () => {
    const report = evaluateWordPlatinum({
        rows: [
            buildRow({
                audio: "[sound:4ECA_今日-word-reading-今日-こんにち.wav]",
                pitchAccent: "<span aria-label=\"Pitch 1: 1\">きょう: Atamadaka</span>",
            }),
        ],
        entries: [buildEntry()],
    });

    const failures = report.results[0].failures.join("\n");
    assert.equal(report.passed, false);
    assert.match(failures, /pitch accent did not include: Pitch 1: 0/);
    assert.match(failures, /pitch accent rendered output did not match source pattern/);
    assert.match(failures, /audio field did not include exact word-reading asset fragment: word-reading-今日-きょう/);
});

test("evaluatePlatinumWordReviewSet requires governed pitch source data", () => {
    const report = evaluatePlatinumWordReviewSet({
        rows: [buildRow()],
        entries: [buildEntry()],
        wordPitchAccentData: { sources: {}, entries: {} },
    });

    assert.equal(report.passed, false);
    assert.match(report.results[0].failures.join("\n"), /pitch accent source entry missing/);
});

test("evaluatePlatinumWordReviewSet rejects pitch source data that belongs to a different word-reading", () => {
    const report = evaluateWordPlatinum({
        rows: [buildRow()],
        entries: [buildEntry()],
        wordPitchAccentData: buildWordPitchAccentData({
            "今日|きょう": {
                sourceWord: "明日",
            },
        }),
    });

    assert.equal(report.passed, false);
    assert.match(report.results[0].failures.join("\n"), /pitch accent source validation failed/);
    assert.match(report.results[0].failures.join("\n"), /sourceWord does not match/);
});

test("evaluatePlatinumWordReviewSet requires generated pitch to be visibly labeled", () => {
    const internalChecks = buildInternalChecks().map((entry) => entry.type === "pitch-accent-review"
        ? {
            ...entry,
            detail: "Pitch accent review checked 今日|きょう source voicevox-nemo-accent-query pattern 0 [heiban] and rendered label Pitch 1: 0 / Generated pitch (unverified).",
        }
        : entry);
    const entry = buildEntry({
        pitchAccentIncludes: ["Pitch 1: 0", "Generated pitch (unverified)"],
        internalChecks,
    });
    const wordPitchAccentData = buildWordPitchAccentData({
        "今日|きょう": {
            pattern: "0 [heiban]",
            sourceId: "voicevox-nemo-accent-query",
            sourceQuery: "今日",
            generatedReading: "きょう",
        },
    });

    const failing = evaluateWordPlatinum({
        rows: [buildRow()],
        entries: [entry],
        wordPitchAccentData,
    });

    assert.equal(failing.passed, false);
    assert.match(failing.results[0].failures.join("\n"), /Generated pitch \(unverified\)/);
    assert.match(failing.results[0].failures.join("\n"), /generated pitch accent source must be visibly labeled/);

    const passing = evaluateWordPlatinum({
        rows: [buildRow({ pitchAccent: "<span aria-label=\"Pitch 1: 0\">きょう</span><span>Generated pitch (unverified)</span>" })],
        entries: [entry],
        wordPitchAccentData,
    });

    assert.equal(passing.passed, true);
});

test("evaluatePlatinumWordReviewSet keeps deferred and removed words out of the export", () => {
    const passing = evaluateWordPlatinum({
        rows: [],
        entries: [
            {
                word: "難語",
                status: "deferred",
                readingIncludes: ["なんご"],
                reviewedAt: "2026-05-02",
                reviewer: "content-review",
                decisionReason: "Not common or useful enough for the current level.",
            },
        ],
        allowEmpty: true,
    });

    const failing = evaluateWordPlatinum({
        rows: [buildRow({ word: "難語", reading: "なんご" })],
        entries: [
            {
                word: "難語",
                status: "deferred",
                readingIncludes: ["なんご"],
                reviewedAt: "2026-05-02",
                reviewer: "content-review",
                decisionReason: "Not common or useful enough for the current level.",
            },
        ],
        allowEmpty: true,
    });

    assert.equal(passing.passed, true);
    assert.equal(failing.passed, false);
    assert.match(failing.results[0].failures.join("\n"), /deferred word still appears/);
});

test("evaluatePlatinumWordReviewSet can require every generated row to be platinum reviewed", () => {
    const report = evaluateWordPlatinum({
        rows: [
            buildRow(),
            buildRow({ word: "明日", reading: "あした" }),
        ],
        entries: [buildEntry()],
        requireAllRows: true,
    });

    assert.equal(report.passed, false);
    assert.deepEqual(report.missingPlatinumRows, ["明日 (あした)"]);
    assert.match(formatPlatinumWordReviewReport(report), /missing Platinum entries for generated words: 1/);
    assert.match(formatPlatinumWordReviewReport(report), /明日 \(あした\)/);
});

test("formatPlatinumWordReviewReport summarizes current-standard and legacy word coverage", () => {
    const report = evaluateWordPlatinum({
        rows: [buildRow()],
        entries: [buildEntry()],
        requireAllRows: true,
        requireCurrentReviewStandard: true,
    });
    const formatted = formatPlatinumWordReviewReport(report);

    assert.match(formatted, new RegExp(`Current review standard: ${CURRENT_WORD_PLATINUM_REVIEW_STANDARD}`));
    assert.match(formatted, /Current-standard Platinum cards: 0/);
    assert.match(formatted, /Legacy\/unversioned platinum cards: 1/);
    assert.match(formatted, /missing current-standard Platinum entries for generated words: 1/);
    assert.match(formatted, /Missing current-standard Platinum row sample \(1\/1\):/);
});

test("evaluatePlatinumWordReviewSet does not pass an empty platinum set by default", () => {
    const report = evaluateWordPlatinum({
        rows: [buildRow()],
        entries: [],
    });

    assert.equal(report.passed, false);
    assert.deepEqual(report.coverageFailures, ["no Platinum entries have been reviewed"]);
});

test("evaluatePlatinumWordReviewSet requires reviewer and date for non-shipping decisions", () => {
    const report = evaluateWordPlatinum({
        rows: [],
        entries: [{
            word: "難語",
            status: "removed",
            readingIncludes: ["なんご"],
            decisionReason: "Not useful enough for the version 1 word deck.",
        }],
    });

    const failures = report.results[0].failures.join("\n");
    assert.equal(report.passed, false);
    assert.match(failures, /reviewedAt is required/);
    assert.match(failures, /reviewer is required/);
});
