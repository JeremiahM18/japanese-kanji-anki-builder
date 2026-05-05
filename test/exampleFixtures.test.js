const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const kanjiSchema = require("../src/config/ankiNoteSchema.json");
const wordSchema = require("../src/config/ankiWordNoteSchema.json");

function readTsvFixture(relativePath) {
    const filePath = path.join(__dirname, "..", relativePath);
    const text = fs.readFileSync(filePath, "utf8").replace(/\r?\n$/u, "");
    const lines = text.split(/\r?\n/u);
    const header = lines[0].split("\t");
    const rows = lines.slice(1).map((line) => {
        const cells = line.split("\t");
        assert.equal(cells.length, header.length, `${relativePath} row must match TSV header length`);
        return Object.fromEntries(header.map((field, index) => [field, cells[index]]));
    });
    return { header, rows };
}

test("tracked N5 mini fixture stays aligned with current note schemas", () => {
    const kanjiFixture = readTsvFixture("examples/n5-mini/sample-kanji-output.tsv");
    const wordFixture = readTsvFixture("examples/n5-mini/sample-word-output.tsv");

    assert.deepEqual(kanjiFixture.header, kanjiSchema.fieldNames);
    assert.deepEqual(wordFixture.header, wordSchema.fieldNames);

    assert.equal(kanjiFixture.rows.length, 1);
    assert.equal(kanjiFixture.rows[0].Kanji, "日");
    assert.equal(kanjiFixture.rows[0].DisplayWord, "日");
    assert.equal(kanjiFixture.rows[0].PrimaryReading, "ひ");
    assert.match(kanjiFixture.rows[0].Audio, /kanji-reading-日-ひ/u);
    assert.equal(kanjiFixture.rows[0].StudyWordKanji, "");

    assert.equal(wordFixture.rows.length, 1);
    assert.equal(wordFixture.rows[0].Word, "春雨");
    assert.equal(wordFixture.rows[0].Reading, "はるさめ");
    assert.match(wordFixture.rows[0].ReadingBreakdown, /<ruby>春<rt>はる<\/rt><\/ruby><ruby>雨<rt>さめ<\/rt><\/ruby>/u);
    assert.match(wordFixture.rows[0].Audio, /word-reading-春雨-はるさめ/u);
    assert.equal(wordFixture.rows[0].JLPTLevel, "JLPT N5");
    assert.equal(wordFixture.rows[0].CoversReading, "雨: さめ");
    assert.match(wordFixture.rows[0].Notes, /not just coverage padding/u);
});
