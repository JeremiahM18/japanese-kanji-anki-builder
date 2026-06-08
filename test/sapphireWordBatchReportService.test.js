const test = require("node:test");
const assert = require("node:assert/strict");

const {
    WORD_BATCH_QUEUE_MODES,
    buildSapphireWordBatchReport,
    formatSapphireWordBatchReport,
} = require("../src/services/sapphireWordBatchReportService");
const {
    CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD,
} = require("../src/services/sapphireWordReviewService");

const wordPitchAccentData = {
    sources: {
        "kanjium-cc-by-sa-4.0": {
            name: "Kanjium pitch accent database",
        },
        "voicevox-nemo-accent-query": {
            name: "VOICEVOX generated pitch",
            notes: "Generated from VOICEVOX accent query.",
        },
    },
    entries: {
        "今日|きょう": {
            pattern: "0 [heiban]",
            sourceId: "kanjium-cc-by-sa-4.0",
            sourceWord: "今日",
            sourceReading: "きょう",
            sourceAccent: "0",
        },
        "八|はち": {
            pattern: "2 [odaka]",
            sourceId: "voicevox-nemo-accent-query",
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
        kanjiBreakdown: "<div>今 （いま） ／ now ... 日 （ひ） ／ day / sun</div>",
        exampleSentence: "今日は図書館へ行きます。 ／ きょうはとしょかんへいきます。 ／ I go to the library today.",
        notes: "Common word.",
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

function buildSapphireEntry(overrides = {}) {
    return {
        word: "今日",
        status: "sapphire",
        readingIncludes: ["きょう"],
        reviewStandard: CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD,
        revalidatedAt: "2026-06-05",
        revalidationSummary: "Revalidated evidence lanes for generated surface, Japanese-source evidence, example sentence, notes/support surface, reading breakdown, labels, audio, pitch accent, media provenance, and verification limitations under the current word Sapphire standard.",
        notesIncludes: ["Common word."],
        reviewEvidence: [
            {
                type: "current-standard-review",
                source: "Sapphire fixture",
                detail: "Current-standard Sapphire fixture.",
            },
        ],
        selectionRationale: "Fixture current-standard Sapphire structural entry.",
        migrationProvenance: {
            migratedAt: "2026-06-05",
            migratedFrom: "templates/platinum_n5_word_review_set.json",
            migrationType: "word-platinum-compatibility-to-first-class-sapphire",
            authority: "Preserves structural review as Sapphire only; not Platinum or Obsidian proof.",
        },
        ...overrides,
    };
}

test("word Sapphire batch report defaults to missing current-standard structure", () => {
    const report = buildSapphireWordBatchReport({
        rows,
        entries: [buildSapphireEntry()],
        wordPitchAccentData,
        level: 5,
        limit: 12,
    });
    const formatted = formatSapphireWordBatchReport(report);

    assert.equal(report.queue, WORD_BATCH_QUEUE_MODES.MISSING_CURRENT_STANDARD);
    assert.equal(report.summary.generatedRows, 2);
    assert.equal(report.summary.activeSapphire, 1);
    assert.equal(report.summary.currentStandardSapphire, 1);
    assert.equal(report.summary.remainingSapphire, 1);
    assert.equal(report.cards.length, 1);
    assert.equal(report.cards[0].identity, "八|はち");
    assert.equal(report.cards[0].reviewStatus, "missing_sapphire");
    assert.match(formatted, /Sapphire N5 Word Batch Report/);
    assert.match(formatted, /not Platinum content certification, Obsidian proof, or release readiness/);
    assert.match(formatted, /Next missing current-standard Sapphire queue/);
    assert.doesNotMatch(formatted, /Missing Platinum/);
});

test("word Sapphire scoped report maps current-standard structural status without Obsidian claims", () => {
    const report = buildSapphireWordBatchReport({
        rows,
        entries: [buildSapphireEntry()],
        wordPitchAccentData,
        level: 5,
        words: [{ word: "今日", reading: "きょう" }],
    });
    const formatted = formatSapphireWordBatchReport(report);

    assert.equal(report.scopedToRequestedWords, true);
    assert.equal(report.cards.length, 1);
    assert.equal(report.cards[0].identity, "今日|きょう");
    assert.equal(report.cards[0].reviewStatus, "current_standard_sapphire");
    assert.match(report.cards[0].suggestedReviewStep, /already Sapphire/);
    assert.match(formatted, /Platinum content certification and Obsidian proof remain separate/);
});
