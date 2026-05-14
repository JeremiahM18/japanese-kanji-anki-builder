const test = require("node:test");
const assert = require("node:assert/strict");

const { CURRENT_WORD_PLATINUM_REVIEW_STANDARD } = require("../src/services/platinumReviewService");
const {
    WORD_SOURCE_INDEPENDENCE_LIMITATION_MARKER,
    WORD_SOURCE_ORIGIN_LIMITATION_MARKER,
    buildPlatinumWordSourcePostureReport,
    buildPlatinumWordSourcePostureSummary,
    classifyWordSourcePosture,
    formatPlatinumWordSourcePostureReport,
} = require("../src/services/platinumWordSourcePostureService");

function buildEntry(overrides = {}) {
    return {
        word: "今日",
        status: "platinum",
        readingIncludes: ["きょう"],
        reviewStandard: CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
        revalidatedAt: "2026-05-14",
        revalidationSummary: "Revalidated evidence lanes for generated surface, Japanese-source evidence, example sentence, notes/support surface, reading breakdown, labels, audio, pitch accent, media provenance, and verification limitations under the current word platinum standard.",
        notesIncludes: ["Common word."],
        sourceEvidence: [{
            type: "japanese-source",
            source: "JMdict governed local row downloads/jmdict-word-verification.tsv",
            detail: "JMdict verifies 今日|きょう, reading きょう, meaning today, and example 今日は図書館へ行きます。",
        }],
        reviewEvidence: [{
            type: "current-standard-review",
            source: "manual review fixture",
            detail: "Current-standard whole-card revalidation checked 今日|きょう.",
        }],
        ...overrides,
    };
}

test("word source posture classifies governed mono-source evidence separately from independent corroboration", () => {
    const posture = classifyWordSourcePosture(buildEntry());

    assert.equal(posture.category, "single_source_family");
    assert.deepEqual(posture.sourceIds, ["jmdict"]);
    assert.deepEqual(posture.sourceGroups, ["edrdg_dictionary"]);
    assert.equal(posture.markers.includes(WORD_SOURCE_INDEPENDENCE_LIMITATION_MARKER), true);
    assert.equal(posture.markers.includes(WORD_SOURCE_ORIGIN_LIMITATION_MARKER), true);
});

test("word source posture recognizes independent source families when evidence cites two governed sources", () => {
    const posture = classifyWordSourcePosture(buildEntry({
        sourceEvidence: [{
            type: "japanese-source",
            source: "JMdict governed local row downloads/jmdict-word-verification.tsv; JLearn.net Japanese Dictionary https://jlearn.net/dictionary/%E4%BB%8A%E6%97%A5",
            detail: "JMdict and JLearn verify 今日|きょう, reading きょう, meaning today, and example 今日は図書館へ行きます。",
        }],
    }));

    assert.equal(posture.category, "independent_source_families_proven");
    assert.deepEqual(posture.sourceIds, ["jlearn", "jmdict"]);
    assert.deepEqual(posture.sourceGroups, ["edrdg_dictionary", "jlearn"]);
    assert.equal(posture.markers.includes(WORD_SOURCE_INDEPENDENCE_LIMITATION_MARKER), false);
});

test("word source posture reports missing governed source evidence", () => {
    const report = buildPlatinumWordSourcePostureReport({
        level: 5,
        entries: [buildEntry({
            sourceEvidence: [{
                type: "japanese-source",
                source: "templates/starter_word_study_data.json",
                detail: "Tracked starter data says 今日|きょう.",
            }],
        })],
    });

    assert.equal(report.passed, false);
    assert.equal(report.counts.missing_governed_source, 1);
    assert.equal(report.counts.single_source_family, 0);
});

test("word source posture allows kanji references only for single-kanji word field checks", () => {
    const singleKanji = classifyWordSourcePosture(buildEntry({
        word: "土",
        readingIncludes: ["つち"],
        sourceEvidence: [{
            type: "japanese-source",
            source: "https://www.kanjipedia.jp/kanji/0005127900",
            detail: "Kanjipedia verifies 土|つち, reading つち, and meaning soil.",
        }],
    }));
    const multiKanji = classifyWordSourcePosture(buildEntry({
        sourceEvidence: [{
            type: "japanese-source",
            source: "https://www.kanjipedia.jp/kanji/0005127900",
            detail: "Kanjipedia verifies 今日|きょう.",
        }],
    }));

    assert.equal(singleKanji.category, "single_source_family");
    assert.deepEqual(singleKanji.sourceIds, ["kanjipedia"]);
    assert.equal(multiKanji.category, "missing_governed_source");
});

test("formatted word source posture report is explicit about source independence limits", () => {
    const report = buildPlatinumWordSourcePostureReport({
        level: 5,
        entries: [buildEntry()],
    });
    const summary = buildPlatinumWordSourcePostureSummary([report]);
    const formatted = formatPlatinumWordSourcePostureReport(summary);

    assert.match(formatted, /Platinum Word Source Posture/);
    assert.match(formatted, /Independent source families proven/);
    assert.match(formatted, new RegExp(WORD_SOURCE_INDEPENDENCE_LIMITATION_MARKER));
    assert.match(formatted, new RegExp(WORD_SOURCE_ORIGIN_LIMITATION_MARKER));
    assert.match(formatted, /This report is read-only/);
});
