const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { buildPitchAccentHtml } = require("../src/services/pitchAccentRenderService");
const { buildWordStudyEntryKey } = require("../src/datasets/wordStudyData");
const {
    ACTIVE_WORD_SAPPHIRE_STATUSES,
    CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD,
    evaluateSapphireWordReviewSet,
    formatSapphireWordReviewReport,
} = require("../src/services/sapphireWordReviewService");
const {
    parseSapphireWordReviewSet,
} = require("../src/datasets/sapphireWordReviewSet");
const {
    promoteSapphireWordBatch,
} = require("../src/services/sapphireWordPromotionService");

const ROOT_DIR = path.resolve(__dirname, "..");
const TEMPLATES_DIR = path.join(ROOT_DIR, "templates");

function loadJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8"));
}

function normalizeList(values = []) {
    return (Array.isArray(values) ? values : []).filter(Boolean);
}

function activeEntries(entries = []) {
    return entries.filter((entry) => ACTIVE_WORD_SAPPHIRE_STATUSES.includes(entry.status));
}

function normalizePitchSourceLabel(sourceEntry = {}, sources = {}) {
    const source = sources[sourceEntry.sourceId] || {};
    return /voicevox/i.test(`${sourceEntry.sourceId} ${source.name || ""}`)
        ? "Generated pitch (unverified)"
        : "";
}

function buildSyntheticWordRows(entries = [], wordPitchAccentData = {}, goldenExpectations = []) {
    return activeEntries(entries).map((entry) => {
        const reading = normalizeList(entry.readingIncludes)[0] || "";
        const wordKey = buildWordStudyEntryKey({
            written: entry.word,
            reading,
        });
        const goldEntry = goldenExpectations.find((expectation) => buildWordStudyEntryKey({
            written: expectation.word,
            reading: normalizeList(expectation.readingIncludes)[0],
        }) === wordKey) || {};
        const protectedList = (field) => {
            const goldValues = normalizeList(goldEntry[field]);
            return goldValues.length > 0 ? goldValues : normalizeList(entry[field]);
        };
        const sourcePitchAccent = wordPitchAccentData.entries?.[wordKey] || {};
        const pitchAccent = buildPitchAccentHtml({
            pattern: sourcePitchAccent.pattern || "",
            reading,
            sourceLabel: normalizePitchSourceLabel(sourcePitchAccent, wordPitchAccentData.sources || {}),
        });

        return {
            word: entry.word,
            reading,
            readingBreakdown: protectedList("breakdownIncludes").join(" / "),
            audio: `[sound:word-reading-${entry.word}-${reading}.wav]`,
            pitchAccent,
            meaning: protectedList("meaningIncludes").join(" / "),
            jlptLevel: protectedList("jlptLevelIncludes")[0] || "",
            coverageRole: protectedList("coverageRoleIncludes").join(" / "),
            focusKanji: protectedList("focusIncludes").join("、"),
            coversReading: protectedList("coversReadingIncludes").join(" ／ "),
            kanjiBreakdown: protectedList("breakdownIncludes").join(" ／ "),
            exampleSentence: protectedList("exampleIncludes").join(" / "),
            notes: protectedList("notesIncludes").join(" / "),
        };
    });
}

function collectForbiddenLegacyLaneText(value, pathParts = []) {
    if (typeof value === "string") {
        const pathText = pathParts.join(".");
        const allowedLegacyText = pathText.endsWith("reviewer")
            || pathText.endsWith("internalChecks.source")
            || pathText.includes("migrationProvenance");
        return /word-platinum-v3|current word platinum standard|platinum product review|Obsidian rereview|Obsidian revalidation|Substantive current-standard Obsidian|Square-zero Obsidian/i.test(value) && !allowedLegacyText
            ? [`${pathParts.join(".") || "(root)"}: ${value}`]
            : [];
    }
    if (Array.isArray(value)) {
        return value.flatMap((item, index) => collectForbiddenLegacyLaneText(item, [...pathParts, String(index)]));
    }
    if (value && typeof value === "object") {
        return Object.entries(value).flatMap(([key, entryValue]) => (
            collectForbiddenLegacyLaneText(entryValue, [...pathParts, key])
        ));
    }
    return [];
}

test("tracked Sapphire word manifests are first-class structural review sets", () => {
    const sapphireFiles = fs
        .readdirSync(TEMPLATES_DIR)
        .filter((name) => /^sapphire_n[1-5]_word_review_set\.json$/.test(name))
        .sort();

    assert.deepEqual(sapphireFiles, [
        "sapphire_n1_word_review_set.json",
        "sapphire_n2_word_review_set.json",
        "sapphire_n3_word_review_set.json",
        "sapphire_n4_word_review_set.json",
        "sapphire_n5_word_review_set.json",
    ]);

    for (const fileName of sapphireFiles) {
        const entries = loadJson(path.join("templates", fileName));
        assert.doesNotThrow(() => parseSapphireWordReviewSet(entries, fileName));

        for (const entry of activeEntries(entries)) {
            const label = `${fileName} ${entry.word}|${normalizeList(entry.readingIncludes)[0] || ""}`;
            assert.ok(ACTIVE_WORD_SAPPHIRE_STATUSES.includes(entry.status), `${label} status must be Sapphire-native`);
            assert.equal(entry.reviewStandard, CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD, `${label} review standard`);
            assert.ok(entry.migrationProvenance, `${label} must record migration provenance`);
            assert.match(
                entry.migrationProvenance.authority || "",
                /not .*Platinum/i,
                `${label} migration boundary must keep Platinum separate`
            );
            assert.match(
                entry.migrationProvenance.migratedFrom || "",
                /^(templates\/platinum_n[1-5]_word_review_set\.json|native-word-sapphire-review)$/,
                `${label} provenance source must be stable across platforms`
            );
            assert.equal(entry.platinumReviewAudit, undefined, `${label} must not include platinumReviewAudit`);
            assert.equal(entry.rereviewProvenance, undefined, `${label} must not carry inline Obsidian proof`);
            assert.deepEqual(
                collectForbiddenLegacyLaneText(entry),
                [],
                `${label} active Sapphire evidence must not carry stale Platinum lane text`
            );
            if (entry.status === "fixed_then_sapphire") {
                assert.ok(entry.fixSummary, `${label} fixed_then_sapphire entries must keep fixSummary`);
            } else {
                assert.equal(entry.fixSummary, undefined, `${label} non-fixed Sapphire entries must not keep fixSummary`);
            }
        }
    }
});

test("word Sapphire migration preserves completed Platinum inputs without shrinking denominators", () => {
    for (const level of [4]) {
        const sapphireEntries = loadJson(path.join("templates", `sapphire_n${level}_word_review_set.json`));
        const platinumEntries = loadJson(path.join("templates", `platinum_n${level}_word_review_set.json`));
        const sapphireActiveCount = activeEntries(sapphireEntries).length;
        const platinumActiveCount = platinumEntries.filter((entry) => ["platinum", "fixed_then_platinum"].includes(entry.status)).length;

        assert.equal(sapphireEntries.length, platinumEntries.length, `N${level} total tracked decisions must be preserved`);
        assert.equal(sapphireActiveCount, platinumActiveCount, `N${level} active structural coverage must be preserved`);
    }

    const n5SapphireEntries = loadJson(path.join("templates", "sapphire_n5_word_review_set.json"));
    const n5PlatinumEntries = loadJson(path.join("templates", "platinum_n5_word_review_set.json"));
    const n5SapphireActiveKeys = new Set(activeEntries(n5SapphireEntries).map((entry) => buildWordStudyEntryKey({
        written: entry.word,
        reading: normalizeList(entry.readingIncludes)[0],
    })));
    const n5PlatinumActiveKeys = n5PlatinumEntries
        .filter((entry) => ["platinum", "fixed_then_platinum"].includes(entry.status))
        .map((entry) => buildWordStudyEntryKey({
            written: entry.word,
            reading: normalizeList(entry.readingIncludes)[0],
        }));

    assert.equal(n5SapphireEntries.length, 607, "N5 word Sapphire tracked decisions must include current native review progress");
    assert.ok(n5SapphireEntries.length >= n5PlatinumEntries.length, "N5 word Sapphire must not shrink prior tracked Platinum decisions");
    assert.ok(n5SapphireActiveKeys.size >= n5PlatinumActiveKeys.length, "N5 active Sapphire coverage must preserve prior Platinum coverage");
    for (const platinumKey of n5PlatinumActiveKeys) {
        assert.ok(n5SapphireActiveKeys.has(platinumKey), `${platinumKey} Platinum entry must remain covered by N5 Sapphire`);
    }

    for (const level of [1, 2]) {
        const sapphireEntries = loadJson(path.join("templates", `sapphire_n${level}_word_review_set.json`));
        assert.deepEqual(sapphireEntries, [], `N${level} word Sapphire must fail closed until actual review exists`);
    }
});

test("native word Sapphire can lead Platinum without manufacturing Platinum coverage", () => {
    const sapphireEntries = loadJson(path.join("templates", "sapphire_n3_word_review_set.json"));
    const platinumEntries = loadJson(path.join("templates", "platinum_n3_word_review_set.json"));
    const activeSapphireEntries = activeEntries(sapphireEntries);
    const activePlatinumEntries = platinumEntries.filter((entry) =>
        ["platinum", "fixed_then_platinum"].includes(entry.status)
    );
    const sapphireKeys = activeSapphireEntries.map((entry) =>
        buildWordStudyEntryKey({
            written: entry.word,
            reading: normalizeList(entry.readingIncludes)[0],
        })
    );
    const platinumKeys = activePlatinumEntries.map((entry) =>
        buildWordStudyEntryKey({
            written: entry.word,
            reading: normalizeList(entry.readingIncludes)[0],
        })
    );

    assert.equal(new Set(sapphireKeys).size, activeSapphireEntries.length, "N3 active Sapphire entries must remain one-per-word-reading");
    assert.ok(activeSapphireEntries.length >= 28, "N3 active Sapphire coverage must not regress below the current batch baseline");
    assert.equal(activePlatinumEntries.length, 8);
    const sapphireKeySet = new Set(sapphireKeys);
    for (const platinumKey of platinumKeys) {
        assert.ok(sapphireKeySet.has(platinumKey), `${platinumKey} Platinum entry must have matching prior Sapphire`);
    }

    for (const entry of activePlatinumEntries) {
        assert.equal(entry.reviewStandard, "word-platinum-v3-evidence-lanes");
        assert.equal(entry.migrationProvenance, undefined);
        assert.equal(entry.sapphireReviewAudit, undefined);
        assert.equal(entry.rereviewProvenance, undefined);
        assert.doesNotMatch(
            JSON.stringify(entry),
            /Sapphire|word-sapphire-v1-evidence-lanes|Obsidian|obsidian/,
            `${entry.word} Platinum entry must stay lane-native and proof-free`
        );
    }
});

test("tracked populated word Sapphire manifests bind evidence to protected fields and pitch sources", () => {
    const wordPitchAccentData = loadJson(path.join("templates", "word_pitch_accent_data.json"));

    for (const level of [3, 4, 5]) {
        const fileName = `sapphire_n${level}_word_review_set.json`;
        const entries = loadJson(path.join("templates", fileName));
        const goldenExpectations = loadJson(path.join("templates", `golden_n${level}_word_review_set.json`));
        const manifestActiveEntries = activeEntries(entries);
        const activeWordKeys = manifestActiveEntries.map((entry) =>
            buildWordStudyEntryKey({
                written: entry.word,
                reading: normalizeList(entry.readingIncludes)[0],
            })
        );

        for (const wordKey of activeWordKeys) {
            assert.ok(wordPitchAccentData.entries[wordKey], `${fileName} missing pitch source for ${wordKey}`);
        }

        const report = evaluateSapphireWordReviewSet({
            rows: buildSyntheticWordRows(manifestActiveEntries, wordPitchAccentData, goldenExpectations),
            entries: manifestActiveEntries,
            goldenExpectations,
            wordPitchAccentData,
        });

        assert.equal(report.passed, true, `${fileName}\n${formatSapphireWordReviewReport(report)}`);
    }
});

test("Sapphire word evaluator requires prior Gold when precondition enforcement is enabled", () => {
    const wordPitchAccentData = loadJson(path.join("templates", "word_pitch_accent_data.json"));
    const candidate = JSON.parse(JSON.stringify(
        loadJson(path.join("templates", "sapphire_n5_word_review_set.json"))
            .find((entry) => ACTIVE_WORD_SAPPHIRE_STATUSES.includes(entry.status))
    ));
    const goldenExpectations = loadJson(path.join("templates", "golden_n5_word_review_set.json"));
    const rows = buildSyntheticWordRows([candidate], wordPitchAccentData, goldenExpectations);

    const passingReport = evaluateSapphireWordReviewSet({
        rows,
        entries: [candidate],
        goldenExpectations,
        requireGoldPrecondition: true,
        requireCurrentReviewStandard: true,
    });
    const missingGoldReport = evaluateSapphireWordReviewSet({
        rows,
        entries: [candidate],
        goldenExpectations: [],
        requireGoldPrecondition: true,
        requireCurrentReviewStandard: true,
    });

    assert.equal(passingReport.passed, true, formatSapphireWordReviewReport(passingReport));
    assert.equal(missingGoldReport.passed, false);
    assert.match(missingGoldReport.results[0].failures.join("\n"), /Sapphire requires a prior Gold expectation/);
});

test("Sapphire word evaluator protects kanji breakdown snippets alongside reading breakdown", () => {
    const wordPitchAccentData = loadJson(path.join("templates", "word_pitch_accent_data.json"));
    const candidate = JSON.parse(JSON.stringify(
        loadJson(path.join("templates", "sapphire_n5_word_review_set.json"))
            .find((entry) => ACTIVE_WORD_SAPPHIRE_STATUSES.includes(entry.status))
    ));
    const reading = normalizeList(candidate.readingIncludes)[0];
    const goldenExpectations = loadJson(path.join("templates", "golden_n5_word_review_set.json"));
    const goldEntry = goldenExpectations.find((expectation) => buildWordStudyEntryKey({
        written: expectation.word,
        reading: normalizeList(expectation.readingIncludes)[0],
    }) === buildWordStudyEntryKey({
        written: candidate.word,
        reading,
    })) || {};
    const protectedList = (field) => {
        const goldValues = normalizeList(goldEntry[field]);
        return goldValues.length > 0 ? goldValues : normalizeList(candidate[field]);
    };
    const wordKey = buildWordStudyEntryKey({
        written: candidate.word,
        reading,
    });
    const pitchAccent = buildPitchAccentHtml({
        pattern: wordPitchAccentData.entries[wordKey]?.pattern || "",
        reading,
        sourceLabel: normalizePitchSourceLabel(wordPitchAccentData.entries[wordKey], wordPitchAccentData.sources || {}),
    });
    const row = {
        word: candidate.word,
        reading,
        readingBreakdown: `<ruby>${candidate.word}<rt>${reading}</rt></ruby>`,
        audio: `[sound:word-reading-${candidate.word}-${reading}.wav]`,
        pitchAccent,
        meaning: protectedList("meaningIncludes").join(" / "),
        jlptLevel: protectedList("jlptLevelIncludes")[0],
        coverageRole: protectedList("coverageRoleIncludes").join(" / "),
        focusKanji: protectedList("focusIncludes").join("、"),
        coversReading: protectedList("coversReadingIncludes").join(" ／ "),
        kanjiBreakdown: protectedList("breakdownIncludes").join(" ／ "),
        exampleSentence: protectedList("exampleIncludes").join(" / "),
        notes: protectedList("notesIncludes").join(" / "),
    };

    const report = evaluateSapphireWordReviewSet({
        rows: [row],
        entries: [candidate],
        goldenExpectations,
        wordPitchAccentData,
        requireCurrentReviewStandard: true,
    });

    assert.equal(report.passed, true, formatSapphireWordReviewReport(report));
});

test("Sapphire word evaluator compares escaped generated fields by visible text", () => {
    const entry = {
        word: "一時",
        status: "sapphire",
        readingIncludes: ["いちじ"],
        meaningIncludes: ["one o'clock"],
        jlptLevelIncludes: ["JLPT N5"],
        coverageRoleIncludes: ["JLPT core"],
        focusIncludes: ["一", "時"],
        coversReadingIncludes: ["一: いち", "時: じ"],
        breakdownIncludes: [
            "一 （いち） ／ one, 時 （じ） ／ time / o'clock",
        ],
        exampleIncludes: ["一時に"],
        pitchAccentIncludes: ["Pitch 1"],
        notesIncludes: ["一 -> いち", "o'clock"],
        selectionRationale: "Fixture for visible-text comparison.",
        reviewStandard: CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD,
        reviewedAt: "2026-06-10",
        revalidatedAt: "2026-06-10",
        reviewer: "test-fixture",
        revalidationSummary: "Current-standard visible-text comparison fixture.",
        migrationProvenance: {
            migratedFrom: "native-word-sapphire-review",
            authority: "Native Sapphire structural review entry. This is not Platinum card-surface inspection.",
        },
        sourceEvidence: [{
            type: "japanese-source",
            source: "test fixture",
            detail: "Fixture source checked 一時|いちじ.",
        }],
        internalChecks: [
            "generated-surface",
            "golden-regression",
            "level-contract",
            "media-audit",
            "audio-review",
            "pitch-accent-review",
            "label-review",
        ].map((type) => ({
            type,
            source: "test fixture",
            detail: `Fixture checked ${type}.`,
        })),
        reviewEvidence: [
            "example-review",
            "manual-review",
            "current-standard-review",
        ].map((type) => ({
            type,
            source: "test fixture",
            detail: `Fixture checked ${type}.`,
        })),
    };
    const row = {
        word: "一時",
        reading: "いちじ",
        readingBreakdown: "<ruby>一時<rt>いちじ</rt></ruby>",
        audio: "[sound:word-reading-一時-いちじ.wav]",
        pitchAccent: "<span aria-label=\"Pitch 1: 0\">Pitch 1: 0</span>",
        meaning: "one o&#39;clock",
        jlptLevel: "JLPT N5",
        coverageRole: "JLPT core",
        focusKanji: "一、時",
        coversReading: "一: いち ／ 時: じ",
        kanjiBreakdown: [
            "一 （いち） ／ one",
            "<span>stroke order reviewed</span>",
            "時 （じ） ／ time / o&#39;clock",
        ].join(" "),
        exampleSentence: "一時に行きます。",
        notes: "一 -&gt; いち / time / o&#39;clock",
    };

    const report = evaluateSapphireWordReviewSet({
        rows: [row],
        entries: [entry],
    });

    assert.equal(report.passed, true, formatSapphireWordReviewReport(report));
});

test("Sapphire word schema rejects Platinum-shaped candidates and inline Obsidian proof", () => {
    const entries = loadJson(path.join("templates", "sapphire_n5_word_review_set.json"));
    const candidate = entries.find((entry) => ACTIVE_WORD_SAPPHIRE_STATUSES.includes(entry.status));
    const platinumShapedCandidate = {
        ...candidate,
        status: "platinum",
        reviewStandard: "word-platinum-v3-evidence-lanes",
    };
    const proofShapedCandidate = {
        ...candidate,
        rereviewProvenance: {
            type: "substantive current standard rereview",
        },
    };

    assert.throws(
        () => parseSapphireWordReviewSet([platinumShapedCandidate], "bad candidate"),
        /bad candidate failed schema validation/i
    );
    assert.throws(
        () => parseSapphireWordReviewSet([proofShapedCandidate], "proof candidate"),
        /proof candidate failed schema validation/i
    );
});

test("Sapphire word promoter merges reviewed input and fails closed on unsafe candidates", () => {
    const wordPitchAccentData = loadJson(path.join("templates", "word_pitch_accent_data.json"));
    const candidate = JSON.parse(JSON.stringify(
        loadJson(path.join("templates", "sapphire_n5_word_review_set.json"))
            .find((entry) => ACTIVE_WORD_SAPPHIRE_STATUSES.includes(entry.status))
    ));
    const goldenExpectations = loadJson(path.join("templates", "golden_n5_word_review_set.json"));
    candidate.reviewer = "word-governance-sapphire-review";
    const rows = buildSyntheticWordRows([candidate], wordPitchAccentData, goldenExpectations);
    const promoted = promoteSapphireWordBatch({
        existingEntries: [],
        candidateEntries: [candidate],
        rows,
        goldenExpectations,
    });

    assert.equal(promoted.summary.candidateEntries, 1);
    assert.deepEqual(promoted.summary.promotedWords, [`${candidate.word}|${normalizeList(candidate.readingIncludes)[0]}`]);
    assert.equal(promoted.summary.outputEntries, 1);

    assert.throws(
        () => promoteSapphireWordBatch({
            existingEntries: [],
            candidateEntries: [candidate, candidate],
            rows,
            goldenExpectations,
        }),
        /Duplicate Sapphire word candidate identities/
    );
    assert.throws(
        () => promoteSapphireWordBatch({
            existingEntries: [candidate],
            candidateEntries: [candidate],
            rows,
            goldenExpectations,
        }),
        /already exist/
    );

    const platinumShapedCandidate = {
        ...candidate,
        status: "platinum",
        reviewStandard: "word-platinum-v3-evidence-lanes",
    };
    const platinumReviewerCandidate = {
        ...candidate,
        reviewer: "codex-platinum-review",
    };
    assert.throws(
        () => promoteSapphireWordBatch({
            existingEntries: [],
            candidateEntries: [platinumReviewerCandidate],
            rows,
            goldenExpectations,
        }),
        /must not use Platinum reviewer identity/
    );
    assert.throws(
        () => promoteSapphireWordBatch({
            existingEntries: [],
            candidateEntries: [platinumShapedCandidate],
            rows,
            goldenExpectations,
        }),
        /Sapphire word candidate batch failed schema validation/i
    );
});
