const test = require("node:test");
const assert = require("node:assert/strict");

const {
    assertKanjiDeckContract,
    buildKanjiDeckContractReport,
    formatKanjiDeckContractReport,
} = require("../src/services/kanjiDeckContractService");

const HEADER = "Kanji\tDisplayWord\tMeaningJP\tPrimaryReading\tKanjiMeanings\tStudyWordKanji\tOnReading\tKunReading\tStrokeOrder\tAudio\tRadical\tNotes\tExampleSentence";

test("buildKanjiDeckContractReport accepts individual-kanji card anchors", () => {
    const report = buildKanjiDeckContractReport({
        level: 5,
        tsv: [
            HEADER,
            "車\t車\tcar\tくるま\tcar\t\tオン: シャ\tくん: くるま\t<img src=\"8ECA.gif\" />\t<img src=\"8ECA.png\" />\t[sound:8ECA_車-kanji-reading-車-くるま.wav]\t車\t電車 （でんしゃ） - train\t電車で行きます。",
        ].join("\n"),
    });

    assert.equal(report.valid, true);
    assert.equal(report.rowCount, 1);
    assert.deepEqual(report.violations, []);
    assert.doesNotThrow(() => assertKanjiDeckContract(report));
});

test("buildKanjiDeckContractReport rejects compound kanji-deck anchors", () => {
    const report = buildKanjiDeckContractReport({
        level: 5,
        tsv: [
            HEADER,
            "車\t電車\ttrain\tでんしゃ\tcar\t車: JLPT N5\tオン: シャ\tくん: くるま\t\t\t[sound:8ECA_車-kanji-reading-電車-でんしゃ.wav]\t車\ttrain context\t電車で行きます。",
        ].join("\n"),
    });

    assert.equal(report.valid, false);
    assert.deepEqual(report.violations.map((violation) => violation.code), [
        "compound_anchor",
        "kanji_card_study_word_labels",
    ]);
    assert.throws(() => assertKanjiDeckContract(report), /DisplayWord must equal the target kanji/);
});

test("buildKanjiDeckContractReport rejects missing primary readings product-wide", () => {
    const report = buildKanjiDeckContractReport({
        level: 3,
        tsv: [
            HEADER,
            "誕\t誕\tbirth\t\tbirth\t\tオン: タン\t\t\t\t\t言\t誕生日 （たんじょうび） - birthday\t誕生日を祝います。",
        ].join("\n"),
    });
    const text = formatKanjiDeckContractReport(report);

    assert.equal(report.valid, false);
    assert.deepEqual(report.violations.map((violation) => violation.code), ["missing_primary_reading"]);
    assert.match(text, /Kanji deck contract failed for N3/);
    assert.match(text, /PrimaryReading is required/);
});
