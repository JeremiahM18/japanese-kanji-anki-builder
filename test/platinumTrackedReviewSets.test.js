const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    ACTIVE_PLATINUM_STATUSES: ACTIVE_KANJI_PLATINUM_STATUSES,
    evaluatePlatinumKanjiReviewSet,
    formatPlatinumKanjiReviewReport,
} = require("../src/services/platinumKanjiReviewService");
const {
    ACTIVE_PLATINUM_STATUSES: ACTIVE_WORD_PLATINUM_STATUSES,
    evaluatePlatinumWordReviewSet,
    formatPlatinumWordReviewReport,
} = require("../src/services/platinumReviewService");
const { buildPitchAccentHtml } = require("../src/services/pitchAccentRenderService");
const {
    GENERATED_PITCH_LABEL,
    isGeneratedPitchAccentSource,
} = require("../src/services/wordPitchAccentVerificationService");
const { buildWordStudyEntryKey } = require("../src/datasets/wordStudyData");
const { normalizeJapaneseReading } = require("../src/utils/japanese");

const ROOT_DIR = path.resolve(__dirname, "..");
const TEMPLATES_DIR = path.join(ROOT_DIR, "templates");

const KNOWN_KANJI_PRIMARY_READING_REGRESSION_GUARDS = Object.freeze([
    { level: 3, kanji: "久", rejectedReading: "ひさしぶり", expectedReading: "ひさしい" },
    { level: 3, kanji: "亡", rejectedReading: "なくなる", expectedReading: "ぼう" },
    { level: 3, kanji: "信", rejectedReading: "しんじる", expectedReading: "しん" },
    { level: 3, kanji: "察", rejectedReading: "さっする", expectedReading: "さつ" },
    { level: 3, kanji: "常", rejectedReading: "つねに", expectedReading: "じょう" },
    { level: 3, kanji: "感", rejectedReading: "かんじる", expectedReading: "かん" },
    { level: 3, kanji: "礼", rejectedReading: "おれい", expectedReading: "れい" },
    { level: 3, kanji: "腹", rejectedReading: "おなか", expectedReading: "はら" },
    { level: 4, kanji: "好", rejectedReading: "すき", expectedReading: "このむ" },
]);

function loadJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8"));
}

function normalizeList(values = []) {
    return (Array.isArray(values) ? values : []).filter(Boolean);
}

function activeEntries(entries = [], activeStatuses = []) {
    return entries.filter((entry) => activeStatuses.includes(entry.status));
}

function buildKanjiReadingReferenceSet(entry = {}) {
    return new Set([
        ...normalizeList(entry.normalizedOnReadings),
        ...normalizeList(entry.normalizedKunReadings),
    ]);
}

function buildSyntheticKanjiRows(entries = [], levelLabel = "") {
    return activeEntries(entries, ACTIVE_KANJI_PLATINUM_STATUSES).map((entry) => {
        const kanji = entry.kanji;
        const primaryReading = normalizeList(entry.readingIncludes)[0] || "";

        return {
            kanji,
            levelLabel,
            displayWord: kanji,
            meaningJP: normalizeList(entry.meaningIncludes).join(" / "),
            primaryReading,
            kanjiMeanings: normalizeList(entry.kanjiMeaningsIncludes).join(" / "),
            studyWordKanji: "",
            onReading: "",
            kunReading: "",
            strokeOrder: `<img src="${kanji}-stroke-order.gif" />`,
            audio: `[sound:${kanji}-kanji-reading-${kanji}-${primaryReading}.wav]`,
            radical: "",
            notes: normalizeList(entry.notesIncludes).join(" / "),
            exampleSentence: normalizeList(entry.exampleIncludes).join(" / "),
        };
    });
}

function buildSyntheticWordRows(entries = [], wordPitchAccentData = {}) {
    return activeEntries(entries, ACTIVE_WORD_PLATINUM_STATUSES).map((entry) => {
        const reading = normalizeList(entry.readingIncludes)[0] || "";
        const wordKey = buildWordStudyEntryKey({ written: entry.word, reading });
        const pitchEntry = wordPitchAccentData.entries?.[wordKey] || {};
        const pitchPattern = pitchEntry.pattern || "";
        const sourceLabel = isGeneratedPitchAccentSource({
            sourceId: pitchEntry.sourceId,
            source: wordPitchAccentData.sources?.[pitchEntry.sourceId],
        }) ? GENERATED_PITCH_LABEL : "";

        return {
            word: entry.word,
            reading,
            readingBreakdown: normalizeList(entry.breakdownIncludes).join(" / "),
            audio: `[sound:${entry.word}-word-reading-${entry.word}-${reading}.wav]`,
            pitchAccent: buildPitchAccentHtml({ pattern: pitchPattern, reading, sourceLabel }),
            meaning: normalizeList(entry.meaningIncludes).join(" / "),
            jlptLevel: normalizeList(entry.jlptLevelIncludes).join(" / "),
            coverageRole: normalizeList(entry.coverageRoleIncludes).join(" / "),
            focusKanji: normalizeList(entry.focusIncludes).join(" / "),
            coversReading: normalizeList(entry.coversReadingIncludes).join(" / "),
            kanjiBreakdown: normalizeList(entry.breakdownIncludes).join(" / "),
            exampleSentence: normalizeList(entry.exampleIncludes).join(" / "),
            notes: normalizeList(entry.notesIncludes).join(" / "),
        };
    });
}

test("tracked populated kanji platinum manifests bind evidence to protected fields", () => {
    const platinumFiles = fs
        .readdirSync(TEMPLATES_DIR)
        .filter((name) => (
            /^platinum_n[1-5]_review_set\.json$/.test(name)
            || /^platinum_additional_unverified_n[1-5]_review_set\.json$/.test(name)
        ))
        .sort();

    for (const fileName of platinumFiles) {
        const entries = loadJson(path.join("templates", fileName));
        if (entries.length === 0) {
            continue;
        }

        const level = fileName.match(/^platinum_(?:additional_unverified_)?n([1-5])_review_set\.json$/)?.[1];
        const report = evaluatePlatinumKanjiReviewSet({
            rows: buildSyntheticKanjiRows(entries, `N${level}`),
            entries,
        });

        assert.equal(report.passed, true, `${fileName}\n${formatPlatinumKanjiReviewReport(report)}`);
    }
});

test("tracked kanji platinum manifests do not regress known support-word primary readings", () => {
    for (const guard of KNOWN_KANJI_PRIMARY_READING_REGRESSION_GUARDS) {
        const fileName = `platinum_n${guard.level}_review_set.json`;
        const entries = loadJson(path.join("templates", fileName));
        const entry = activeEntries(entries, ACTIVE_KANJI_PLATINUM_STATUSES)
            .find((candidate) => candidate.kanji === guard.kanji);
        const primaryReading = normalizeList(entry?.readingIncludes)[0] || "";

        assert.ok(entry, `${fileName} missing active tracked regression guard for ${guard.kanji}`);
        assert.notEqual(
            primaryReading,
            guard.rejectedReading,
            `${fileName} ${guard.kanji} must not regress to support-word primary reading ${guard.rejectedReading}`
        );
        assert.equal(
            primaryReading,
            guard.expectedReading,
            `${fileName} ${guard.kanji} must keep its tracked corrected primary reading; update this guard only with governed reading evidence`
        );
    }
});

test("tracked active N3 through N5 kanji platinum primary readings are exact governed on/kun readings", () => {
    const readingReference = loadJson(path.join("templates", "kanji_reading_reference_contract.json"));

    for (const level of [3, 4, 5]) {
        const fileName = `platinum_n${level}_review_set.json`;
        const entries = loadJson(path.join("templates", fileName));
        const manifestActiveEntries = activeEntries(entries, ACTIVE_KANJI_PLATINUM_STATUSES);

        for (const entry of manifestActiveEntries) {
            const primaryReading = normalizeJapaneseReading(normalizeList(entry.readingIncludes)[0] || "");
            const sourceReadings = buildKanjiReadingReferenceSet(readingReference.entries?.[entry.kanji]);

            assert.ok(sourceReadings.size > 0, `${fileName} missing governed KANJIDIC2 reading reference for ${entry.kanji}`);
            assert.ok(
                sourceReadings.has(primaryReading),
                `${fileName} ${entry.kanji}|${normalizeList(entry.readingIncludes)[0] || ""} must be an exact governed KANJIDIC2 on/kun reading`
            );
        }
    }
});

test("tracked populated word platinum manifests bind evidence to protected fields and pitch sources", () => {
    const wordPitchAccentData = loadJson(path.join("templates", "word_pitch_accent_data.json"));
    const platinumFiles = fs
        .readdirSync(TEMPLATES_DIR)
        .filter((name) => /^platinum_n[1-5]_word_review_set\.json$/.test(name))
        .sort();

    for (const fileName of platinumFiles) {
        const entries = loadJson(path.join("templates", fileName));
        const manifestActiveEntries = activeEntries(entries, ACTIVE_WORD_PLATINUM_STATUSES);
        if (manifestActiveEntries.length === 0) {
            continue;
        }

        const activeWordKeys = manifestActiveEntries.map((entry) =>
            buildWordStudyEntryKey({
                written: entry.word,
                reading: normalizeList(entry.readingIncludes)[0],
            })
        );

        for (const wordKey of activeWordKeys) {
            assert.ok(wordPitchAccentData.entries[wordKey], `${fileName} missing pitch source for ${wordKey}`);
        }

        const report = evaluatePlatinumWordReviewSet({
            rows: buildSyntheticWordRows(manifestActiveEntries, wordPitchAccentData),
            entries: manifestActiveEntries,
            wordPitchAccentData,
        });

        assert.equal(report.passed, true, `${fileName}\n${formatPlatinumWordReviewReport(report)}`);
    }
});
