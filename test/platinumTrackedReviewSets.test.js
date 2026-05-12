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

const ROOT_DIR = path.resolve(__dirname, "..");
const TEMPLATES_DIR = path.join(ROOT_DIR, "templates");

function loadJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8"));
}

function normalizeList(values = []) {
    return (Array.isArray(values) ? values : []).filter(Boolean);
}

function activeEntries(entries = [], activeStatuses = []) {
    return entries.filter((entry) => activeStatuses.includes(entry.status));
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
