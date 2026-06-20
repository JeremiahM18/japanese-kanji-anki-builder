const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildPlatinumWordBatchReport,
    exampleReadingContainsWordReading,
    exampleSentenceContainsWrittenWord,
    formatPlatinumWordBatchReport,
    WORD_BATCH_QUEUE_MODES,
} = require("../src/services/platinumWordBatchReportService");
const {
    CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
    REQUIRED_WORD_INTERNAL_CHECK_TYPES,
    REQUIRED_WORD_QUALITY_GATES,
    REQUIRED_WORD_REVIEW_EVIDENCE_TYPES,
    REQUIRED_WORD_SOURCE_EVIDENCE_TYPES,
} = require("../src/services/platinumReviewService");
const {
    CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD,
} = require("../src/services/sapphireWordReviewService");

const kanjiumSource = "kanjium-cc-by-sa-4.0";
const generatedSource = "voicevox-nemo-accent-query";

const wordPitchAccentData = {
    sources: {
        [kanjiumSource]: {
            name: "Kanjium pitch accent database",
        },
        [generatedSource]: {
            name: "VOICEVOX generated pitch",
            notes: "Generated from VOICEVOX accent query.",
        },
    },
    entries: {
        "今日|きょう": {
            pattern: "0 [heiban]",
            sourceId: kanjiumSource,
            sourceWord: "今日",
            sourceReading: "きょう",
            sourceAccent: "0",
        },
        "八|はち": {
            pattern: "2 [odaka]",
            sourceId: generatedSource,
            sourceQuery: "八",
            generatedReading: "はち",
        },
    },
};

const rows = [
    {
        word: "今日",
        reading: "きょう",
        readingBreakdown: "<ruby>今日<rt>きょう</rt></ruby>",
        audio: "[sound:word-reading-今日-きょう.wav]",
        pitchAccent: "<div aria-label=\"Pitch 1: 0\"></div>",
        meaning: "today",
        jlptLevel: "JLPT N5",
        coverageRole: "JLPT core + reading coverage",
        focusKanji: "今、日",
        coversReading: "今: いま ／ 日: ひ",
        kanjiBreakdown: "<div class=\"kanji-level-badge\">JLPT N5 kanji</div>",
        exampleSentence: "今日は図書館へ行きます。 ／ きょうはとしょかんへいきます。 ／ I go to the library today.",
        notes: "",
    },
    {
        word: "八",
        reading: "はち",
        readingBreakdown: "<ruby>八<rt>はち</rt></ruby>",
        audio: "[sound:word-reading-八-はち.wav]",
        pitchAccent: "<div aria-label=\"Pitch 1: 2\"></div><div>Generated pitch (unverified)</div>",
        meaning: "eight",
        jlptLevel: "JLPT N5",
        coverageRole: "JLPT core + reading coverage",
        focusKanji: "八",
        coversReading: "八: はち",
        kanjiBreakdown: "<div>八 （はち） ／ eight</div>",
        exampleSentence: "数字を八から十まで言います。 ／ すうじをはちからじゅうまでいいます。 ／ I say the numbers from eight to ten.",
        notes: "Common number.",
    },
];

function buildStructuralCurrentWordEntry(overrides = {}) {
    return {
        word: "今日",
        status: "platinum",
        readingIncludes: ["きょう"],
        reviewStandard: CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
        revalidatedAt: "2026-05-14",
        revalidationSummary: "Revalidated evidence lanes for generated surface, Japanese-source evidence, example sentence, notes/support surface, reading breakdown, labels, audio, pitch accent, media provenance, and verification limitations under the current word platinum standard.",
        notesIncludes: ["Common word."],
        selectionRationale: "Fixture current-standard structural entry.",
        qualityGates: Object.fromEntries(REQUIRED_WORD_QUALITY_GATES.map((gate) => [gate, true])),
        sourceEvidence: REQUIRED_WORD_SOURCE_EVIDENCE_TYPES.map((type) => ({ type, source: "fixture source", detail: "fixture detail" })),
        internalChecks: REQUIRED_WORD_INTERNAL_CHECK_TYPES.map((type) => ({ type, source: "fixture source", detail: "fixture detail" })),
        reviewEvidence: REQUIRED_WORD_REVIEW_EVIDENCE_TYPES.map((type) => ({ type, source: "fixture source", detail: "fixture detail" })),
        ...overrides,
    };
}

function buildCurrentStandardSapphireWordEntry(overrides = {}) {
    return {
        word: "今日",
        status: "sapphire",
        readingIncludes: ["きょう"],
        reviewStandard: CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD,
        ...overrides,
    };
}

const sapphireEntries = [
    buildCurrentStandardSapphireWordEntry(),
    buildCurrentStandardSapphireWordEntry({ word: "八", readingIncludes: ["はち"] }),
];

test("word batch report selects rows missing current-standard platinum and surfaces review risks", () => {
    const report = buildPlatinumWordBatchReport({
        rows,
        entries: [{ word: "今日", status: "platinum", readingIncludes: ["きょう"] }],
        sapphireEntries,
        wordPitchAccentData,
        level: 5,
        limit: 12,
    });

    assert.equal(report.summary.generatedRows, 2);
    assert.equal(report.summary.activePlatinum, 1);
    assert.equal(report.summary.currentStandardPlatinum, 0);
    assert.equal(report.summary.legacyOrUnversionedPlatinum, 1);
    assert.equal(report.summary.sapphireEligibleRows, 2);
    assert.equal(report.summary.blockedByMissingSapphire, 0);
    assert.equal(report.summary.remainingPlatinum, 1);
    assert.equal(report.summary.remainingCurrentStandard, 2);
    assert.equal(report.summary.substantiveRereviewProven, undefined);
    assert.equal(report.summary.remainingSubstantiveRereview, undefined);
    assert.equal(report.nextSubstantiveRereviewWords, undefined);
    assert.equal(report.cards.length, 2);
    assert.equal(report.cards[0].identity, "今日|きょう");
    assert.equal(report.cards[0].reviewStatus, "legacy_unversioned_platinum");
    assert.match(report.cards[0].suggestedReviewStep, /revalidate existing platinum/);
    assert.equal(report.cards[1].identity, "八|はち");
    assert.equal(report.cards[1].hardChecksPassed, true);
    assert.ok(report.cards[1].riskFlags.some((flag) => /generated pitch/.test(flag)));
    assert.ok(report.cards[1].riskFlags.some((flag) => /single-kanji word/.test(flag)));
    assert.match(report.cards[1].suggestedReviewStep, /source-check pitch/);
    assert.match(formatPlatinumWordBatchReport(report), /This report is read-only/);
    assert.match(formatPlatinumWordBatchReport(report), /Next missing current-standard Platinum queue/);
    assert.doesNotMatch(formatPlatinumWordBatchReport(report), /Obsidian certified|Remaining Obsidian certification/);
    assert.match(formatPlatinumWordBatchReport(report), /Default queue is missing-current-standard Platinum/);
});

test("word batch report blocks unscoped Platinum queues without current-standard Sapphire", () => {
    const report = buildPlatinumWordBatchReport({
        rows,
        entries: [],
        wordPitchAccentData,
        level: 5,
        limit: 12,
    });

    assert.equal(report.summary.sapphireEligibleRows, 0);
    assert.equal(report.summary.blockedByMissingSapphire, 2);
    assert.equal(report.summary.remainingCurrentStandard, 0);
    assert.equal(report.cards.length, 0);
});

test("word batch report keeps Platinum-only current-standard entries in the explicit Obsidian proof queue", () => {
    const report = buildPlatinumWordBatchReport({
        rows,
        entries: [buildStructuralCurrentWordEntry()],
        sapphireEntries,
        wordPitchAccentData,
        level: 5,
        limit: 1,
        queue: WORD_BATCH_QUEUE_MODES.SUBSTANTIVE_REREVIEW,
    });

    assert.equal(report.queue, WORD_BATCH_QUEUE_MODES.SUBSTANTIVE_REREVIEW);
    assert.equal(report.summary.currentStandardPlatinum, 1);
    assert.equal(report.summary.substantiveRereviewProven, 0);
    assert.equal(report.summary.remainingSubstantiveRereview, 2);
    assert.equal(report.cards[0].identity, "今日|きょう");
    assert.equal(report.cards[0].reviewStatus, "current_standard_platinum_only");
    assert.match(report.cards[0].suggestedReviewStep, /Platinum is not Obsidian proof/);
});

test("word batch report does not treat base rereview provenance as Obsidian proof", () => {
    const report = buildPlatinumWordBatchReport({
        rows,
        entries: [buildStructuralCurrentWordEntry({
            rereviewProvenance: {
                type: "substantive current standard rereview",
                reviewStandard: CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
                reviewedAfterStandard: true,
                mechanicalMigration: false,
                reviewer: "content-review",
            },
        })],
        sapphireEntries,
        wordPitchAccentData,
        level: 5,
        limit: 1,
        queue: WORD_BATCH_QUEUE_MODES.SUBSTANTIVE_REREVIEW,
    });

    assert.equal(report.summary.substantiveRereviewProven, 0);
    assert.equal(report.summary.remainingSubstantiveRereview, 2);
    assert.equal(report.cards[0].identity, "今日|きょう");
    assert.equal(report.cards[0].reviewStatus, "current_standard_platinum_only");
});

test("word batch report defaults to missing current-standard Platinum queue", () => {
    const report = buildPlatinumWordBatchReport({
        rows,
        entries: [buildStructuralCurrentWordEntry()],
        sapphireEntries,
        wordPitchAccentData,
        level: 5,
        limit: 1,
    });

    assert.equal(report.queue, WORD_BATCH_QUEUE_MODES.MISSING_CURRENT_STANDARD);
    assert.equal(report.cards[0].identity, "八|はち");
    assert.equal(report.summary.remainingCurrentStandard, 1);
    assert.equal(report.summary.substantiveRereviewProven, undefined);
    assert.equal(report.summary.remainingSubstantiveRereview, undefined);
    assert.equal(report.nextSubstantiveRereviewWords, undefined);
    assert.match(formatPlatinumWordBatchReport(report), /Next missing current-standard Platinum queue/);
});

test("scoped word batch report keeps formatted output focused on requested cards", () => {
    const report = buildPlatinumWordBatchReport({
        rows,
        entries: [{ word: "今日", status: "platinum", readingIncludes: ["きょう"] }],
        sapphireEntries,
        wordPitchAccentData,
        level: 5,
        words: [{ word: "八", reading: "はち" }],
    });
    const formatted = formatPlatinumWordBatchReport(report);

    assert.equal(report.scopedToRequestedWords, true);
    assert.equal(report.nextMissingWords.length, 2);
    assert.doesNotMatch(formatted, /Next missing current-standard queue/);
    assert.match(formatted, /八\|はち/);
});

test("word batch sentence evidence allows normal inflected readings", () => {
    assert.equal(exampleSentenceContainsWrittenWord("赤ちゃんが春に生まれます。", "生まれる"), true);
    assert.equal(exampleSentenceContainsWrittenWord("毎朝新聞を読みます。", "読む"), true);
    assert.equal(exampleSentenceContainsWrittenWord("番組を録って後で見ます。", "録る"), true);
    assert.equal(exampleSentenceContainsWrittenWord("古い板が湿気で反っています。", "反る"), true);
    assert.equal(exampleReadingContainsWordReading("かいだんをあがります", "あがる"), true);
    assert.equal(exampleReadingContainsWordReading("ほんをよみます", "よむ"), true);
    assert.equal(exampleReadingContainsWordReading("ばんぐみをとってあとでみます", "とる"), true);
    assert.equal(exampleReadingContainsWordReading("ふるいいたがしっけでそっています", "そる"), true);
    assert.equal(exampleReadingContainsWordReading("へやがあかるくなります", "あかるい"), true);
    assert.equal(exampleReadingContainsWordReading("きょうはとしょかんへいきます", "あした"), false);
});

test("word batch sentence evidence allows preserved katakana loanword spans", () => {
    assert.equal(
        exampleReadingContainsWordReading("ちちはみせでなまビールをのみました", "なまびーる"),
        true
    );
});
