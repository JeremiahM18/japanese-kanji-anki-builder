const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildOfflineFallbackCard,
    buildOfflineSentenceCandidate,
    buildPreviewCards,
    selectPreviewKanji,
} = require("../src/services/previewCardService");

test("selectPreviewKanji defaults to N5 and respects explicit kanji", () => {
    const jlptOnlyJson = {
        日: { jlpt: 5 },
        不: { jlpt: 4 },
    };

    assert.deepEqual(selectPreviewKanji({ jlptOnlyJson, level: null, limit: 5, kanji: [] }), ["日"]);
    assert.deepEqual(selectPreviewKanji({ jlptOnlyJson, level: 4, limit: 5, kanji: [] }), ["不"]);
    assert.deepEqual(selectPreviewKanji({ jlptOnlyJson, level: 5, limit: 5, kanji: ["金", "日", "金"] }), ["金", "日"]);
});

test("buildOfflineSentenceCandidate prefers best local sentence", () => {
    const candidate = buildOfflineSentenceCandidate("日", null, [
        { kanji: "日", japanese: "日です。", english: "It is day.", frequencyRank: 1 },
        { kanji: "日", japanese: "日本です。", reading: "にほんです。", english: "It is Japan.", frequencyRank: 5 },
    ]);

    assert.equal(candidate.japanese, "日本です。");
});

test("buildOfflineFallbackCard uses local data when inference is unavailable", async () => {
    const card = await buildOfflineFallbackCard({
        kanji: "学",
        levelLabel: "N5",
        jlptEntry: { on_readings: ["ガク"], kun_readings: ["まな.ぶ"] },
        curatedStudyData: {
            学: {
                preferredWords: ["学校"],
                displayWord: { written: "学", pron: "まな" },
                englishMeaning: "school",
                notes: "Study-related kanji.",
                exampleSentence: {
                    japanese: "学校へ行きます。",
                    reading: "がっこうへいきます。",
                    english: "I go to school.",
                },
            },
        },
        sentenceCorpus: [],
        kradMap: new Map([["学", ["子"]]]),
        strokeOrderService: null,
        audioService: null,
    });

    assert.equal(card.previewMode, "offline-local-fallback");
    assert.equal(card.meaningJP, "学 （まな） ／ school");
    assert.equal(card.primaryReading, "まな");
    assert.match(card.reading, /ガク/);
    assert.match(card.exampleSentence, /学校へ行きます/);
});

test("buildPreviewCards falls back cleanly when inference throws", async () => {
    const cards = await buildPreviewCards({
        kanjiList: ["日"],
        jlptOnlyJson: { 日: { jlpt: 5, on_readings: ["ニチ"], kun_readings: ["ひ"] } },
        curatedStudyData: {},
        sentenceCorpus: [{ kanji: "日", japanese: "日本です。", reading: "にほんです。", english: "It is Japan.", frequencyRank: 1 }],
        kradMap: new Map([["日", ["日"]]]),
        kanjiApiClient: {},
        strokeOrderService: null,
        audioService: null,
        exportService: {
            buildInferenceForKanji: async () => {
                throw new Error("fetch failed");
            },
        },
    });

    assert.equal(cards.length, 1);
    assert.equal(cards[0].previewMode, "offline-local-fallback");
    assert.match(cards[0].warning, /local fallback data/);
});
test("buildPreviewCards uses local corpus and curated data in its default inference path", async () => {
    const cards = await buildPreviewCards({
        kanjiList: ["一"],
        jlptOnlyJson: { 一: { jlpt: 5 } },
        curatedStudyData: {
            一: {
                preferredWords: ["一つ"],
                exampleSentence: {
                    japanese: "一つください。",
                    reading: "ひとつください。",
                    english: "Please give me one.",
                },
            },
        },
        sentenceCorpus: [],
        kradMap: new Map([["一", ["一"]]]),
        kanjiApiClient: {
            getKanji: async () => ({ meanings: ["one"], on_readings: ["イチ"], kun_readings: ["ひと"] }),
            getWords: async () => ([
                {
                    variants: [{ written: "一", pronounced: "ひと", priorities: ["spec1"] }],
                    meanings: [{ glosses: ["one"] }],
                },
            ]),
        },
        strokeOrderService: null,
        audioService: null,
    });

    assert.equal(cards.length, 1);
    assert.equal(cards[0].previewMode, "full-inference");
    assert.equal(cards[0].primaryReading, "ひと");
    assert.match(cards[0].exampleSentence, /一つください/);
});

