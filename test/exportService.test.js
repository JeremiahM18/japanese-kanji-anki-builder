const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildTsvForJlptLevel,
    createEmptyExportProfile,
    createExportService,
    formatAnkiAudioField,
    formatAnkiStrokeOrderField,
    resolveManagedMediaFields,
    selectPrimaryReading,
} = require("../src/services/exportService");

test("formatAnkiAudioField emits sound markup from the managed asset name", () => {
    assert.equal(formatAnkiAudioField("audio/65E5_日-kanji-reading-日.mp3"), "[sound:65E5_日-kanji-reading-日.mp3]");
    assert.equal(formatAnkiAudioField(""), "");
});

test("formatAnkiStrokeOrderField emits image markup from the managed asset name", () => {
    assert.equal(formatAnkiStrokeOrderField("animations/65E5_日-stroke-order.gif"), '<img src="65E5_日-stroke-order.gif" />');
    assert.equal(formatAnkiStrokeOrderField(""), "");
});



test("formatAnkiStrokeOrderField keeps animated GIF references Anki can render", () => {
    assert.equal(
        formatAnkiStrokeOrderField("animations/4E00_一-stroke-order.gif"),
        '<img src="4E00_一-stroke-order.gif" />'
    );
});

test("selectPrimaryReading prefers the learner-facing display pronunciation", () => {
    assert.equal(selectPrimaryReading({
        displayWord: { written: "行く", pron: "いく" },
        bestWord: { written: "銀行", pron: "ぎんこう" },
    }), "いく");
    assert.equal(selectPrimaryReading({
        displayWord: { written: "行", pron: "" },
        bestWord: { written: "行", pron: "こう" },
    }), "こう");
});


test("resolveManagedMediaFields reuses a single shared manifest lookup when available", async () => {
    let manifestCalls = 0;
    const mediaFields = await resolveManagedMediaFields({
        kanji: "日",
        strokeOrderService: {
            async getManifest() {
                manifestCalls += 1;
                return {
                    assets: {
                        strokeOrderImage: { path: "images/65E5_日-stroke-order.png" },
                        strokeOrderAnimation: { path: "animations/65E5_日-stroke-order.gif" },
                        audio: [{
                            path: "audio/65E5_日-kanji-reading-日.mp3",
                            category: "kanji-reading",
                            text: "日",
                            locale: "ja-JP",
                        }],
                    },
                };
            },
        },
        audioService: {
            async getBestAudioPath() {
                throw new Error("should not call audio fallback when manifest lookup is available");
            },
        },
    });

    assert.equal(manifestCalls, 1);
    assert.deepEqual(mediaFields, {
        strokeOrderPath: "animations/65E5_日-stroke-order.gif",
        strokeOrderImagePath: "images/65E5_日-stroke-order.png",
        strokeOrderAnimationPath: "animations/65E5_日-stroke-order.gif",
        audioPath: "audio/65E5_日-kanji-reading-日.mp3",
    });
});

test("buildRowForKanji skips word fetch for fully curated kanji cards", async () => {
    let wordFetchCalled = false;
    const exportService = createExportService({
        inferenceEngine: {
            hasFullyCuratedKanjiEntry(kanji) {
                return kanji === "日";
            },
            inferKanjiStudyData() {
                return {
                    displayWord: { written: "日本", pron: "にほん" },
                    bestWord: null,
                    meaningJP: "日本 （にほん） ／ Japan",
                    notes: "日本 （にほん） - Japan",
                    sentenceCandidates: [{
                        japanese: "日本へ行きます。",
                        reading: "にほんへいきます。",
                        english: "I will go to Japan.",
                    }],
                };
            },
        },
    });

    const row = await exportService.buildRowForKanji({
        kanji: "日",
        kradMap: new Map([["日", ["日"]]]),
        pickMainComponent(components) {
            return components[0] || "";
        },
        kanjiApiClient: {
            async getKanji() {
                return {
                    meanings: ["day"],
                    on_readings: ["ニチ"],
                    kun_readings: ["ひ"],
                };
            },
            async getWords() {
                wordFetchCalled = true;
                throw new Error("should not fetch words for a fully curated card");
            },
        },
        strokeOrderService: null,
        audioService: null,
    });

    const cols = row.split("	");
    assert.equal(wordFetchCalled, false);
    assert.equal(cols[0], "日");
    assert.equal(cols[1], "日本");
    assert.equal(cols[2], "日本 （にほん） ／ Japan");
    assert.equal(cols[3], "にほん");
    assert.equal(cols[11], "日本 （にほん） - Japan");
    assert.equal(cols[12], "日本へ行きます。 ／ にほんへいきます。 ／ I will go to Japan.");
});

test("buildRowForKanji uses local JLPT data and skips remote fetches for fully curated kanji cards", async () => {
    let wordFetchCalled = false;
    let kanjiFetchCalled = false;
    const exportService = createExportService({
        inferenceEngine: {
            hasFullyCuratedKanjiEntry(kanji) {
                return kanji === "日";
            },
            inferKanjiStudyData() {
                return {
                    displayWord: { written: "日本", pron: "にほん" },
                    bestWord: null,
                    meaningJP: "日本 （にほん） ／ Japan",
                    notes: "日本 （にほん） - Japan",
                    sentenceCandidates: [{
                        japanese: "日本へ行きます。",
                        reading: "にほんへいきます。",
                        english: "I will go to Japan.",
                    }],
                };
            },
        },
    });

    const row = await exportService.buildRowForKanji({
        kanji: "日",
        jlptEntry: {
            jlpt: 5,
            meanings: ["day"],
            on_readings: ["ニチ"],
            kun_readings: ["ひ"],
        },
        kradMap: new Map([["日", ["日"]]]),
        pickMainComponent(components) {
            return components[0] || "";
        },
        kanjiApiClient: {
            async getKanji() {
                kanjiFetchCalled = true;
                throw new Error("should not fetch kanji info for a fully curated card when jlptEntry is available");
            },
            async getWords() {
                wordFetchCalled = true;
                throw new Error("should not fetch words for a fully curated card");
            },
        },
        strokeOrderService: null,
        audioService: null,
    });

    const cols = row.split("	");
    assert.equal(wordFetchCalled, false);
    assert.equal(kanjiFetchCalled, false);
    assert.equal(cols[0], "日");
    assert.equal(cols[1], "日本");
    assert.equal(cols[2], "日本 （にほん） ／ Japan");
    assert.equal(cols[3], "にほん");
    assert.equal(cols[4], "オン: ニチ");
    assert.equal(cols[5], "くん: ひ");
    assert.equal(cols[11], "日本 （にほん） - Japan");
    assert.equal(cols[12], "日本へ行きます。 ／ にほんへいきます。 ／ I will go to Japan.");
});

test("buildRowForKanji records export profiling timings and row counts", async () => {
    const exportProfile = createEmptyExportProfile();
    const exportService = createExportService({
        inferenceEngine: {
            hasFullyCuratedKanjiEntry() {
                return false;
            },
            inferKanjiStudyData() {
                return {
                    displayWord: { written: "日本", pron: "にほん" },
                    bestWord: null,
                    meaningJP: "日本 （にほん） ／ Japan",
                    notes: "日本 （にほん） - Japan",
                    sentenceCandidates: [{
                        japanese: "日本へ行きます。",
                        reading: "にほんへいきます。",
                        english: "I will go to Japan.",
                    }],
                };
            },
        },
    });

    await exportService.buildRowForKanji({
        kanji: "日",
        kradMap: new Map([["日", ["日"]]]),
        pickMainComponent(components) {
            return components[0] || "";
        },
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
        exportProfile,
    });

    assert.equal(exportProfile.rows, 1);
    assert.equal(exportProfile.fullyCuratedRows, 0);
    assert.equal(exportProfile.inferredRows, 1);
    assert.equal(exportProfile.timingsMs.getKanji > 0, true);
    assert.equal(exportProfile.timingsMs.getWords > 0, true);
    assert.equal(exportProfile.timingsMs.media >= 0, true);
    assert.equal(exportProfile.timingsMs.inference >= 0, true);
    assert.equal(exportProfile.timingsMs.formatting >= 0, true);
  });

test("buildTsvForJlptLevel builds expected TSV rows and respects limit", async () => {
    const jlptOnlyJson = {
        日: { jlpt: 5 },
        本: { jlpt: 5 },
        人: { jlpt: 4 },
        学: { jlpt: 3 },
        校: { jlpt: 2 },
        難: { jlpt: 1 },
    };

    const kradMap = new Map([
        ["日", ["日"]],
        ["本", ["木"]],
        ["人", ["人"]],
        ["学", ["子"]],
        ["校", ["木", "交"]],
        ["難", ["又", "隹"]],
    ]);

    function pickMainComponent(components) {
        return components[0] || "";
    }

    const kanjiApiClient = {
        async getKanji(kanji) {
            if (kanji === "日") {
                return {
                    meanings: ["day", "sun"],
                    on_readings: ["ニチ", "ジツ"],
                    kun_readings: ["ひ", "び", "か"],
                };
            }
            if (kanji === "本") {
                return {
                    meanings: ["book", "origin"],
                    on_readings: ["ホン"],
                    kun_readings: ["もと"],
                };
            }
            if (kanji === "人") {
                return {
                    meanings: ["person"],
                    on_readings: ["ジン", "ニン"],
                    kun_readings: ["ひと"],
                };
            }
            if (kanji === "学") {
                return {
                    meanings: ["study", "learning"],
                    on_readings: ["ガク"],
                    kun_readings: ["まなぶ"],
                };
            }
            if (kanji === "校") {
                return {
                    meanings: ["school"],
                    on_readings: ["コウ"],
                    kun_readings: ["いわし"],
                };
            }
            if (kanji === "難") {
                return {
                    meanings: ["difficult", "hard"],
                    on_readings: ["ナン"],
                    kun_readings: ["むずかしい"],
                };
            }

            throw new Error(`Unexpected kanji in getKanji: ${kanji}`);
        },

        async getWords(kanji) {
            if (kanji === "日") {
                return [
                    {
                        variants: [
                            {
                                written: "日本",
                                pronounced: "にほん",
                                priorities: ["news1", "ichi1"],
                            },
                        ],
                        meanings: [
                            {
                                glosses: ["Japan"],
                            },
                        ],
                    },
                    {
                        variants: [
                            {
                                written: "日よう日",
                                pronounced: "にちようび",
                                priorities: ["ichi1"],
                            },
                        ],
                        meanings: [
                            {
                                glosses: ["Sunday"],
                            },
                        ],
                    },
                ];
            }
            if (kanji === "本") {
                return [
                    {
                        variants: [
                            {
                                written: "本",
                                pronounced: "ほん",
                                priorities: ["ichi1"],
                            },
                        ],
                        meanings: [
                            {
                                glosses: ["book", "origin"],
                            },
                        ],
                    },
                ];
            }
            if (kanji === "人") {
                return [
                    {
                        variants: [
                            {
                                written: "人",
                                pronounced: "ひと",
                                priorities: ["ichi1"],
                            },
                        ],
                        meanings: [
                            {
                                glosses: ["person"],
                            },
                        ],
                    },
                ];
            }
            if (kanji === "学") {
                return [
                    {
                        variants: [
                            {
                                written: "学",
                                pronounced: "がく",
                                priorities: ["ichi1"],
                            },
                        ],
                        meanings: [
                            {
                                glosses: ["study", "learning"],
                            },
                        ],
                    },
                ];
            }
            if (kanji === "校") {
                return [
                    {
                        variants: [
                            {
                                written: "校",
                                pronounced: "こう",
                                priorities: ["ichi1"],
                            },
                        ],
                        meanings: [
                            {
                                glosses: ["school"],
                            },
                        ],
                    },
                ];
            }
            if (kanji === "難") {
                return [
                    {
                        variants: [
                            {
                                written: "難",
                                pronounced: "なん",
                                priorities: ["ichi1"],
                            },
                        ],
                        meanings: [
                            {
                                glosses: ["difficult", "hard"],
                            },
                        ],
                    },
                ];
            }

            throw new Error(`Unexpected kanji in getWords: ${kanji}`);
        },
    };

    const strokeOrderService = {
        async getBestStrokeOrderPath(kanji) {
            return kanji === "日" ? "animations/65E5_日-stroke-order.gif" : "";
        },
        async getStrokeOrderImagePath(kanji) {
            return kanji === "日" ? "images/65E5_日-stroke-order.svg" : "";
        },
        async getStrokeOrderAnimationPath(kanji) {
            return kanji === "日" ? "animations/65E5_日-stroke-order.gif" : "";
        },
    };

    const audioService = {
        async getBestAudioPath(kanji) {
            return kanji === "日" ? "audio/65E5_日-kanji-reading-日.mp3" : "";
        },
    };

    const tsv = await buildTsvForJlptLevel({
        levelNumber: 5,
        jlptOnlyJson,
        kradMap,
        pickMainComponent,
        kanjiApiClient,
        strokeOrderService,
        audioService,
        limit: 1,
    });

    const lines = tsv.trim().split("\n");

    assert.equal(lines.length, 2);
    assert.equal(lines[0], "Kanji\tDisplayWord\tMeaningJP\tPrimaryReading\tOnReading\tKunReading\tStrokeOrder\tStrokeOrderImage\tStrokeOrderAnimation\tAudio\tRadical\tNotes\tExampleSentence");

    const cols = lines[1].split("\t");
    assert.equal(cols[0], "日");
    assert.equal(cols[1], "日本");
    assert.equal(cols[2], "日本 （にほん） ／ day");
    assert.equal(cols[3], "にほん");
    assert.equal(cols[4], "オン: ニチ、 ジツ");
    assert.equal(cols[5], "くん: ひ、 び、 か");
    assert.equal(cols[6], '<img src="65E5_日-stroke-order.gif" />');
    assert.equal(cols[7], '<img src="65E5_日-stroke-order.svg" />');
    assert.equal(cols[8], '<img src="65E5_日-stroke-order.gif" />');
    assert.equal(cols[9], "[sound:65E5_日-kanji-reading-日.mp3]");
    assert.equal(cols[10], "日");
    assert.equal(cols[11], "日本 （にほん） - Japan ／ 日よう日 （にちようび） - Sunday");
    assert.equal(cols[12], '「日本」を勉強します。 ／ 「にほん」をべんきょうします。 ／ I study the word "日本".');
});


test("buildRowForKanji falls back to local data instead of leaking raw timeout errors", async () => {
    const exportIssues = [];
    const exportService = createExportService({
        inferenceEngine: {
            hasFullyCuratedKanjiEntry() {
                return false;
            },
            inferKanjiStudyData() {
                throw new Error("inference should not run when API fetch fails");
            },
        },
        curatedStudyData: {
            主: {
                englishMeaning: "main / primary",
                displayWord: { written: "主", pron: "おも" },
                preferredWords: ["主"],
                notes: "主 （おも） - main / primary",
                exampleSentence: {
                    japanese: "主な理由を説明してください。",
                    reading: "おもなりゆうをせつめいしてください。",
                    english: "Please explain the main reason.",
                },
            },
        },
        sentenceCorpus: [],
    });

    const row = await exportService.buildRowForKanji({
        kanji: "主",
        jlptEntry: {
            jlpt: 4,
            meanings: ["master", "main", "lord"],
            on_readings: ["シュ"],
            kun_readings: ["ぬし", "おも"],
        },
        kradMap: new Map([["主", ["丶"]]]),
        pickMainComponent(components) {
            return components[0] || "";
        },
        kanjiApiClient: {
            async getKanji() {
                return {
                    meanings: ["master", "main", "lord"],
                    on_readings: ["シュ"],
                    kun_readings: ["ぬし", "おも"],
                };
            },
            async getWords() {
                throw new Error("Request timed out after 10000 ms: https://kanjiapi.dev/v1/words/%E4%B8%BB");
            },
        },
        strokeOrderService: null,
        audioService: null,
        exportIssues,
    });

    const cols = row.split("\t");
    assert.equal(row.includes("ERROR:"), false);
    assert.equal(cols[0], "主");
    assert.equal(cols[1], "主");
    assert.equal(cols[2], "主 （おも） ／ main / primary");
    assert.equal(cols[4], "オン: シュ");
    assert.equal(cols[5], "くん: ぬし、 おも");
    assert.equal(cols[11], "主 （おも） - main / primary");
    assert.equal(cols[12], "主な理由を説明してください。 ／ おもなりゆうをせつめいしてください。 ／ Please explain the main reason.");
    assert.deepEqual(exportIssues, [{
        kanji: "主",
        level: 4,
        severity: "warning",
        resolution: "offline-local-fallback",
        error: "Request timed out after 10000 ms: https://kanjiapi.dev/v1/words/%E4%B8%BB",
    }]);
});

