const test = require("node:test");
const assert = require("node:assert/strict");

const { loadAnkiNoteSchema } = require("../src/config/ankiNoteSchema");
const { buildTsvForJlptLevel } = require("../src/services/exportService");

test("loadAnkiNoteSchema returns a stable shared note contract", () => {
    const schema = loadAnkiNoteSchema();

    assert.equal(schema.noteTypeName, "Japanese Kanji Builder");
    assert.equal(schema.cardTemplateName, "Recognition");
    assert.deepEqual(schema.fieldNames, [
        "Kanji",
        "DisplayWord",
        "MeaningJP",
        "PrimaryReading",
        "OnReading",
        "KunReading",
        "StrokeOrder",
        "StrokeOrderImage",
        "StrokeOrderAnimation",
        "Audio",
        "Radical",
        "Notes",
        "ExampleSentence",
    ]);
    assert.match(schema.css, /study-word/);
    assert.match(schema.qfmt, /DisplayWord/);
    assert.match(schema.afmt, /On-yomi:/);
    assert.match(schema.afmt, /Kun-yomi:/);
});

test("export TSV header stays aligned with the shared note schema", async () => {
    const schema = loadAnkiNoteSchema();
    const tsv = await buildTsvForJlptLevel({
        levelNumber: 5,
        jlptOnlyJson: { 日: { jlpt: 5 } },
        kradMap: new Map([["日", ["日"]]]),
        pickMainComponent: (components) => components[0] || "",
        kanjiApiClient: {
            async getKanji() {
                return { meanings: ["day"], on_readings: ["ニチ"], kun_readings: ["ひ"] };
            },
            async getWords() {
                return [];
            },
        },
        strokeOrderService: null,
        audioService: null,
        limit: 1,
        concurrency: 1,
    });

    const [header] = tsv.trim().split("\n");
    assert.equal(header, schema.fieldNames.join("\t"));
});
