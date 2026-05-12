const test = require("node:test");
const assert = require("node:assert/strict");

const {
    addCoverageFailures,
    mapTsvRows,
} = require("../scripts/reviewGoldenAdditionalKanjiLevel");

test("mapTsvRows maps generated additional kanji TSV fields for golden review", () => {
    const rows = mapTsvRows([
        "Kanji\tDisplayWord\tMeaningJP\tPrimaryReading\tKanjiMeanings\tStudyWordKanji\tOnReading\tKunReading\tStrokeOrder\tAudio\tRadical\tNotes\tExampleSentence",
        "学\t学\tstudy\tがく\tstudy\t\tガク\tまな.ぶ\t[sound:stroke.gif]\t[sound:学.wav]\t学\tAdditional unverified N5 source claim.\t学校へ行きます。",
    ].join("\n"));

    assert.deepEqual(rows, [
        {
            kanji: "学",
            displayWord: "学",
            meaningJP: "study",
            primaryReading: "がく",
            kanjiMeanings: "study",
            studyWordKanji: "",
            onReading: "ガク",
            kunReading: "まな.ぶ",
            strokeOrder: "[sound:stroke.gif]",
            audio: "[sound:学.wav]",
            radical: "学",
            notes: "Additional unverified N5 source claim.",
            exampleSentence: "学校へ行きます。",
        },
    ]);
});

test("addCoverageFailures requires expectations for every generated additional kanji", () => {
    const report = addCoverageFailures({
        passed: true,
        results: [],
    }, {
        rows: [{ kanji: "学" }, { kanji: "本" }],
        expectations: [{ kanji: "学" }],
        requireAllRows: true,
    });

    assert.equal(report.passed, false);
    assert.deepEqual(report.missingExpectations, ["本"]);
    assert.deepEqual(report.coverageFailures, ["missing expectations for generated kanji: 本"]);
});
