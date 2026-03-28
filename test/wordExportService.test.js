const test = require("node:test");
const assert = require("node:assert/strict");

const { loadAnkiNoteSchema } = require("../src/config/ankiNoteSchema");
const { loadCuratedStudyData } = require("../src/datasets/curatedStudyData");
const { buildBreakdownInference, createWordExportService, inferWordLevel } = require("../src/services/wordExportService");

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

test("buildBreakdownInference prefers curated display words for learner-facing kanji panels", () => {
    const result = buildBreakdownInference({
        kanji: "大",
        inference: {
            candidates: [{ written: "大", pron: "おおい", gloss: "big / large", score: 100 }],
            primaryReading: "おおい",
            englishMeaning: "big / large",
            meaningJP: "大 （おおい） ／ big / large",
            onReading: "オン:タイ、 ダイ",
            kunReading: "くん:-おお.いに、 おお-、 おお.きい",
        },
        curatedEntry: {
            englishMeaning: "big / large",
            displayWord: { written: "大きい", pron: "おおきい" },
        },
    });

    assert.equal(result.primaryReading, "おおきい");
    assert.equal(result.meaningJP, "大きい （おおきい） ／ big / large");
});

test("buildBreakdownInference suppresses katakana-only exact-match primaries", () => {
    const result = buildBreakdownInference({
        kanji: "二",
        inference: {
            candidates: [{ written: "二", pron: "アル", gloss: "two", score: 100 }],
            primaryReading: "アル",
            englishMeaning: "two",
            meaningJP: "二 ／ two",
            onReading: "オン:ジ、 ニ",
            kunReading: "くん:ふた、 ふた.つ",
        },
        curatedEntry: {
            englishMeaning: "two",
        },
    });

    assert.equal(result.primaryReading, "");
    assert.equal(result.meaningJP, "二 ／ two");
});

test("starter curated data provides learner-friendly N5 breakdown fallbacks", () => {
    const curatedStudyData = loadCuratedStudyData();

    assert.deepEqual(curatedStudyData["中"].displayWord, { written: "中", pron: "なか" });
    assert.deepEqual(curatedStudyData["分"].displayWord, { written: "分", pron: "ぶん" });
    assert.equal(curatedStudyData["分"].englishMeaning, "part / minute");
    assert.deepEqual(curatedStudyData["部"].displayWord, { written: "部", pron: "ぶ" });
    assert.deepEqual(curatedStudyData["所"].displayWord, { written: "所", pron: "ところ" });
    assert.deepEqual(curatedStudyData["座"].displayWord, { written: "座る", pron: "すわる" });
    assert.deepEqual(curatedStudyData["閉"].displayWord, { written: "閉める", pron: "しめる" });
});

test("buildWordTsvForJlptLevel prefers curated N5 word entries and suppresses uncurated alternate readings", async () => {
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
            {
                kanji: "先",
                written: "先生",
                japanese: "先生に質問します。",
                reading: "せんせいにしつもんします。",
                english: "I ask the teacher a question.",
                source: "manual-curated",
                tags: ["core", "common", "beginner"],
                jlpt: 5,
            },
        ],
        wordStudyData: {
            "今日|きょう": {
                written: "今日",
                reading: "きょう",
                meaning: "today",
                jlpt: 5,
                notes: "Irregular reading.",
                exampleSentence: {
                    japanese: "今日は図書館へ行きます。",
                    reading: "きょうはとしょかんへいきます。",
                    english: "Today I am going to the library.",
                },
            },
            "今年|ことし": {
                written: "今年",
                reading: "ことし",
                meaning: "this year",
                jlpt: 5,
            },
            "先生|せんせい": {
                written: "先生",
                reading: "せんせい",
                meaning: "teacher",
                jlpt: 5,
            },
            "店|みせ": {
                written: "店",
                reading: "みせ",
                meaning: "shop / store",
                jlpt: 5,
            },
        },
    });

    const kanjiApiClient = {
        async getKanji(kanji) {
            const entries = {
                今: { meanings: ["now"], on_readings: ["コン", "キン"], kun_readings: ["いま"] },
                日: { meanings: ["day"], on_readings: ["ニチ"], kun_readings: ["ひ"] },
                年: { meanings: ["year"], on_readings: ["ネン"], kun_readings: ["とし"] },
                先: { meanings: ["ahead"], on_readings: ["セン"], kun_readings: ["さき"] },
                生: { meanings: ["life"], on_readings: ["セイ"], kun_readings: ["い.きる"] },
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
                        variants: [{ written: "今日", pronounced: "こんにち", priorities: ["news1"] }],
                        meanings: [{ glosses: ["nowadays", "these days"] }],
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
                        variants: [{ written: "今日", pronounced: "こんにち", priorities: ["news1"] }],
                        meanings: [{ glosses: ["nowadays", "these days"] }],
                    },
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
                先: [
                    {
                        variants: [{ written: "先生", pronounced: "せんしょう", priorities: ["spec1"] }],
                        meanings: [{ glosses: ["previous existence"] }],
                    },
                    {
                        variants: [{ written: "先生", pronounced: "せんせい", priorities: ["ichi1"] }],
                        meanings: [{ glosses: ["teacher"] }],
                    },
                ],
                生: [
                    {
                        variants: [{ written: "先生", pronounced: "せんしょう", priorities: ["spec1"] }],
                        meanings: [{ glosses: ["previous existence"] }],
                    },
                    {
                        variants: [{ written: "先生", pronounced: "せんせい", priorities: ["ichi1"] }],
                        meanings: [{ glosses: ["teacher"] }],
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
            先: { jlpt: 5 },
            生: { jlpt: 5 },
        },
        kanjiApiClient,
        strokeOrderService,
        audioService: null,
        concurrency: 2,
        minimumCandidateScore: 1,
    });

    const lines = result.tsv.trim().split("\n");
    assert.equal(lines[0], loadAnkiNoteSchema("word").fieldNames.join("\t"));
    assert.match(result.tsv, /^今日\tきょう\ttoday\tJLPT N5\t/m);
    assert.match(result.tsv, /^今年\tことし\tthis year\tJLPT N5\t/m);
    assert.match(result.tsv, /^先生\tせんせい\tteacher\tJLPT N5\t/m);
    assert.doesNotMatch(result.tsv, /^今日\tこんにち\t/m);
    assert.doesNotMatch(result.tsv, /^先生\tせんしょう\t/m);
    assert.match(result.tsv, /Irregular reading\./);
    assert.match(result.tsv, /今日は図書館へ行きます/);
    assert.match(result.tsv, /kanji-breakdown-item/);
});
