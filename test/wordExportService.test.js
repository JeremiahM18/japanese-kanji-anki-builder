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

test("buildBreakdownInference can use breakdown-only overrides for compound contexts", () => {
    const result = buildBreakdownInference({
        kanji: "行",
        contextWord: "銀行",
        inference: {
            candidates: [{ written: "行", pron: "いく", gloss: "go", score: 100 }],
            primaryReading: "いく",
            englishMeaning: "go",
            meaningJP: "行く （いく） ／ go",
            onReading: "オン:アン、 ギョウ、 コウ",
            kunReading: "くん:い.く、 ゆ.く",
        },
        curatedEntry: {
            englishMeaning: "go",
            displayWord: { written: "行く", pron: "いく" },
            breakdownEnglishMeaning: "go / line",
            breakdownDisplayWord: { written: "行", pron: "こう" },
        },
    });

    assert.equal(result.primaryReading, "こう");
    assert.equal(result.meaningJP, "行 （こう） ／ go / line");
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
    assert.deepEqual(curatedStudyData["子"].displayWord, { written: "子", pron: "こ" });
    assert.deepEqual(curatedStudyData["猫"].displayWord, { written: "猫", pron: "ねこ" });
    assert.deepEqual(curatedStudyData["郵"].displayWord, { written: "郵", pron: "ゆう" });
    assert.deepEqual(curatedStudyData["便"].displayWord, { written: "便", pron: "びん" });
    assert.deepEqual(curatedStudyData["局"].displayWord, { written: "局", pron: "きょく" });
    assert.deepEqual(curatedStudyData["山"].displayWord, { written: "山", pron: "やま" });
    assert.deepEqual(curatedStudyData["切"].displayWord, { written: "切る", pron: "きる" });
    assert.deepEqual(curatedStudyData["物"].displayWord, { written: "物", pron: "もの" });
    assert.deepEqual(curatedStudyData["本"].displayWord, { written: "本", pron: "ほん" });
    assert.deepEqual(curatedStudyData["屋"].displayWord, { written: "屋", pron: "や" });
    assert.deepEqual(curatedStudyData["映"].displayWord, { written: "映", pron: "えい" });
    assert.deepEqual(curatedStudyData["画"].displayWord, { written: "画", pron: "が" });
    assert.deepEqual(curatedStudyData["安"].displayWord, { written: "安い", pron: "やすい" });
    assert.deepEqual(curatedStudyData["新"].displayWord, { written: "新しい", pron: "あたらしい" });
    assert.deepEqual(curatedStudyData["古"].displayWord, { written: "古い", pron: "ふるい" });
    assert.deepEqual(curatedStudyData["楽"].displayWord, { written: "楽しい", pron: "たのしい" });
    assert.deepEqual(curatedStudyData["近"].displayWord, { written: "近い", pron: "ちかい" });
    assert.deepEqual(curatedStudyData["社"].displayWord, { written: "社", pron: "しゃ" });
    assert.deepEqual(curatedStudyData["銀"].displayWord, { written: "銀", pron: "ぎん" });
    assert.deepEqual(curatedStudyData["強"].displayWord, { written: "強", pron: "きょう" });
    assert.deepEqual(curatedStudyData["題"].displayWord, { written: "題", pron: "だい" });
    assert.deepEqual(curatedStudyData["忙"].displayWord, { written: "忙しい", pron: "いそがしい" });
    assert.deepEqual(curatedStudyData["行"].breakdownDisplayWord, { written: "行", pron: "こう" });
    assert.equal(curatedStudyData["行"].breakdownEnglishMeaning, "go / line");
    assert.deepEqual(curatedStudyData["会"].breakdownDisplayWord, { written: "会", pron: "かい" });
    assert.deepEqual(curatedStudyData["昼"].breakdownDisplayWord, { written: "昼", pron: "ひる" });
    assert.deepEqual(curatedStudyData["飯"].breakdownDisplayWord, { written: "飯", pron: "はん" });
    assert.deepEqual(curatedStudyData["晩"].breakdownDisplayWord, { written: "晩", pron: "ばん" });
    assert.deepEqual(curatedStudyData["曜"].breakdownDisplayWord, { written: "曜", pron: "よう" });
    assert.equal(curatedStudyData["曜"].breakdownEnglishMeaning, "weekday marker");
    assert.deepEqual(curatedStudyData["午"].breakdownDisplayWord, { written: "午", pron: "ご" });
    assert.deepEqual(curatedStudyData["後"].breakdownDisplayWord, { written: "後", pron: "ご" });
    assert.deepEqual(curatedStudyData["間"].breakdownDisplayWord, { written: "間", pron: "かん" });
    assert.deepEqual(curatedStudyData["電"].breakdownDisplayWord, { written: "電", pron: "でん" });
    assert.deepEqual(curatedStudyData["校"].breakdownDisplayWord, { written: "校", pron: "こう" });
    assert.equal(curatedStudyData["校"].breakdownEnglishMeaning, "school campus");
    assert.deepEqual(curatedStudyData["病"].breakdownDisplayWord, { written: "病", pron: "びょう" });
    assert.deepEqual(curatedStudyData["院"].breakdownDisplayWord, { written: "院", pron: "いん" });
    assert.deepEqual(curatedStudyData["図"].breakdownDisplayWord, { written: "図", pron: "と" });
    assert.deepEqual(curatedStudyData["館"].breakdownDisplayWord, { written: "館", pron: "かん" });
    assert.deepEqual(curatedStudyData["朝"].breakdownDisplayWord, { written: "朝", pron: "あさ" });
    assert.deepEqual(curatedStudyData["夕"].breakdownDisplayWord, { written: "夕", pron: "ゆう" });
    assert.deepEqual(curatedStudyData["夜"].breakdownDisplayWord, { written: "夜", pron: "よる" });
    assert.deepEqual(curatedStudyData["週"].breakdownDisplayWord, { written: "週", pron: "しゅう" });
    assert.deepEqual(curatedStudyData["生"].breakdownDisplayWord, { written: "生", pron: "せい" });
    assert.deepEqual(curatedStudyData["仕"].breakdownDisplayWord, { written: "仕", pron: "し" });
    assert.deepEqual(curatedStudyData["事"].breakdownDisplayWord, { written: "事", pron: "ごと" });
    assert.deepEqual(curatedStudyData["働"].breakdownDisplayWord, { written: "働く", pron: "はたらく" });
    assert.deepEqual(curatedStudyData["誕"].breakdownDisplayWord, { written: "誕", pron: "たん" });
    assert.deepEqual(curatedStudyData["去"].breakdownDisplayWord, { written: "去", pron: "きょ" });
    assert.deepEqual(curatedStudyData["来"].breakdownDisplayWord, { written: "来", pron: "らい" });
    assert.deepEqual(curatedStudyData["方"].breakdownDisplayWord, { written: "方", pron: "がた" });
    assert.deepEqual(curatedStudyData["元"].breakdownDisplayWord, { written: "元", pron: "げん" });
    assert.deepEqual(curatedStudyData["気"].breakdownDisplayWord, { written: "気", pron: "き" });
    assert.equal(curatedStudyData["仕"].breakdownEnglishMeaning, "service / work");
    assert.equal(curatedStudyData["事"].breakdownEnglishMeaning, "matter / task");
    assert.equal(curatedStudyData["会"].breakdownEnglishMeaning, "meeting / gathering");
    assert.deepEqual(curatedStudyData["社"].breakdownDisplayWord, { written: "社", pron: "しゃ" });
    assert.equal(curatedStudyData["院"].breakdownEnglishMeaning, "institution / facility");
    assert.deepEqual(curatedStudyData["本"].breakdownDisplayWord, { written: "本", pron: "ほん" });
    assert.equal(curatedStudyData["本"].breakdownEnglishMeaning, "book / base");
    assert.deepEqual(curatedStudyData["屋"].breakdownDisplayWord, { written: "屋", pron: "や" });
    assert.equal(curatedStudyData["屋"].breakdownEnglishMeaning, "shop / place");
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
