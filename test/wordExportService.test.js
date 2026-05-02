const test = require("node:test");
const assert = require("node:assert/strict");

const { loadAnkiNoteSchema } = require("../src/config/ankiNoteSchema");
const { loadCuratedStudyData } = require("../src/datasets/curatedStudyData");
const {
    buildCandidatePool,
    buildBreakdownInference,
    buildWordReadingBreakdown,
    buildWordStudyIndexes,
    classifyWordDeckEntry,
    createWordExportService,
    getCanonicalWordLevel,
    getTrustedCandidateLevel,
    getWordDeckStudyGroupKey,
    hasExcludedWordCardTag,
    inferWordLevel,
    isLikelyPhraseCard,
    normalizeBreakdownReadingField,
    resolveCoverageMetadata,
    sortWordDeckEntriesForStudy,
} = require("../src/services/wordExportService");

test("buildWordTsvForJlptLevel ignores repetition marks in kanji breakdowns", async () => {
    const wordExportService = createWordExportService({
        sentenceCorpus: [],
        curatedStudyData: {
            時: {
                englishMeaning: "time / o'clock",
                preferredWords: ["時間", "三時", "時々"],
                notes: "時間 （じかん） - time ／ 三時 （さんじ） - three o'clock ／ 時々 （ときどき） - sometimes",
            },
        },
        wordStudyData: {
            "時々|ときどき": {
                written: "時々",
                reading: "ときどき",
                meaning: "sometimes",
                jlpt: 5,
                exampleSentence: {
                    japanese: "時々公園で友だちに会います。",
                    reading: "ときどきこうえんでともだちにあいます。",
                    english: "I sometimes meet my friend at the park.",
                },
            },
        },
    });

    const kanjiApiClient = {
        async getKanji(kanji) {
            return kanji === "時"
                ? { meanings: ["time", "hour"], on_readings: ["ジ"], kun_readings: ["とき"] }
                : { meanings: [kanji], on_readings: [], kun_readings: [] };
        },
        async getWords(kanji) {
            return kanji === "時"
                ? [{ variants: [{ written: "時", pronounced: "じ", priorities: ["ichi1"] }], meanings: [{ glosses: ["time"] }] }]
                : [];
        },
    };

    const jlptOnlyJson = { 時: { jlpt: 5 } };
    const { tsv } = await wordExportService.buildWordTsvForJlptLevel({
        levelNumber: 5,
        jlptOnlyJson,
        kanjiApiClient,
        concurrency: 1,
    });

    assert.match(tsv, /時々 （ときどき）/u);
    assert.doesNotMatch(tsv, /class="kanji-char">々</u);
});

test("loadAnkiNoteSchema can load the shared word note contract", () => {
    const schema = loadAnkiNoteSchema("word");

    assert.equal(schema.noteTypeName, "Japanese Kanji Builder Word Note");
    assert.equal(schema.cardTemplateName, "Word Card");
    assert.deepEqual(schema.fieldNames, [
        "Word",
        "Reading",
        "ReadingBreakdown",
        "Audio",
        "PitchAccent",
        "Meaning",
        "JLPTLevel",
        "CoverageRole",
        "FocusKanji",
        "CoversReading",
        "KanjiBreakdown",
        "ExampleSentence",
        "Notes",
    ]);
    assert.match(schema.qfmt, /{{Word}}/);
    assert.match(schema.afmt, /ReadingBreakdown/);
    assert.match(schema.afmt, /PitchAccent/);
    assert.match(schema.afmt, /Kanji Breakdown/);
    assert.match(schema.css, /kanji-level-badge/);
    assert.match(schema.css, /kanji-stroke-order/);
});

test("buildWordReadingBreakdown renders learner-facing furigana breakdowns", () => {
    const kanjiInferenceCache = new Map([
        ["学", { onReading: "オン: ガク", kunReading: "くん: まな.ぶ" }],
        ["校", { onReading: "オン: コウ" }],
        ["食", { kunReading: "くん: た.べる、 く.う" }],
        ["物", { onReading: "オン: ブツ、 モツ", kunReading: "くん: もの" }],
        ["今", { onReading: "オン: コン", kunReading: "くん: いま" }],
        ["日", { onReading: "オン: ニチ、 ジツ", kunReading: "くん: ひ、 -び、 -か" }],
        ["友", { kunReading: "くん: とも" }],
        ["生", { onReading: "オン: セイ、 ショウ", kunReading: "くん: い.きる、 う.まれる、 なま" }],
        ["山", { kunReading: "くん: やま" }],
        ["上", { kunReading: "くん: うえ" }],
    ]);

    assert.equal(buildWordReadingBreakdown({
        candidate: { written: "学校", pron: "がっこう" },
        kanjiInferenceCache,
    }), "<ruby>学<rt>がっ</rt></ruby><ruby>校<rt>こう</rt></ruby>");

    assert.equal(buildWordReadingBreakdown({
        candidate: { written: "食べ物", pron: "たべもの" },
        kanjiInferenceCache,
    }), "<ruby>食<rt>た</rt></ruby>べ<ruby>物<rt>もの</rt></ruby>");

    assert.equal(buildWordReadingBreakdown({
        candidate: { written: "友だち", pron: "ともだち" },
        kanjiInferenceCache,
    }), "<ruby>友<rt>とも</rt></ruby>だち");

    assert.equal(buildWordReadingBreakdown({
        candidate: { written: "生まれる", pron: "うまれる" },
        kanjiInferenceCache,
    }), "<ruby>生<rt>う</rt></ruby>まれる");

    assert.equal(buildWordReadingBreakdown({
        candidate: { written: "山の上", pron: "やまのうえ" },
        kanjiInferenceCache,
    }), "<ruby>山<rt>やま</rt></ruby>の<ruby>上<rt>うえ</rt></ruby>");

    assert.equal(buildWordReadingBreakdown({
        candidate: { written: "今日", pron: "きょう" },
        kanjiInferenceCache,
    }), "<ruby>今日<rt>きょう</rt></ruby>");

    assert.equal(buildWordReadingBreakdown({
        candidate: { written: "ここ", pron: "ここ" },
        kanjiInferenceCache,
    }), "ここ");

    assert.equal(buildWordReadingBreakdown({
        candidate: { written: "今日", pron: "きょう" },
        curatedEntry: { readingBreakdown: "<ruby>今日<rt>きょう</rt></ruby>" },
        kanjiInferenceCache,
    }), "<ruby>今日<rt>きょう</rt></ruby>");

    assert.throws(() => buildWordReadingBreakdown({
        candidate: { written: "今日", pron: "きょう" },
        curatedEntry: { readingBreakdown: "今+日=きょう" },
        kanjiInferenceCache,
    }), /must use ruby furigana markup/);
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

test("getCanonicalWordLevel prefers the tracked word-level contract over kanji heuristics", () => {
    assert.equal(getCanonicalWordLevel({
        candidate: { written: "今年", pron: "ことし" },
        jlptWordLevelContract: {
            wordLevels: {
                "今年|ことし": {
                    written: "今年",
                    reading: "ことし",
                    jlpt: 5,
                },
            },
        },
    }), 5);
});

test("getTrustedCandidateLevel refuses kanji-only heuristic JLPT labels for exported word cards", () => {
    assert.equal(getTrustedCandidateLevel({
        candidate: { written: "今年", pron: "ことし" },
        curatedEntry: null,
        jlptWordLevelContract: { wordLevels: {} },
    }), null);

    assert.equal(getTrustedCandidateLevel({
        candidate: { written: "今日", pron: "きょう" },
        curatedEntry: null,
        jlptWordLevelContract: {
            wordLevels: {
                "今日|きょう": { written: "今日", reading: "きょう", jlpt: 5 },
            },
        },
    }), 5);
});

test("hasExcludedWordCardTag detects curated phrase exclusions", () => {
    assert.equal(hasExcludedWordCardTag({ tags: ["starter", "phrase", "n5"] }), true);
    assert.equal(hasExcludedWordCardTag({ tags: ["starter", "common", "n5"] }), false);
});

test("isLikelyPhraseCard detects compositional phrase shapes that should stay out of the default word deck", () => {
    assert.equal(isLikelyPhraseCard({ written: "高い山" }), true);
    assert.equal(isLikelyPhraseCard({ written: "川の近く" }), true);
    assert.equal(isLikelyPhraseCard({ written: "兄の部屋" }), true);
    assert.equal(isLikelyPhraseCard({ written: "使い方" }), false);
    assert.equal(isLikelyPhraseCard({ written: "学校" }), false);
    assert.equal(isLikelyPhraseCard({ written: "病院" }), false);
});

test("buildCandidatePool stays curated-only unless inferred words are explicitly enabled", () => {
    const pool = buildCandidatePool({
        inference: {
            displayWord: { written: "今", pron: "いま" },
            primaryReading: "いま",
            englishMeaning: "now",
            meaningJP: "今 （いま） ／ now",
            candidates: [
                {
                    written: "今日",
                    pron: "きょう",
                    gloss: "today",
                    score: 120,
                    corpusSupportScore: 40,
                    variant: { priorities: ["ichi1"] },
                },
                {
                    written: "今月",
                    pron: "こんげつ",
                    gloss: "this month",
                    score: 110,
                    corpusSupportScore: 30,
                    variant: { priorities: ["ichi1"] },
                },
            ],
        },
        sourceKanji: "今",
        maxWordsPerKanji: 5,
        minimumCandidateScore: 1,
        wordStudyIndexes: buildWordStudyIndexes({
            "今年|ことし": {
                written: "今年",
                reading: "ことし",
                meaning: "this year",
                jlpt: 5,
            },
        }),
        jlptWordLevelContract: null,
        levelNumber: 5,
        jlptOnlyJson: {
            今: { jlpt: 5 },
            日: { jlpt: 5 },
            月: { jlpt: 5 },
            年: { jlpt: 4 },
        },
        includeInferred: false,
    });

    assert.deepEqual(
        pool.map((candidate) => `${candidate.written}|${candidate.pron}`),
        ["今年|ことし"]
    );
});

test("buildCandidatePool rejects phrase-like inferred candidates even when inference is enabled", () => {
    const pool = buildCandidatePool({
        inference: {
            displayWord: { written: "高", pron: "たか" },
            primaryReading: "たか",
            englishMeaning: "high",
            meaningJP: "高 （たか） ／ high",
            candidates: [
                {
                    written: "高い山",
                    pron: "たかいやま",
                    gloss: "high mountain",
                    score: 140,
                    corpusSupportScore: 50,
                    variant: { priorities: ["ichi1"] },
                },
                {
                    written: "高校",
                    pron: "こうこう",
                    gloss: "high school",
                    score: 130,
                    corpusSupportScore: 45,
                    variant: { priorities: ["ichi1"] },
                },
            ],
        },
        sourceKanji: "高",
        maxWordsPerKanji: 5,
        minimumCandidateScore: 1,
        wordStudyIndexes: buildWordStudyIndexes({}),
        jlptWordLevelContract: null,
        levelNumber: 5,
        jlptOnlyJson: {
            高: { jlpt: 5 },
            山: { jlpt: 5 },
            校: { jlpt: 5 },
        },
        includeInferred: true,
    });

    assert.equal(pool.some((candidate) => candidate.written === "高い山"), false);
    assert.equal(pool.some((candidate) => candidate.written === "高校"), true);
});

test("buildCandidatePool keeps governed canonical rows even when a stale phrase heuristic would flag them", () => {
    const pool = buildCandidatePool({
        inference: null,
        sourceKanji: "買",
        maxWordsPerKanji: 5,
        minimumCandidateScore: 1,
        wordStudyIndexes: buildWordStudyIndexes({
            "買い物|かいもの": {
                written: "買い物",
                reading: "かいもの",
                meaning: "shopping",
                jlpt: 4,
                tags: ["starter", "common", "n4"],
            },
        }),
        jlptWordLevelContract: {
            wordLevels: {
                "買い物|かいもの": { written: "買い物", reading: "かいもの", jlpt: 4 },
            },
        },
        levelNumber: 4,
        jlptOnlyJson: {
            買: { jlpt: 4 },
            物: { jlpt: 4 },
        },
        includeInferred: false,
    });

    assert.equal(pool.some((candidate) => candidate.written === "買い物"), true);
});

test("classifyWordDeckEntry distinguishes canonical curated-only and inferred rows", () => {
    assert.equal(classifyWordDeckEntry({
        candidate: { written: "今年", pron: "ことし" },
        curatedEntry: { written: "今年", reading: "ことし", jlpt: 5 },
        jlptWordLevelContract: {
            wordLevels: {
                "今年|ことし": { written: "今年", reading: "ことし", jlpt: 5 },
            },
        },
    }), "canonical");

    assert.equal(classifyWordDeckEntry({
        candidate: { written: "今年", pron: "ことし" },
        curatedEntry: { written: "今年", reading: "ことし", jlpt: 5 },
        jlptWordLevelContract: { wordLevels: {} },
    }), "curatedOnly");

    assert.equal(classifyWordDeckEntry({
        candidate: { written: "高校", pron: "こうこう" },
        curatedEntry: null,
        jlptWordLevelContract: { wordLevels: {} },
    }), "inferredOnly");
});

test("sortWordDeckEntriesForStudy interleaves focus kanji with a stable seeded order", () => {
    const entries = [
        { candidate: { written: "一日", pron: "ついたち", score: 100 }, sourceKanji: new Set(["日"]) },
        { candidate: { written: "二日", pron: "ふつか", score: 100 }, sourceKanji: new Set(["日"]) },
        { candidate: { written: "一月", pron: "いちがつ", score: 100 }, sourceKanji: new Set(["月"]) },
        { candidate: { written: "今月", pron: "こんげつ", score: 100 }, sourceKanji: new Set(["月"]) },
        { candidate: { written: "火曜日", pron: "かようび", score: 100 }, sourceKanji: new Set(["火"]) },
        { candidate: { written: "火山", pron: "かざん", score: 100 }, sourceKanji: new Set(["火"]) },
    ];

    const firstPass = sortWordDeckEntriesForStudy(entries, { levelNumber: 5, seed: "test-seed" });
    const secondPass = sortWordDeckEntriesForStudy(entries, { levelNumber: 5, seed: "test-seed" });
    const groupedOrder = entries.map((entry) => entry.candidate.written);
    const studyOrder = firstPass.map((entry) => entry.candidate.written);

    assert.deepEqual(studyOrder, secondPass.map((entry) => entry.candidate.written));
    assert.notDeepEqual(studyOrder, groupedOrder);
    const adjacentRepeats = firstPass
        .slice(1)
        .filter((entry, index) => getWordDeckStudyGroupKey(entry) === getWordDeckStudyGroupKey(firstPass[index]))
        .length;
    assert.ok(adjacentRepeats < firstPass.length / 2);
});

test("sortWordDeckEntriesForStudy keeps simple common words before complex support words", () => {
    const entries = [
        {
            candidate: { written: "魚料理", pron: "さかなりょうり", score: 100 },
            curatedEntry: { tags: ["starter"], coverage: { role: "support" } },
            sourceKanji: new Set(["魚"]),
        },
        {
            candidate: { written: "母", pron: "はは", score: 100 },
            curatedEntry: { tags: ["common", "starter"], coverage: { role: "core" } },
            sourceKanji: new Set(["母"]),
        },
        {
            candidate: { written: "行く", pron: "いく", score: 100 },
            curatedEntry: { tags: ["common", "starter"], coverage: { role: "both" } },
            sourceKanji: new Set(["行"]),
        },
    ];

    const studyOrder = sortWordDeckEntriesForStudy(entries, {
        levelNumber: 5,
        jlptOnlyJson: {
            母: { jlpt: 5 },
            行: { jlpt: 5 },
            魚: { jlpt: 5 },
            料: { jlpt: 4 },
            理: { jlpt: 4 },
        },
        seed: "test-seed",
    }).map((entry) => entry.candidate.written);

    assert.deepEqual(studyOrder.slice(0, 2).sort(), ["母", "行く"].sort());
    assert.equal(studyOrder[2], "魚料理");
});

test("resolveCoverageMetadata prefers explicit reading-coverage contracts from curated word data", () => {
    const metadata = resolveCoverageMetadata({
        entry: {
            candidate: { written: "今日", pron: "きょう" },
            curatedEntry: {
                written: "今日",
                reading: "きょう",
                meaning: "today",
                coverage: {
                    role: "both",
                    focusKanji: ["今", "日"],
                    coversReadings: {
                        今: "いま",
                        日: "ひ",
                    },
                },
            },
            sourceKanji: new Set(["今", "日"]),
        },
        kanjiInferenceCache: new Map(),
        curatedStudyData: {},
    });

    assert.deepEqual(metadata, {
        focusKanji: ["今", "日"],
        coversReading: "今: いま ／ 日: ひ",
    });
});

test("buildWordTsvForJlptLevel leaves JLPTLevel blank for inferred-only exploratory words", async () => {
    const wordExportService = createWordExportService({
        sentenceCorpus: [],
        curatedStudyData: {},
        wordStudyData: {},
    });

    const { tsv } = await wordExportService.buildWordTsvForJlptLevel({
        levelNumber: 5,
        jlptOnlyJson: {
            日: { jlpt: 5 },
        },
        jlptWordLevelContract: { wordLevels: {} },
        includeInferred: true,
        kanjiApiClient: {
            async getKanji() {
                return { meanings: ["day"], on_readings: ["ニチ"], kun_readings: ["ひ"] };
            },
            async getWords() {
                return [{
                    variants: [{ written: "日", pronounced: "ひ", priorities: ["ichi1"] }],
                    meanings: [{ glosses: ["day"] }],
                }];
            },
        },
        concurrency: 1,
    });

    const [, row] = tsv.split(/\r?\n/);
    const columns = row.split("\t");
    assert.equal(columns[6], "");
    assert.equal(columns[7], "Inferred support word");
});

test("normalizeBreakdownReadingField strips internal reading prefixes for learner-facing output", () => {
    assert.equal(normalizeBreakdownReadingField("オン: キュウ", /^(on|オン)\s*:\s*/i), "キュウ");
    assert.equal(normalizeBreakdownReadingField("くん: やす.む", /^(kun|くん)\s*:\s*/i), "やす.む");
});

test("buildBreakdownInference prefers curated display words for learner-facing kanji panels", () => {
    const result = buildBreakdownInference({
        kanji: "大",
        inference: {
            candidates: [{ written: "大", pron: "おおい", gloss: "big / large", score: 100 }],
            primaryReading: "おおい",
            englishMeaning: "big / large",
            meaningJP: "大 （おおい） ／ big / large",
            onReading: "オン: タイ、 ダイ",
            kunReading: "くん: -おお.いに、 おお-、 おお.きい",
        },
        curatedEntry: {
            englishMeaning: "big / large",
            displayWord: { written: "大きい", pron: "おおきい" },
        },
    });

    assert.equal(result.primaryReading, "おおきい");
    assert.equal(result.meaningJP, "大きい （おおきい） ／ big / large");
    assert.equal(result.onReading, "タイ、 ダイ");
    assert.equal(result.kunReading, "-おお.いに、 おお-、 おお.きい");
});

test("buildBreakdownInference prefers breakdown-specific display words inside compound contexts", () => {
    const result = buildBreakdownInference({
        kanji: "時",
        inference: {
            candidates: [{ written: "時", pron: "とき", gloss: "time / hour", score: 100 }],
            primaryReading: "とき",
            englishMeaning: "time / o'clock",
            meaningJP: "時 （とき） ／ time / o'clock",
            onReading: "オン: ジ",
            kunReading: "くん: -どき、 とき",
        },
        curatedEntry: {
            englishMeaning: "time / o'clock",
            breakdownDisplayWord: { written: "時", pron: "じ" },
        },
        contextWord: "時間",
        contextCandidate: {
            written: "時間",
            reading: "じかん",
            meaning: "time / hour",
        },
    });

    assert.equal(result.primaryReading, "じ");
    assert.equal(result.meaningJP, "時 （じ） ／ time / o'clock");
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
            onReading: "オン: アン、 ギョウ、 コウ",
            kunReading: "くん: い.く、 ゆ.く",
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

test("buildBreakdownInference limits multi-character breakdown overrides to matching word contexts", () => {
    const result = buildBreakdownInference({
        kanji: "三",
        contextWord: "三時",
        contextCandidate: {
            written: "三時",
            reading: "さんじ",
            meaning: "three o'clock",
        },
        inference: {
            candidates: [{ written: "三", pron: "さん", gloss: "three", score: 100 }],
            primaryReading: "さん",
            englishMeaning: "three",
            meaningJP: "三 （さん） ／ three",
            onReading: "オン: サン、 ゾウ",
            kunReading: "くん: み、 み.つ、 みっ.つ",
        },
        curatedEntry: {
            englishMeaning: "three",
            displayWord: { written: "三人", pron: "さんにん" },
            breakdownDisplayWord: { written: "三人", pron: "さんにん" },
            breakdownEnglishMeaning: "three people",
        },
    });

    assert.equal(result.primaryReading, "さん");
    assert.equal(result.meaningJP, "三 （さん） ／ three");
});


test("buildBreakdownInference supports context-specific breakdown overrides", () => {
    const result = buildBreakdownInference({
        kanji: "読",
        contextWord: "読書",
        contextCandidate: {
            written: "読書",
            reading: "どくしょ",
            meaning: "reading / reading books",
        },
        inference: {
            candidates: [{ written: "読", pron: "よむ", gloss: "read", score: 100 }],
            primaryReading: "よむ",
            englishMeaning: "read",
            meaningJP: "読む （よむ） ／ read",
            onReading: "オン: トウ、 トク、 ドク",
            kunReading: "くん: -よ.み、 よ.む",
        },
        curatedEntry: {
            englishMeaning: "read",
            displayWord: { written: "読む", pron: "よむ" },
            breakdownOverrides: [
                {
                    matchWord: "読書",
                    displayWord: { written: "読", pron: "どく" },
                    englishMeaning: "read / reading",
                },
            ],
        },
    });

    assert.equal(result.primaryReading, "どく");
    assert.equal(result.meaningJP, "読 （どく） ／ read / reading");
});

test("buildBreakdownInference keeps okurigana display words in compound contexts", () => {
    const result = buildBreakdownInference({
        kanji: "切",
        contextWord: "切手",
        contextCandidate: {
            written: "切手",
            reading: "きって",
            meaning: "stamp",
        },
        inference: {
            candidates: [{ written: "切", pron: "きる", gloss: "cut", score: 100 }],
            primaryReading: "きる",
            englishMeaning: "cut",
            meaningJP: "切る （きる） ／ cut",
            onReading: "オン: サイ、 セツ",
            kunReading: "くん: き.る",
        },
        curatedEntry: {
            englishMeaning: "cut",
            displayWord: { written: "切る", pron: "きる" },
        },
    });

    assert.equal(result.primaryReading, "きる");
    assert.equal(result.meaningJP, "切る （きる） ／ cut");
});

test("buildBreakdownInference accepts context overrides with okurigana for the target kanji", () => {
    const result = buildBreakdownInference({
        kanji: "帰",
        contextWord: "帰り道",
        contextCandidate: {
            written: "帰り道",
            reading: "かえりみち",
            meaning: "way home",
        },
        inference: {
            candidates: [{ written: "帰", pron: "かえる", gloss: "return", score: 100 }],
            primaryReading: "かえる",
            englishMeaning: "return",
            meaningJP: "帰る （かえる） ／ return",
            onReading: "オン: キ",
            kunReading: "くん: かえ.る",
        },
        curatedEntry: {
            englishMeaning: "return / go home",
            displayWord: { written: "帰る", pron: "かえる" },
            breakdownOverrides: [
                {
                    matchWord: "帰り道",
                    displayWord: { written: "帰り", pron: "かえり" },
                    englishMeaning: "return / way home",
                },
            ],
        },
    });

    assert.equal(result.primaryReading, "かえり");
    assert.equal(result.meaningJP, "帰り （かえり） ／ return / way home");
});

test("buildBreakdownInference does not leak multi-kanji display words into single-kanji compound panels", () => {
    const result = buildBreakdownInference({
        kanji: "映",
        contextWord: "映画",
        contextCandidate: {
            written: "映画",
            reading: "えいが",
            meaning: "movie",
        },
        inference: {
            candidates: [{ written: "映", pron: "えい", gloss: "show / project", score: 100 }],
            primaryReading: "えい",
            englishMeaning: "show / project",
            meaningJP: "映 （えい） ／ show / project",
            onReading: "オン: エイ",
            kunReading: "くん: うつ.す、 うつ.る",
        },
        curatedEntry: {
            englishMeaning: "movie / reflect",
            displayWord: { written: "映画", pron: "えいが" },
        },
    });

    assert.equal(result.primaryReading, "えい");
    assert.equal(result.meaningJP, "映 （えい） ／ movie / reflect");
    assert.doesNotMatch(result.meaningJP, /映画/u);
});


test("buildBreakdownInference uses the current single-kanji word on word cards", () => {
    const result = buildBreakdownInference({
        kanji: "出",
        contextWord: "出す",
        contextCandidate: {
            written: "出す",
            reading: "だす",
            meaning: "to take out / put out",
        },
        inference: {
            candidates: [{ written: "出", pron: "でる", gloss: "go out", score: 100 }],
            primaryReading: "でる",
            englishMeaning: "exit / go out",
            meaningJP: "出る （でる） ／ exit / go out",
            onReading: "オン: シュツ、 スイ",
            kunReading: "くん: だ.す、 で.る",
        },
        curatedEntry: {
            englishMeaning: "exit / go out",
        },
    });

    assert.equal(result.primaryReading, "だす");
    assert.equal(result.meaningJP, "出す （だす） ／ to take out / put out");
});

test("buildBreakdownInference lets explicit overrides govern single-kanji word contexts", () => {
    const result = buildBreakdownInference({
        kanji: "赤",
        contextWord: "赤ちゃん",
        contextCandidate: {
            written: "赤ちゃん",
            reading: "あかちゃん",
            meaning: "baby",
        },
        inference: {
            candidates: [{ written: "赤", pron: "あか", gloss: "red", score: 100 }],
            primaryReading: "あか",
            englishMeaning: "red",
            meaningJP: "赤 （あか） ／ red",
            onReading: "オン: セキ、 シャク",
            kunReading: "くん: あか、 あか.い",
        },
        curatedEntry: {
            englishMeaning: "red",
            displayWord: { written: "赤い", pron: "あかい" },
            breakdownOverrides: [
                {
                    matchWord: "赤ちゃん",
                    displayWord: { written: "赤", pron: "あか" },
                    englishMeaning: "red",
                },
            ],
        },
    });

    assert.equal(result.primaryReading, "あか");
    assert.equal(result.meaningJP, "赤 （あか） ／ red");
});

test("buildBreakdownInference suppresses katakana-only exact-match primaries", () => {
    const result = buildBreakdownInference({
        kanji: "二",
        inference: {
            candidates: [{ written: "二", pron: "アル", gloss: "two", score: 100 }],
            primaryReading: "アル",
            englishMeaning: "two",
            meaningJP: "二 ／ two",
            onReading: "オン: ジ、 ニ",
            kunReading: "くん: ふた、 ふた.つ",
        },
        curatedEntry: {
            englishMeaning: "two",
        },
    });

    assert.equal(result.primaryReading, "");
    assert.equal(result.meaningJP, "二 ／ two");
});

test("starter curated data provides learner-friendly kanji breakdown fallbacks", () => {
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
    assert.deepEqual(curatedStudyData["郵"].displayWord, { written: "郵便", pron: "ゆうびん" });
    assert.deepEqual(curatedStudyData["便"].displayWord, { written: "便利", pron: "べんり" });
    assert.deepEqual(curatedStudyData["局"].displayWord, { written: "郵便局", pron: "ゆうびんきょく" });
    assert.deepEqual(curatedStudyData["山"].displayWord, { written: "山", pron: "やま" });
    assert.deepEqual(curatedStudyData["切"].displayWord, { written: "切る", pron: "きる" });
    assert.deepEqual(curatedStudyData["物"].displayWord, { written: "物", pron: "もの" });
    assert.deepEqual(curatedStudyData["本"].displayWord, { written: "本", pron: "ほん" });
    assert.deepEqual(curatedStudyData["屋"].displayWord, { written: "屋", pron: "や" });
    assert.deepEqual(curatedStudyData["映"].displayWord, { written: "映画", pron: "えいが" });
    assert.deepEqual(curatedStudyData["画"].displayWord, { written: "計画", pron: "けいかく" });
    assert.deepEqual(curatedStudyData["安"].displayWord, { written: "安い", pron: "やすい" });
    assert.deepEqual(curatedStudyData["新"].displayWord, { written: "新しい", pron: "あたらしい" });
    assert.deepEqual(curatedStudyData["古"].displayWord, { written: "古い", pron: "ふるい" });
    assert.deepEqual(curatedStudyData["楽"].displayWord, { written: "楽しい", pron: "たのしい" });
    assert.deepEqual(curatedStudyData["近"].displayWord, { written: "近い", pron: "ちかい" });
    assert.deepEqual(curatedStudyData["社"].displayWord, { written: "社", pron: "しゃ" });
    assert.deepEqual(curatedStudyData["銀"].displayWord, { written: "銀行", pron: "ぎんこう" });
    assert.deepEqual(curatedStudyData["銀"].breakdownDisplayWord, { written: "銀", pron: "ぎん" });
    assert.deepEqual(curatedStudyData["強"].displayWord, { written: "強い", pron: "つよい" });
    assert.deepEqual(curatedStudyData["題"].displayWord, { written: "題", pron: "だい" });
    assert.deepEqual(curatedStudyData["忙"].displayWord, { written: "忙しい", pron: "いそがしい" });
    assert.deepEqual(curatedStudyData["行"].breakdownDisplayWord, { written: "行", pron: "こう" });
    assert.equal(curatedStudyData["行"].breakdownEnglishMeaning, "go / line");
    assert.deepEqual(curatedStudyData["会"].breakdownDisplayWord, { written: "会", pron: "かい" });
    assert.deepEqual(curatedStudyData["店"].breakdownDisplayWord, { written: "店", pron: "みせ" });
    assert.equal(curatedStudyData["店"].breakdownEnglishMeaning, "shop / store");
    assert.deepEqual(curatedStudyData["局"].breakdownDisplayWord, { written: "局", pron: "きょく" });
    assert.deepEqual(curatedStudyData["員"].breakdownDisplayWord, { written: "員", pron: "いん" });
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
    assert.deepEqual(curatedStudyData["空"].breakdownDisplayWord, { written: "空", pron: "そら" });
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
    assert.deepEqual(curatedStudyData["園"].breakdownDisplayWord, { written: "園", pron: "えん" });
    assert.equal(curatedStudyData["園"].breakdownEnglishMeaning, "garden / park");
    assert.deepEqual(curatedStudyData["使"].displayWord, { written: "使う", pron: "つかう" });
    assert.deepEqual(curatedStudyData["住"].displayWord, { written: "住む", pron: "すむ" });
    assert.deepEqual(curatedStudyData["待"].displayWord, { written: "待つ", pron: "まつ" });
    assert.deepEqual(curatedStudyData["起"].displayWord, { written: "起きる", pron: "おきる" });
    assert.deepEqual(curatedStudyData["寝"].breakdownDisplayWord, { written: "寝る", pron: "ねる" });
    assert.equal(curatedStudyData["寝"].breakdownEnglishMeaning, "sleep / go to bed");
    assert.deepEqual(curatedStudyData["符"].breakdownDisplayWord, { written: "符", pron: "ふ" });
    assert.deepEqual(curatedStudyData["符"].breakdownOverrides, [
        {
            matchWord: "切符",
            displayWord: { written: "符", pron: "ぷ" },
            englishMeaning: "sign / token",
        },
    ]);
    assert.equal(curatedStudyData["符"].breakdownEnglishMeaning, "sign / token");
    assert.deepEqual(curatedStudyData["切"].breakdownDisplayWord, { written: "切る", pron: "きる" });
    assert.equal(curatedStudyData["切"].breakdownEnglishMeaning, "cut");
    assert.deepEqual(curatedStudyData["便"].breakdownOverrides, [
        {
            matchWord: "郵便局",
            englishMeaning: "mail / convenience",
            displayWord: { written: "便", pron: "びん" },
        },
    ]);
    assert.deepEqual(curatedStudyData["映"].breakdownOverrides, [
        {
            matchWord: "映画",
            englishMeaning: "show / project",
            displayWord: { written: "映", pron: "えい" },
        },
    ]);
    assert.deepEqual(curatedStudyData["画"].breakdownOverrides, [
        {
            matchWord: "映画",
            englishMeaning: "picture / drawing",
            displayWord: { written: "画", pron: "が" },
        },
    ]);
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
    assert.match(result.tsv, /^今日\tきょう\t[^\t]*\t\t\ttoday\tJLPT N5\t/m);
    assert.match(result.tsv, /^今年\tことし\t[^\t]*\t\t\tthis year\tJLPT N5\t/m);
    assert.match(result.tsv, /^先生\tせんせい\t[^\t]*\t\t\tteacher\tJLPT N5\t/m);
    assert.doesNotMatch(result.tsv, /^今日\tこんにち\t/m);
    assert.doesNotMatch(result.tsv, /^先生\tせんしょう\t/m);
    assert.match(result.tsv, /Irregular reading\./);
    assert.match(result.tsv, /今日は図書館へ行きます/);
    assert.match(result.tsv, /kanji-breakdown-item/);
});

test("buildWordTsvForJlptLevel excludes curated phrase-tagged entries from the default word deck", async () => {
    const wordExportService = createWordExportService({
        sentenceCorpus: [],
        wordStudyData: {
            "高い山|たかいやま": {
                written: "高い山",
                reading: "たかいやま",
                meaning: "high mountain",
                jlpt: 5,
                tags: ["starter", "phrase", "n5"],
            },
            "山|やま": {
                written: "山",
                reading: "やま",
                meaning: "mountain",
                jlpt: 5,
                tags: ["starter", "n5"],
            },
        },
    });

    const result = await wordExportService.buildWordTsvForJlptLevel({
        levelNumber: 5,
        jlptOnlyJson: { 山: { jlpt: 5 } },
        kanjiApiClient: {
            async getKanji() {
                return { meanings: ["mountain"], on_readings: ["サン"], kun_readings: ["やま"] };
            },
            async getWords() {
                return [];
            },
        },
        concurrency: 1,
    });

    assert.match(result.tsv, /^山\tやま\t[^\t]*\t\t\tmountain\tJLPT N5\t/m);
    assert.doesNotMatch(result.tsv, /^高い山\tたかいやま\thigh mountain\tJLPT N5\t/m);
});

test("buildWordTsvForJlptLevel excludes stale compositional phrase entries even without the phrase tag", async () => {
    const wordExportService = createWordExportService({
        sentenceCorpus: [],
        wordStudyData: {
            "高い山|たかいやま": {
                written: "高い山",
                reading: "たかいやま",
                meaning: "high mountain",
                jlpt: 5,
                tags: ["starter", "n5"],
            },
            "高い|たかい": {
                written: "高い",
                reading: "たかい",
                meaning: "high / expensive",
                jlpt: 5,
                tags: ["starter", "n5"],
            },
        },
    });

    const result = await wordExportService.buildWordTsvForJlptLevel({
        levelNumber: 5,
        jlptOnlyJson: { 高: { jlpt: 5 }, 山: { jlpt: 5 } },
        kanjiApiClient: {
            async getKanji() {
                return { meanings: ["high"], on_readings: ["コウ"], kun_readings: ["たか.い"] };
            },
            async getWords() {
                return [];
            },
        },
        concurrency: 1,
    });

    assert.match(result.tsv, /^高い\tたかい\t[^\t]*\t\t\thigh \/ expensive\tJLPT N5\t/m);
    assert.doesNotMatch(result.tsv, /^高い山\tたかいやま\thigh mountain\tJLPT N5\t/m);
});

test("buildWordTsvForJlptLevel includes explicit learner-facing coverage metadata", async () => {
    const wordExportService = createWordExportService({
        sentenceCorpus: [],
        curatedStudyData: {
            時: {
                englishMeaning: "time / o'clock",
                breakdownDisplayWord: { written: "時", pron: "じ" },
            },
            間: {
                englishMeaning: "time / interval",
                breakdownEnglishMeaning: "interval / time",
                breakdownDisplayWord: { written: "間", pron: "かん" },
            },
        },
        wordStudyData: {
            "時間|じかん": {
                written: "時間",
                reading: "じかん",
                meaning: "time / hour",
                jlpt: 5,
            },
        },
    });

    const result = await wordExportService.buildWordTsvForJlptLevel({
        levelNumber: 5,
        jlptOnlyJson: {
            時: { jlpt: 5 },
            間: { jlpt: 4 },
        },
        jlptWordLevelContract: {
            wordLevels: {
                "時間|じかん": { written: "時間", reading: "じかん", jlpt: 5 },
            },
        },
        kanjiApiClient: {
            async getKanji(kanji) {
                if (kanji === "時") {
                    return { meanings: ["time"], on_readings: ["ジ"], kun_readings: ["とき"] };
                }
                return { meanings: ["interval"], on_readings: ["カン"], kun_readings: ["あいだ"] };
            },
            async getWords() {
                return [];
            },
        },
        strokeOrderService: {
            async getBestStrokeOrderPath(kanji) {
                return `animations/${kanji}.gif`;
            },
            async getStrokeOrderImagePath(kanji) {
                return `images/${kanji}.svg`;
            },
            async getStrokeOrderAnimationPath(kanji) {
                return `animations/${kanji}.gif`;
            },
        },
        concurrency: 1,
    });

    const lines = result.tsv.trim().split("\n");
    assert.equal(lines[0], "Word\tReading\tReadingBreakdown\tAudio\tPitchAccent\tMeaning\tJLPTLevel\tCoverageRole\tFocusKanji\tCoversReading\tKanjiBreakdown\tExampleSentence\tNotes");
    assert.match(lines[1], /\t<ruby>時<rt>じ<\/rt><\/ruby><ruby>間<rt>かん<\/rt><\/ruby>\t/);
    assert.match(lines[1], /\tJLPT core \+ reading coverage\t/);
    assert.match(lines[1], /\t時\t/);
    assert.match(lines[1], /\t時: じ\t/);
    assert.match(lines[1], /JLPT N4 kanji/);
    assert.match(lines[1], /Stroke order/);
    assert.match(lines[1], /時\.gif/);
    assert.match(lines[1], /間\.gif/);
});

test("buildWordTsvForJlptLevel keeps contextual compound readings aligned across word metadata", async () => {
    const wordExportService = createWordExportService({
        sentenceCorpus: [],
        curatedStudyData: {},
        wordStudyData: {
            "公園|こうえん": {
                written: "公園",
                reading: "こうえん",
                meaning: "park",
                jlpt: 5,
            },
            "学生|がくせい": {
                written: "学生",
                reading: "がくせい",
                meaning: "student",
                jlpt: 5,
            },
        },
    });

    const result = await wordExportService.buildWordTsvForJlptLevel({
        levelNumber: 5,
        jlptOnlyJson: {
            公: { jlpt: 4 },
            園: { jlpt: 3 },
            学: { jlpt: 5 },
            生: { jlpt: 5 },
        },
        jlptWordLevelContract: {
            wordLevels: {
                "公園|こうえん": { written: "公園", reading: "こうえん", jlpt: 5 },
                "学生|がくせい": { written: "学生", reading: "がくせい", jlpt: 5 },
            },
        },
        kanjiApiClient: {
            async getKanji(kanji) {
                if (kanji === "公") {
                    return { meanings: ["public", "official"], on_readings: ["ク", "コウ"], kun_readings: ["おおやけ"] };
                }
                if (kanji === "園") {
                    return { meanings: ["garden", "park"], on_readings: ["エン"], kun_readings: ["その"] };
                }
                if (kanji === "学") {
                    return { meanings: ["study", "learning"], on_readings: ["ガク"], kun_readings: ["まな.ぶ"] };
                }
                return { meanings: ["life", "birth"], on_readings: ["ショウ", "セイ"], kun_readings: ["い.きる"] };
            },
            async getWords() {
                return [];
            },
        },
        strokeOrderService: null,
        audioService: null,
        concurrency: 1,
    });

    const rowsByWord = new Map(result.tsv.trim().split("\n").slice(1).map((row) => {
        const columns = row.split("\t");
        return [columns[0], columns];
    }));
    const koenColumns = rowsByWord.get("公園");
    const gakuseiColumns = rowsByWord.get("学生");

    assert.equal(koenColumns[2], "<ruby>公<rt>こう</rt></ruby><ruby>園<rt>えん</rt></ruby>");
    assert.equal(koenColumns[9], "公: こう ／ 園: えん");
    assert.match(koenColumns[10], /公 （こう）/u);
    assert.match(koenColumns[10], /園 （えん）/u);
    assert.equal(gakuseiColumns[2], "<ruby>学<rt>がく</rt></ruby><ruby>生<rt>せい</rt></ruby>");
    assert.equal(gakuseiColumns[9], "学: がく ／ 生: せい");
    assert.match(gakuseiColumns[10], /生 （せい）/u);
});

test("buildWordTsvForJlptLevel emits governed word audio when a managed word-reading asset exists", async () => {
    const wordExportService = createWordExportService({
        sentenceCorpus: [],
        curatedStudyData: {},
        wordStudyData: {
            "時間|じかん": {
                written: "時間",
                reading: "じかん",
                meaning: "time / hour",
                pitchAccent: "じ＼かん [atamadaka]",
                jlpt: 5,
                coverage: {
                    role: "both",
                    focusKanji: ["時"],
                    coversReadings: {
                        時: "じ",
                    },
                },
            },
        },
    });

    const result = await wordExportService.buildWordTsvForJlptLevel({
        levelNumber: 5,
        jlptOnlyJson: {
            時: { jlpt: 5 },
            間: { jlpt: 4 },
        },
        jlptWordLevelContract: {
            wordLevels: {
                "時間|じかん": { written: "時間", reading: "じかん", jlpt: 5 },
            },
        },
        kanjiApiClient: {
            async getKanji(kanji) {
                if (kanji === "時") {
                    return { meanings: ["time"], on_readings: ["ジ"], kun_readings: ["とき"] };
                }
                return { meanings: ["interval"], on_readings: ["カン"], kun_readings: ["あいだ"] };
            },
            async getWords() {
                return [];
            },
        },
        audioService: {
            async getManifest(kanji) {
                if (kanji !== "時") {
                    return null;
                }
                return {
                    assets: {
                        audio: [{
                            path: "audio/6642_時-word-reading-時間-じかん.wav",
                            category: "word-reading",
                            text: "時間",
                            reading: "じかん",
                            voice: "女声1 / ノーマル",
                            source: "voicevox-nemo",
                            locale: "ja-JP",
                        }],
                    },
                };
            },
        },
        concurrency: 1,
    });

    const lines = result.tsv.trim().split("\n");
    const columns = lines[1].split("\t");
    assert.equal(columns[3], "[sound:6642_時-word-reading-時間-じかん.wav]");
    assert.equal(columns[4], "");
    assert.deepEqual(result.mediaRefs, [{
        kind: "audio",
        kanji: "時",
        relativePath: "audio/6642_時-word-reading-時間-じかん.wav",
    }]);
});

test("buildWordTsvForJlptLevel renders governed pitch accents as contour graphs", async () => {
    const wordExportService = createWordExportService({
        sentenceCorpus: [],
        curatedStudyData: {},
        wordPitchAccentData: {
            entries: {
                "後で|あとで": {
                    pattern: "1 [atamadaka]",
                    sourceId: "voicevox-nemo-accent-query",
                },
            },
        },
        wordStudyData: {
            "後で|あとで": {
                written: "後で",
                reading: "あとで",
                meaning: "later / afterwards",
                jlpt: 5,
                coverage: {
                    role: "both",
                    focusKanji: ["後"],
                    coversReadings: {
                        後: "あとで",
                    },
                },
            },
        },
    });

    const result = await wordExportService.buildWordTsvForJlptLevel({
        levelNumber: 5,
        jlptOnlyJson: {
            後: { jlpt: 5 },
        },
        jlptWordLevelContract: {
            wordLevels: {
                "後で|あとで": { written: "後で", reading: "あとで", jlpt: 5 },
            },
        },
        kanjiApiClient: {
            async getKanji() {
                return { meanings: ["behind"], on_readings: ["ゴ"], kun_readings: ["あと"] };
            },
            async getWords() {
                return [];
            },
        },
        strokeOrderService: null,
        audioService: null,
        concurrency: 1,
    });

    const lines = result.tsv.trim().split("\n");
    assert.match(lines[1], /class="pitch-accent-visual"/);
    assert.match(lines[1], /class="pitch-contour"/);
    assert.doesNotMatch(lines[1], /Pitch:/);
    assert.doesNotMatch(lines[1], /atamadaka/);
    assert.match(lines[1], />あ<\/text>/);
    assert.match(lines[1], />と<\/text>/);
    assert.match(lines[1], />で<\/text>/);
});

test("buildWordTsvForJlptLevel supports higher-level constituent kanji when support words fall back offline", async () => {
    const wordExportService = createWordExportService({
        sentenceCorpus: [],
        curatedStudyData: {},
        wordStudyData: {
            "彼女|かのじょ": {
                written: "彼女",
                reading: "かのじょ",
                meaning: "she / girlfriend",
                jlpt: 5,
                coverage: {
                    role: "support",
                    focusKanji: ["女"],
                    coversReadings: {
                        女: "じょ",
                    },
                },
                exampleSentence: {
                    japanese: "彼女は日本人です。",
                    reading: "かのじょはにほんじんです。",
                    english: "She is Japanese.",
                },
            },
        },
    });

    const result = await wordExportService.buildWordTsvForJlptLevel({
        levelNumber: 5,
        jlptOnlyJson: {
            女: { jlpt: 5, meanings: ["woman"], on_readings: ["ジョ"], kun_readings: ["おんな"] },
            彼: { jlpt: 3, meanings: ["he"], on_readings: ["ヒ"], kun_readings: ["かれ"] },
        },
        kanjiApiClient: {
            async getKanji(kanji) {
                if (kanji === "彼") {
                    throw new Error("offline only");
                }
                return { meanings: ["woman"], on_readings: ["ジョ"], kun_readings: ["おんな"] };
            },
            async getWords(kanji) {
                if (kanji === "彼") {
                    throw new Error("offline only");
                }
                return [];
            },
        },
        concurrency: 1,
    });

    assert.match(result.tsv, /彼女/u);
    assert.match(result.tsv, /Reading coverage support/u);
    assert.match(result.tsv, /女: じょ/u);
    assert.match(result.tsv, /JLPT N3 kanji/u);
});

test("buildWordTsvForJlptLevel excludes standalone higher-level kanji from lower-level word decks while keeping multi-kanji support words", async () => {
    const wordExportService = createWordExportService({
        sentenceCorpus: [],
        wordStudyData: {
            "兄|あに": {
                written: "兄",
                reading: "あに",
                meaning: "older brother",
                jlpt: 4,
                exampleSentence: {
                    japanese: "兄は大学で勉強しています。",
                    reading: "あにはだいがくでべんきょうしています。",
                    english: "My older brother studies at university.",
                },
            },
            "子猫|こねこ": {
                written: "子猫",
                reading: "こねこ",
                meaning: "kitten",
                jlpt: 5,
                exampleSentence: {
                    japanese: "子猫が部屋で寝ています。",
                    reading: "こねこがへやでねています。",
                    english: "A kitten is sleeping in the room.",
                },
            },
        },
    });

    const result = await wordExportService.buildWordTsvForJlptLevel({
        levelNumber: 5,
        jlptOnlyJson: {
            子: { jlpt: 5, meanings: ["child"], on_readings: ["シ"], kun_readings: ["こ"] },
            猫: { jlpt: 4, meanings: ["cat"], on_readings: ["ビョウ"], kun_readings: ["ねこ"] },
            兄: { jlpt: 4, meanings: ["older brother"], on_readings: ["キョウ"], kun_readings: ["あに"] },
        },
        jlptWordLevelContract: {
            wordLevels: {
                "兄|あに": {
                    written: "兄",
                    reading: "あに",
                    jlpt: 4,
                },
                "子猫|こねこ": {
                    written: "子猫",
                    reading: "こねこ",
                    jlpt: 5,
                },
            },
        },
        kanjiApiClient: {
            async getKanji(kanji) {
                if (kanji === "兄") {
                    return { meanings: ["older brother"], on_readings: ["キョウ"], kun_readings: ["あに"] };
                }
                if (kanji === "猫") {
                    return { meanings: ["cat"], on_readings: ["ビョウ"], kun_readings: ["ねこ"] };
                }
                return { meanings: ["child"], on_readings: ["シ"], kun_readings: ["こ"] };
            },
            async getWords() {
                return [];
            },
        },
        concurrency: 1,
    });

    assert.doesNotMatch(result.tsv, /^兄\tあに\tolder brother\t/m);
    assert.match(result.tsv, /^子猫\tこねこ\t[^\t]*\t\t\tkitten\tJLPT N5\t/m);
    assert.match(result.tsv, /JLPT N4 kanji/u);
});

test("buildWordTsvForJlptLevel uses the canonical word-level contract before constituent heuristics", async () => {
    const wordExportService = createWordExportService({
        sentenceCorpus: [],
        wordStudyData: {
            "今年|ことし": {
                written: "今年",
                reading: "ことし",
                meaning: "this year",
                jlpt: 5,
            },
        },
    });

    const result = await wordExportService.buildWordTsvForJlptLevel({
        levelNumber: 5,
        jlptOnlyJson: {
            今: { jlpt: 5 },
            年: { jlpt: 4 },
        },
        jlptWordLevelContract: {
            wordLevels: {
                "今年|ことし": {
                    written: "今年",
                    reading: "ことし",
                    jlpt: 5,
                },
            },
        },
        kanjiApiClient: {
            async getKanji() {
                return { meanings: ["year"], on_readings: ["ネン"], kun_readings: ["とし"] };
            },
            async getWords() {
                return [];
            },
        },
        concurrency: 1,
    });

    assert.match(result.tsv, /^今年\tことし\t[^\t]*\t\t\tthis year\tJLPT N5\t/m);
    assert.deepEqual(result.governance, {
        rowCount: 1,
        canonicalRows: 1,
        curatedOnlyRows: 0,
        inferredOnlyRows: 0,
    });
});

test("buildWordTsvForJlptLevel does not let a stale curated JLPT tag override the canonical word contract", async () => {
    const wordExportService = createWordExportService({
        sentenceCorpus: [],
        wordStudyData: {
            "今年|ことし": {
                written: "今年",
                reading: "ことし",
                meaning: "this year",
                jlpt: 4,
            },
        },
    });

    const sharedOptions = {
        jlptOnlyJson: {
            今: { jlpt: 5 },
            年: { jlpt: 4 },
        },
        jlptWordLevelContract: {
            wordLevels: {
                "今年|ことし": {
                    written: "今年",
                    reading: "ことし",
                    jlpt: 5,
                },
            },
        },
        kanjiApiClient: {
            async getKanji() {
                return { meanings: ["year"], on_readings: ["ネン"], kun_readings: ["とし"] };
            },
            async getWords() {
                return [];
            },
        },
        concurrency: 1,
    };

    const n4Result = await wordExportService.buildWordTsvForJlptLevel({
        ...sharedOptions,
        levelNumber: 4,
    });
    const n5Result = await wordExportService.buildWordTsvForJlptLevel({
        ...sharedOptions,
        levelNumber: 5,
    });

    assert.doesNotMatch(n4Result.tsv, /^今年\tことし\tthis year\tJLPT N4\t/m);
    assert.match(n5Result.tsv, /^今年\tことし\t[^\t]*\t\t\tthis year\tJLPT N5\t/m);
});

