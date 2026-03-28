const test = require("node:test");
const assert = require("node:assert/strict");

const { loadAnkiNoteSchema } = require("../src/config/ankiNoteSchema");
const { createWordExportService, inferWordLevel } = require("../src/services/wordExportService");

test("loadAnkiNoteSchema can load the shared word note contract", () => {
    const schema = loadAnkiNoteSchema("word");

    assert.equal(schema.noteTypeName, "Japanese Kanji Builder Word Note");
    assert.equal(schema.cardTemplateName, "Word Card");
    assert.deepEqual(schema.fieldNames, [
        "Word",
        "Reading",
        "Meaning",
        "JLPTLevel",
        "KanjiBreakdown",
        "ExampleSentence",
        "Notes",
    ]);
    assert.match(schema.qfmt, /{{Word}}/);
    assert.match(schema.afmt, /Kanji Breakdown/);
});

test("inferWordLevel uses the hardest constituent JLPT kanji", () => {
    assert.equal(inferWordLevel({
        written: "今年",
        jlptOnlyJson: {
            今: { jlpt: 5 },
            年: { jlpt: 4 },
        },
    }), 4);
});

test("buildWordTsvForJlptLevel creates deduplicated word notes with kanji breakdowns", async () => {
    const wordExportService = createWordExportService({
        sentenceCorpus: [
            {
                kanji: "今",
                written: "今日",
                japanese: "今日は忙しいです。",
                reading: "きょうはいそがしいです。",
                english: "Today is busy.",
                source: "manual-curated",
                tags: ["core", "common", "beginner"],
                jlpt: 5,
            },
            {
                kanji: "今",
                written: "今年",
                japanese: "今年は日本へ行きます。",
                reading: "ことしはにほんへいきます。",
                english: "This year I will go to Japan.",
                source: "manual-curated",
                tags: ["core", "common", "beginner"],
                jlpt: 5,
            },
        ],
    });

    const kanjiApiClient = {
        async getKanji(kanji) {
            const entries = {
                今: { meanings: ["now"], on_readings: ["コン", "キン"], kun_readings: ["いま"] },
                日: { meanings: ["day"], on_readings: ["ニチ"], kun_readings: ["ひ"] },
                年: { meanings: ["year"], on_readings: ["ネン"], kun_readings: ["とし"] },
            };
            return entries[kanji];
        },
        async getWords(kanji) {
            const entries = {
                今: [
                    {
                        variants: [{ written: "今", pronounced: "いま", priorities: ["ichi1"] }],
                        meanings: [{ glosses: ["now"] }],
                    },
                    {
                        variants: [{ written: "今日", pronounced: "きょう", priorities: ["ichi1"] }],
                        meanings: [{ glosses: ["today"] }],
                    },
                    {
                        variants: [{ written: "今年", pronounced: "ことし", priorities: ["ichi1"] }],
                        meanings: [{ glosses: ["this year"] }],
                    },
                ],
                日: [
                    {
                        variants: [{ written: "今日", pronounced: "きょう", priorities: ["ichi1"] }],
                        meanings: [{ glosses: ["today"] }],
                    },
                ],
                年: [
                    {
                        variants: [{ written: "今年", pronounced: "ことし", priorities: ["ichi1"] }],
                        meanings: [{ glosses: ["this year"] }],
                    },
                ],
            };
            return entries[kanji] || [];
        },
    };

    const strokeOrderService = {
        async getBestStrokeOrderPath(kanji) {
            return `animations/${kanji}.gif`;
        },
        async getStrokeOrderImagePath(kanji) {
            return `images/${kanji}.svg`;
        },
        async getStrokeOrderAnimationPath(kanji) {
            return `animations/${kanji}.gif`;
        },
    };

    const result = await wordExportService.buildWordTsvForJlptLevel({
        levelNumber: 5,
        jlptOnlyJson: {
            今: { jlpt: 5 },
            日: { jlpt: 5 },
            年: { jlpt: 5 },
        },
        kanjiApiClient,
        strokeOrderService,
        audioService: null,
        concurrency: 2,
        minimumCandidateScore: 1,
    });

    const lines = result.tsv.trim().split("\n");
    assert.equal(lines[0], loadAnkiNoteSchema("word").fieldNames.join("\t"));
    assert.equal(lines.length, 6);
    assert.equal(result.mediaKanji.join(","), "今,年,日");
    assert.match(result.tsv, /^今日\tきょう\ttoday\tJLPT N5\t/m);
    assert.match(result.tsv, /^今年\tことし\tthis year\tJLPT N5\t/m);
    assert.match(result.tsv, /^今\tいま\tnow\tJLPT N5\t/m);
    assert.match(result.tsv, /kanji-breakdown-item/);
    assert.match(result.tsv, /今 （いま） ／ now/);
    assert.match(result.tsv, /今日は忙しいです/);
    assert.match(result.tsv, /今年は日本へ行きます/);
});


