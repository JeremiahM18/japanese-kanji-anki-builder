const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createEmptyExportProfile,
    createExportService,
    formatAnkiAudioField,
    formatAnkiStrokeOrderField,
    formatExampleSentence,
    formatKanjiMeanings,
    formatNotesWithRuby,
    formatRubyText,
    formatStudyWordKanjiLabels,
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

test("formatExampleSentence preserves katakana in the reading surface", () => {
    assert.equal(
        formatExampleSentence({
            japanese: "朝はいつもパンとコーヒーを飲みます。",
            reading: "あさはいつもぱんとこーひーをのみます。",
            english: "I always drink coffee and eat bread in the morning.",
        }),
        "朝はいつもパンとコーヒーを飲みます。 ／ あさはいつもパンとコーヒーをのみます。 ／ I always drink coffee and eat bread in the morning."
    );
});

test("formatExampleSentence leaves existing katakana readings unchanged", () => {
    assert.equal(
        formatExampleSentence({
            japanese: "メールの内容を確認してください。",
            reading: "メールのないようをかくにんしてください。",
            english: "Please check the contents of the email.",
        }),
        "メールの内容を確認してください。 ／ メールのないようをかくにんしてください。 ／ Please check the contents of the email."
    );
});

test("formatNotesWithRuby renders note example readings as ruby", () => {
    assert.equal(
        formatNotesWithRuby("外 （そと） - outside ／ 外国 （がいこく） - foreign country"),
        "<ruby>外<rt>そと</rt></ruby> - outside ／ <ruby>外国<rt>がいこく</rt></ruby> - foreign country"
    );
});

test("formatRubyText keeps okurigana outside ruby", () => {
    assert.equal(
        formatRubyText("走る", "はしる"),
        "<ruby>走<rt>はし</rt></ruby>る"
    );
});

test("formatRubyText keeps kana prefixes and inflection kana outside ruby", () => {
    assert.equal(
        formatRubyText("取り出す", "とりだす"),
        "<ruby>取<rt>と</rt></ruby>り<ruby>出<rt>だ</rt></ruby>す"
    );
});

test("formatRubyText keeps katakana loanword spans outside ruby", () => {
    assert.equal(
        formatRubyText("バス停", "ばすてい"),
        "バス<ruby>停<rt>てい</rt></ruby>"
    );
});

test("formatKanjiMeanings removes duplicate and radical-index gloss noise", () => {
    assert.equal(
        formatKanjiMeanings({
            kanjiInfo: { meanings: ["two", "two radical (no. 7)", "Two"] },
            curatedEntry: { englishMeaning: "two" },
        }),
        "two"
    );
});

test("formatKanjiMeanings removes unsafe low-value dictionary gloss noise", () => {
    assert.equal(
        formatKanjiMeanings({
            kanjiInfo: { meanings: ["dirty", "defile", "disgrace", "pollute", "rape", "%"] },
            curatedEntry: { englishMeaning: "dirty" },
        }),
        "dirty / defile / disgrace / pollute"
    );
});

test("formatKanjiMeanings applies curated blocked dictionary glosses", () => {
    assert.equal(
        formatKanjiMeanings({
            kanjiInfo: { meanings: ["extreme", "10**48", "electric poles", "highest rank"] },
            curatedEntry: {
                englishMeaning: "extreme / very",
                blockedMeanings: ["10**48", "electric poles"],
            },
        }),
        "extreme / very / highest rank"
    );
});

test("formatStudyWordKanjiLabels suppresses current-level kanji for kanji deck warnings", () => {
    const levels = new Map([
        ["日", 5],
        ["本", 5],
        ["公", 5],
        ["園", 3],
    ]);

    assert.equal(formatStudyWordKanjiLabels("日本", levels, { currentLevel: 5 }), "");
    assert.equal(
        formatStudyWordKanjiLabels("公園", levels, { currentLevel: 3 }),
        '<span class="kanji-level-badge">公: JLPT N5</span>'
    );
    assert.equal(
        formatStudyWordKanjiLabels("喫茶店", new Map([["茶", 3], ["店", 4]]), { currentLevel: 3 }),
        '<span class="kanji-level-badge">喫: outside JLPT</span> <span class="kanji-level-badge">店: JLPT N4</span>'
    );
});

test("buildInferenceForKanji keeps the target kanji as the learner-facing anchor", async () => {
    const exportService = createExportService({
        inferenceEngine: {
            hasFullyCuratedKanjiEntry() {
                return false;
            },
            inferKanjiStudyData() {
                return {
                    displayWord: { written: "行く", pron: "いく" },
                    bestWord: { written: "銀行", pron: "ぎんこう" },
                    meaningJP: "行く （いく） ／ go",
                    notes: "行く （いく） - go",
                    sentenceCandidates: [],
                };
            },
        },
    });

    const inference = await exportService.buildInferenceForKanji({
        kanji: "行",
        kanjiApiClient: {
            async getKanji() {
                return { meanings: ["go"], on_readings: ["コウ"], kun_readings: ["いく"] };
            },
            async getWords() {
                return [];
            },
        },
        strokeOrderService: null,
        audioService: null,
        jlptOnlyJson: {
            日: { jlpt: 5 },
            本: { jlpt: 5 },
        },
    });

    assert.equal(inference.displayWordText, "行");
    assert.equal(inference.primaryReading, "いく");
    assert.equal(inference.meaningJP, "go");
});

test("buildInferenceForKanji keeps primaryReading visible when the display word is bare kanji", async () => {
    const exportService = createExportService({
        inferenceEngine: {
            hasFullyCuratedKanjiEntry() {
                return false;
            },
            inferKanjiStudyData() {
                return {
                    displayWord: { written: "日", pron: "" },
                    bestWord: { written: "日本", pron: "にほん" },
                    meaningJP: "日 ／ day",
                    notes: "日本 （にほん） - Japan",
                    sentenceCandidates: [],
                };
            },
        },
    });

    const inference = await exportService.buildInferenceForKanji({
        kanji: "日",
        jlptEntry: { meanings: ["day"], on_readings: ["ニチ"], kun_readings: ["ひ"], jlpt: 5 },
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
    });

    assert.equal(inference.displayWordText, "日");
    assert.equal(inference.meaningJP, "day");
    assert.equal(inference.primaryReading, "ひ");
});

test("buildInferenceForKanji rejects compound words as kanji deck anchors", async () => {
    const exportService = createExportService({
        inferenceEngine: {
            hasFullyCuratedKanjiEntry() {
                return false;
            },
            inferKanjiStudyData() {
                return {
                    displayWord: { written: "日本", pron: "にほん" },
                    bestWord: { written: "日本", pron: "にほん" },
                    englishMeaning: "sun / day marker",
                    meaningJP: "日本 （にほん） ／ sun / day marker",
                    notes: "日本 （にほん） - Japan",
                    sentenceCandidates: [],
                };
            },
        },
    });

    const inference = await exportService.buildInferenceForKanji({
        kanji: "日",
        jlptEntry: { meanings: ["day"], on_readings: ["ニチ"], kun_readings: ["ひ"], jlpt: 5 },
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
        jlptOnlyJson: {
            日: { jlpt: 5 },
            本: { jlpt: 5 },
        },
    });

    assert.equal(inference.displayWordText, "日");
    assert.equal(inference.primaryReading, "ひ");
    assert.equal(inference.meaningJP, "day");
    assert.equal(inference.studyWordKanji, "");
});

test("buildInferenceForKanji uses curated single-kanji breakdown readings before compound word readings", async () => {
    const exportService = createExportService({
        curatedStudyData: {
            車: {
                displayWord: { written: "電車", pron: "でんしゃ" },
                breakdownDisplayWord: { written: "車", pron: "くるま" },
            },
        },
        inferenceEngine: {
            hasFullyCuratedKanjiEntry() {
                return true;
            },
            inferKanjiStudyData() {
                return {
                    displayWord: { written: "電車", pron: "でんしゃ" },
                    bestWord: { written: "電車", pron: "でんしゃ" },
                    englishMeaning: "car / vehicle",
                    meaningJP: "電車 （でんしゃ） ／ car / vehicle",
                    notes: "電車 （でんしゃ） - train ／ 車 （くるま） - car",
                    sentenceCandidates: [],
                };
            },
        },
    });

    const inference = await exportService.buildInferenceForKanji({
        kanji: "車",
        jlptEntry: { meanings: ["car"], on_readings: ["シャ"], kun_readings: ["くるま"], jlpt: 5 },
        kanjiApiClient: {
            async getKanji() {
                throw new Error("should use local JLPT data");
            },
            async getWords() {
                throw new Error("should skip word fetch");
            },
        },
        strokeOrderService: {
            async getManifest() {
                return {
                    assets: {
                        strokeOrderImage: null,
                        strokeOrderAnimation: { path: "animations/8ECA_車-stroke-order.gif" },
                        audio: [{
                            path: "audio/8ECA_車-kanji-reading-車-くるま.wav",
                            category: "kanji-reading",
                            text: "車",
                            reading: "くるま",
                            locale: "ja-JP",
                        }],
                    },
                };
            },
        },
        audioService: null,
    });

    assert.equal(inference.displayWordText, "車");
    assert.equal(inference.primaryReading, "くるま");
    assert.equal(inference.meaningJP, "car");
    assert.equal(inference.kanjiMeanings, "car");
    assert.equal(inference.audioPath, "audio/8ECA_車-kanji-reading-車-くるま.wav");
});

test("buildInferenceForKanji keeps the curated kanji primary reading ahead of display examples", async () => {
    const exportService = createExportService({
        curatedStudyData: {
            行: {
                displayWord: { written: "行く", pron: "いく" },
                breakdownDisplayWord: { written: "行", pron: "こう" },
                breakdownEnglishMeaning: "go / line",
                breakdownOverrides: [{
                    matchWord: "銀行",
                    displayWord: { written: "行", pron: "こう" },
                    englishMeaning: "bank / line",
                }],
                englishMeaning: "go / carry out / line",
                notes: "行く （いく） - go ／ 銀行 （ぎんこう） - bank",
            },
        },
        inferenceEngine: {
            hasFullyCuratedKanjiEntry() {
                return true;
            },
            inferKanjiStudyData() {
                return {
                    displayWord: { written: "行く", pron: "いく" },
                    bestWord: { written: "行く", pron: "いく" },
                    englishMeaning: "go / conduct",
                    meaningJP: "行く （いく） ／ go / conduct",
                    notes: "行 （こう） - conduct ／ 行く （いく） - go",
                    sentenceCandidates: [],
                };
            },
        },
    });

    const inference = await exportService.buildInferenceForKanji({
        kanji: "行",
        jlptEntry: { meanings: ["going", "journey"], on_readings: ["コウ", "ギョウ"], kun_readings: ["い.く"], jlpt: 5 },
        kanjiApiClient: {
            async getKanji() {
                throw new Error("should use local JLPT data");
            },
            async getWords() {
                throw new Error("should skip word fetch");
            },
        },
        strokeOrderService: null,
        audioService: null,
    });

    assert.equal(inference.displayWordText, "行");
    assert.equal(inference.primaryReading, "いく");
    assert.equal(inference.meaningJP, "go");
});

test("buildInferenceForKanji uses bare-kanji breakdown reading when display word pronunciation is a wrapper", async () => {
    const exportService = createExportService({
        curatedStudyData: {
            婆: {
                displayWord: { written: "お婆さん", pron: "おばあさん" },
                breakdownDisplayWord: { written: "婆", pron: "ばあ" },
                englishMeaning: "old woman / grandmother",
                notes: "お婆さん （おばあさん） - old woman / grandmother ／ 婆 （ばあ） - old woman",
            },
        },
        inferenceEngine: {
            hasFullyCuratedKanjiEntry() {
                return true;
            },
            inferKanjiStudyData() {
                return {
                    displayWord: { written: "お婆さん", pron: "おばあさん" },
                    bestWord: { written: "お婆さん", pron: "おばあさん" },
                    englishMeaning: "old woman / grandmother",
                    meaningJP: "お婆さん （おばあさん） ／ old woman / grandmother",
                    notes: "お婆さん （おばあさん） - old woman / grandmother ／ 婆 （ばあ） - old woman",
                    sentenceCandidates: [],
                };
            },
        },
    });

    const inference = await exportService.buildInferenceForKanji({
        kanji: "婆",
        jlptEntry: { meanings: ["old woman"], on_readings: ["バ"], kun_readings: ["ばあ", "ばば"], jlpt: 1 },
        kanjiApiClient: {
            async getKanji() {
                throw new Error("should use local JLPT data");
            },
            async getWords() {
                throw new Error("should skip word fetch");
            },
        },
        strokeOrderService: {
            async getManifest() {
                return {
                    assets: {
                        strokeOrderImage: null,
                        strokeOrderAnimation: { path: "animations/5A46_婆-stroke-order.gif" },
                        audio: [{
                            path: "audio/5A46_婆-kanji-reading-婆-ばあ.wav",
                            category: "kanji-reading",
                            text: "婆",
                            reading: "ばあ",
                            locale: "ja-JP",
                        }],
                    },
                };
            },
        },
        audioService: null,
    });

    assert.equal(inference.displayWordText, "婆");
    assert.equal(inference.primaryReading, "ばあ");
    assert.equal(inference.audioPath, "audio/5A46_婆-kanji-reading-婆-ばあ.wav");
});

test("buildInferenceForKanji lets explicit bare-kanji breakdown readings override bare display readings", async () => {
    const exportService = createExportService({
        curatedStudyData: {
            間: {
                displayWord: { written: "間", pron: "あいだ" },
                breakdownDisplayWord: { written: "間", pron: "かん" },
                englishMeaning: "time / interval",
                notes: "時間 （じかん） - time ／ 間 （あいだ） - between",
            },
        },
        inferenceEngine: {
            inferKanjiStudyData() {
                return {
                    displayWord: { written: "間", pron: "あいだ" },
                    bestWord: { written: "間", pron: "あいだ" },
                    englishMeaning: "time / interval",
                    meaningJP: "間 （あいだ） ／ time / interval",
                    notes: "時間 （じかん） - time ／ 間 （あいだ） - between",
                    exampleSentence: { japanese: "少し時間があります。", reading: "すこしじかんがあります。", english: "I have a little time." },
                };
            },
        },
        sentenceCorpus: [],
    });

    const inference = await exportService.buildInferenceForKanji({
        kanji: "間",
        jlptEntry: { jlpt: 5 },
        jlptOnlyJson: { 間: { jlpt: 5 } },
        kanjiApiClient: {
            async getKanji() {
                return {
                    kanji: "間",
                    meanings: ["time", "interval", "space"],
                    kun_readings: ["あいだ", "ま"],
                    on_readings: ["カン", "ケン"],
                };
            },
            async getWords() {
                return [];
            },
        },
        strokeOrderService: null,
        audioService: null,
    });

    assert.equal(inference.displayWordText, "間");
    assert.equal(inference.primaryReading, "かん");
    assert.equal(inference.meaningJP, "time / interval");
});

test("buildInferenceForKanji separates primary-reading gloss from broader kanji meanings", async () => {
    const exportService = createExportService({
        curatedStudyData: {
            外: {
                displayWord: { written: "外", pron: "そと" },
                notes: "外 （そと） - outside ／ 外国 （がいこく） - foreign country",
            },
        },
        inferenceEngine: {
            hasFullyCuratedKanjiEntry() {
                return true;
            },
            inferKanjiStudyData() {
                return {
                    displayWord: { written: "外", pron: "そと" },
                    bestWord: { written: "外国", pron: "がいこく" },
                    englishMeaning: "outside / foreign",
                    meaningJP: "外 （そと） ／ outside / foreign",
                    notes: "外 （そと） - outside ／ 外国 （がいこく） - foreign country",
                    sentenceCandidates: [],
                };
            },
        },
    });

    const inference = await exportService.buildInferenceForKanji({
        kanji: "外",
        jlptEntry: { meanings: ["outside", "foreign"], on_readings: ["ガイ"], kun_readings: ["そと"], jlpt: 5 },
        kanjiApiClient: {
            async getKanji() {
                throw new Error("should use local JLPT data");
            },
            async getWords() {
                throw new Error("should skip word fetch");
            },
        },
        strokeOrderService: null,
        audioService: null,
    });

    assert.equal(inference.displayWordText, "外");
    assert.equal(inference.primaryReading, "そと");
    assert.equal(inference.meaningJP, "outside");
    assert.equal(inference.kanjiMeanings, "outside / foreign");
});

test("buildInferenceForKanji prefers curated learner meaning over noisy kanji glosses for compound study words", async () => {
    const exportService = createExportService({
        curatedStudyData: {
            刊: {
                englishMeaning: "publish / issue",
                displayWord: { written: "週刊", pron: "しゅうかん" },
                notes: "週刊 （しゅうかん） - weekly publication ／ 刊行 （かんこう） - publication",
                exampleSentence: {
                    japanese: "その雑誌は毎週刊行されます。",
                    reading: "そのざっしはまいしゅうかんこうされます。",
                    english: "That magazine is published every week.",
                },
            },
        },
        inferenceEngine: {
            hasFullyCuratedKanjiEntry() {
                return true;
            },
            inferKanjiStudyData() {
                return {
                    displayWord: { written: "週刊", pron: "しゅうかん" },
                    bestWord: { written: "週刊", pron: "しゅうかん" },
                    englishMeaning: "publish / issue",
                    meaningJP: "週刊 （しゅうかん） ／ publish / issue",
                    notes: "週刊 （しゅうかん） - weekly publication ／ 刊行 （かんこう） - publication",
                    sentenceCandidates: [],
                };
            },
        },
    });

    const inference = await exportService.buildInferenceForKanji({
        kanji: "刊",
        jlptEntry: { meanings: ["carve", "publish", "issue"], on_readings: ["カン"], kun_readings: [], jlpt: 2 },
        kanjiApiClient: {
            async getKanji() {
                throw new Error("should use local JLPT data");
            },
            async getWords() {
                throw new Error("should skip word fetch");
            },
        },
        strokeOrderService: null,
        audioService: null,
    });

    assert.equal(inference.displayWordText, "刊");
    assert.equal(inference.primaryReading, "かん");
    assert.equal(inference.meaningJP, "publish / issue");
    assert.equal(inference.kanjiMeanings, "publish / issue / carve");
});

test("buildInferenceForKanji does not attach mismatched compound audio to a kanji card", async () => {
    const exportService = createExportService({
        curatedStudyData: {
            車: {
                displayWord: { written: "電車", pron: "でんしゃ" },
                breakdownDisplayWord: { written: "車", pron: "くるま" },
            },
        },
        inferenceEngine: {
            hasFullyCuratedKanjiEntry() {
                return true;
            },
            inferKanjiStudyData() {
                return {
                    displayWord: { written: "電車", pron: "でんしゃ" },
                    bestWord: { written: "電車", pron: "でんしゃ" },
                    englishMeaning: "car / vehicle",
                    meaningJP: "電車 （でんしゃ） ／ car / vehicle",
                    notes: "電車 （でんしゃ） - train ／ 車 （くるま） - car",
                    sentenceCandidates: [],
                };
            },
        },
    });

    const inference = await exportService.buildInferenceForKanji({
        kanji: "車",
        jlptEntry: { meanings: ["car"], on_readings: ["シャ"], kun_readings: ["くるま"], jlpt: 5 },
        kanjiApiClient: {
            async getKanji() {
                throw new Error("should use local JLPT data");
            },
            async getWords() {
                throw new Error("should skip word fetch");
            },
        },
        strokeOrderService: {
            async getManifest() {
                return {
                    assets: {
                        strokeOrderImage: null,
                        strokeOrderAnimation: { path: "animations/8ECA_車-stroke-order.gif" },
                        audio: [{
                            path: "audio/8ECA_車-kanji-reading-車-でんしゃ.wav",
                            category: "kanji-reading",
                            text: "車",
                            reading: "でんしゃ",
                            locale: "ja-JP",
                        }],
                    },
                };
            },
        },
        audioService: null,
    });

    assert.equal(inference.displayWordText, "車");
    assert.equal(inference.primaryReading, "くるま");
    assert.equal(inference.audioPath, "");
    assert.equal(inference.audioField, "");
});

test("buildInferenceForKanji infers a kanji reading from kanji data when curated data only has a compound", async () => {
    const exportService = createExportService({
        curatedStudyData: {
            天: {
                displayWord: { written: "天気", pron: "てんき" },
            },
        },
        inferenceEngine: {
            hasFullyCuratedKanjiEntry() {
                return true;
            },
            inferKanjiStudyData() {
                return {
                    displayWord: { written: "天気", pron: "てんき" },
                    bestWord: { written: "天気", pron: "てんき" },
                    englishMeaning: "weather / sky",
                    meaningJP: "天気 （てんき） ／ weather / sky",
                    notes: "天気 （てんき） - weather",
                    sentenceCandidates: [],
                };
            },
        },
    });

    const inference = await exportService.buildInferenceForKanji({
        kanji: "天",
        jlptEntry: { meanings: ["heaven"], on_readings: ["テン"], kun_readings: ["あま"], jlpt: 5 },
        kanjiApiClient: {
            async getKanji() {
                throw new Error("should use local JLPT data");
            },
            async getWords() {
                throw new Error("should skip word fetch");
            },
        },
        strokeOrderService: null,
        audioService: null,
    });

    assert.equal(inference.displayWordText, "天");
    assert.equal(inference.primaryReading, "てん");
    assert.equal(inference.meaningJP, "heaven");
});

test("buildInferenceForKanji preserves single-kanji words with okurigana as primary readings", async () => {
    const exportService = createExportService({
        curatedStudyData: {
            見: {
                displayWord: { written: "見る", pron: "みる" },
            },
        },
        inferenceEngine: {
            hasFullyCuratedKanjiEntry() {
                return true;
            },
            inferKanjiStudyData() {
                return {
                    displayWord: { written: "見る", pron: "みる" },
                    bestWord: { written: "見る", pron: "みる" },
                    englishMeaning: "see / watch",
                    meaningJP: "見る （みる） ／ see / watch",
                    notes: "見る （みる） - see / watch",
                    sentenceCandidates: [],
                };
            },
        },
    });

    const inference = await exportService.buildInferenceForKanji({
        kanji: "見",
        jlptEntry: { meanings: ["see"], on_readings: ["ケン"], kun_readings: ["み.る"], jlpt: 5 },
        kanjiApiClient: {
            async getKanji() {
                throw new Error("should use local JLPT data");
            },
            async getWords() {
                throw new Error("should skip word fetch");
            },
        },
        strokeOrderService: null,
        audioService: null,
    });

    assert.equal(inference.displayWordText, "見");
    assert.equal(inference.primaryReading, "みる");
    assert.equal(inference.meaningJP, "see / watch");
});

test("buildInferenceForKanji filters curated blocked readings and duplicate normalized readings from learner-facing labels", async () => {
    const exportService = createExportService({
        curatedStudyData: {
            志: {
                englishMeaning: "will / aspiration",
                displayWord: { written: "志す", pron: "こころざす" },
                blockedReadings: ["シリング"],
                notes: "志す （こころざす） - to aspire to",
            },
        },
        inferenceEngine: {
            hasFullyCuratedKanjiEntry() {
                return true;
            },
            inferKanjiStudyData() {
                return {
                    displayWord: { written: "志す", pron: "こころざす" },
                    bestWord: { written: "志す", pron: "こころざす" },
                    meaningJP: "志す （こころざす） ／ to aspire to",
                    notes: "志す （こころざす） - to aspire to",
                    sentenceCandidates: [],
                };
            },
        },
    });

    const inference = await exportService.buildInferenceForKanji({
        kanji: "志",
        jlptEntry: {
            jlpt: 1,
            meanings: ["will", "aspiration", "shilling"],
            on_readings: ["シ"],
            kun_readings: ["こころざ.す", "こころざす", "こころざし", "シリング"],
        },
        kanjiApiClient: {
            async getKanji() {
                throw new Error("should use local JLPT data");
            },
            async getWords() {
                throw new Error("should skip word fetch");
            },
        },
        strokeOrderService: null,
        audioService: null,
    });

    assert.equal(inference.kunReading, "こころざ.す、 こころざし");
    assert.equal(inference.onReading, "シ");
});

test("buildInferenceForKanji reuses a single shared manifest lookup when available", async () => {
    let manifestCalls = 0;
    const exportService = createExportService({
        inferenceEngine: {
            hasFullyCuratedKanjiEntry() {
                return false;
            },
            inferKanjiStudyData() {
                return {
                    displayWord: { written: "日", pron: "ひ" },
                    bestWord: { written: "日", pron: "ひ" },
                    meaningJP: "日 （ひ） ／ day",
                    notes: "日 （ひ） - day",
                    sentenceCandidates: [],
                };
            },
        },
    });

    const inference = await exportService.buildInferenceForKanji({
        kanji: "日",
        kanjiApiClient: {
            async getKanji() {
                return { meanings: ["day"], on_readings: ["ニチ"], kun_readings: ["ひ"] };
            },
            async getWords() {
                return [];
            },
        },
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
                            reading: "ひ",
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
    assert.equal(inference.strokeOrderPath, "animations/65E5_日-stroke-order.gif");
    assert.equal(inference.strokeOrderImagePath, "images/65E5_日-stroke-order.png");
    assert.equal(inference.strokeOrderAnimationPath, "animations/65E5_日-stroke-order.gif");
    assert.equal(inference.audioPath, "audio/65E5_日-kanji-reading-日.mp3");
});

test("buildInferenceForKanji selects audio matching the kanji primary reading", async () => {
    const exportService = createExportService({
        curatedStudyData: {
            側: {
                displayWord: { written: "反対側", pron: "はんたいがわ" },
            },
        },
        inferenceEngine: {
            hasFullyCuratedKanjiEntry() {
                return true;
            },
            inferKanjiStudyData() {
                return {
                    displayWord: { written: "反対側", pron: "はんたいがわ" },
                    bestWord: null,
                    meaningJP: "反対側 （はんたいがわ） ／ side / opposite side",
                    notes: "反対側 （はんたいがわ） - opposite side",
                    sentenceCandidates: [],
                };
            },
        },
    });

    const inference = await exportService.buildInferenceForKanji({
        kanji: "側",
        jlptEntry: { meanings: ["side"], on_readings: ["ソク"], kun_readings: ["がわ"], jlpt: 3 },
        kanjiApiClient: {
            async getKanji() {
                throw new Error("should use local JLPT data");
            },
            async getWords() {
                throw new Error("should skip word fetch");
            },
        },
        strokeOrderService: {
            async getManifest() {
                return {
                    assets: {
                        strokeOrderImage: null,
                        strokeOrderAnimation: { path: "animations/5074_側-stroke-order.gif" },
                        audio: [
                            {
                                path: "audio/5074_側-kanji-reading-側-そば.wav",
                                category: "kanji-reading",
                                text: "側",
                                reading: "そば",
                                locale: "ja-JP",
                            },
                            {
                                path: "audio/5074_側-kanji-reading-側-がわ.wav",
                                category: "kanji-reading",
                                text: "側",
                                reading: "がわ",
                                locale: "ja-JP",
                            },
                        ],
                    },
                };
            },
        },
        audioService: null,
    });

    assert.equal(inference.displayWordText, "側");
    assert.equal(inference.primaryReading, "がわ");
    assert.equal(inference.audioPath, "audio/5074_側-kanji-reading-側-がわ.wav");
    assert.equal(inference.audioField, "[sound:5074_側-kanji-reading-側-がわ.wav]");
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
        jlptOnlyJson: {
            日: { jlpt: 5 },
            本: { jlpt: 5 },
        },
    });

    const cols = row.split("	");
    assert.equal(wordFetchCalled, false);
    assert.equal(cols[0], "日");
    assert.equal(cols[1], "日");
    assert.equal(cols[2], "day");
    assert.equal(cols[3], "ひ");
    assert.equal(cols[4], "day");
    assert.equal(cols[5], "");
    assert.equal(cols[11], "<ruby>日本<rt>にほん</rt></ruby> - Japan");
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
        jlptOnlyJson: {
            日: { jlpt: 5 },
            本: { jlpt: 5 },
        },
    });

    const cols = row.split("	");
    assert.equal(wordFetchCalled, false);
    assert.equal(kanjiFetchCalled, false);
    assert.equal(cols[0], "日");
    assert.equal(cols[1], "日");
    assert.equal(cols[2], "day");
    assert.equal(cols[3], "ひ");
    assert.equal(cols[4], "day");
    assert.equal(cols[5], "");
    assert.equal(cols[6], "ニチ");
    assert.equal(cols[7], "ひ");
    assert.equal(cols[11], "<ruby>日本<rt>にほん</rt></ruby> - Japan");
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

    const exportService = createExportService();
    const tsv = await exportService.buildTsvForJlptLevel({
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
    assert.equal(lines[0], "Kanji\tDisplayWord\tMeaningJP\tPrimaryReading\tKanjiMeanings\tStudyWordKanji\tOnReading\tKunReading\tStrokeOrder\tAudio\tRadical\tNotes\tExampleSentence");

    const cols = lines[1].split("\t");
    assert.equal(cols[0], "日");
    assert.equal(cols[1], "日");
    assert.equal(cols[2], "day");
    assert.equal(cols[3], "ひ");
    assert.equal(cols[4], "day / sun");
    assert.equal(cols[5], "");
    assert.equal(cols[6], "ニチ、 ジツ");
    assert.equal(cols[7], "ひ、 び、 か");
    assert.equal(cols[8], '<img src="65E5_日-stroke-order.gif" />');
    assert.equal(cols[9], "[sound:65E5_日-kanji-reading-日.mp3]");
    assert.equal(cols[10], "日");
    assert.equal(cols[11], "<ruby>日本<rt>にほん</rt></ruby> - Japan ／ <ruby>日<rt>にち</rt></ruby>よう<ruby>日<rt>び</rt></ruby> - Sunday");
    assert.equal(cols[12], '「日本」を勉強します。 ／ 「にほん」をべんきょうします。 ／ I study the word "日本".');
});

test("buildTsvForJlptLevel builds the kanji level lookup once per TSV build", async () => {
    let ownKeysCalls = 0;
    const jlptOnlyJson = new Proxy({
        日: { jlpt: 5, meanings: ["day"], on_readings: ["ニチ"], kun_readings: ["ひ"] },
        本: { jlpt: 5, meanings: ["book"], on_readings: ["ホン"], kun_readings: ["もと"] },
        人: { jlpt: 4, meanings: ["person"], on_readings: ["ジン"], kun_readings: ["ひと"] },
    }, {
        ownKeys(target) {
            ownKeysCalls += 1;
            return Reflect.ownKeys(target);
        },
    });
    const exportService = createExportService({
        inferenceEngine: {
            hasFullyCuratedKanjiEntry() {
                return true;
            },
            inferKanjiStudyData({ kanji }) {
                const reading = kanji === "日" ? "ひ" : "ほん";
                const meaning = kanji === "日" ? "day" : "book";
                return {
                    displayWord: { written: kanji, pron: reading },
                    bestWord: null,
                    meaningJP: `${kanji} （${reading}） ／ ${meaning}`,
                    notes: `${kanji} （${reading}） - ${meaning}`,
                    sentenceCandidates: [],
                };
            },
        },
    });

    const tsv = await exportService.buildTsvForJlptLevel({
        levelNumber: 5,
        jlptOnlyJson,
        kradMap: new Map([
            ["日", ["日"]],
            ["本", ["木"]],
        ]),
        pickMainComponent(components) {
            return components[0] || "";
        },
        kanjiApiClient: {
            async getKanji() {
                throw new Error("should use local JLPT data for fully curated rows");
            },
            async getWords() {
                throw new Error("should skip word fetch for fully curated rows");
            },
        },
        strokeOrderService: null,
        audioService: null,
        concurrency: 1,
    });

    assert.equal(tsv.trim().split("\n").length, 3);
    assert.equal(ownKeysCalls, 2);
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
    assert.equal(cols[2], "main / primary");
    assert.equal(cols[5], "");
    assert.equal(cols[6], "シュ");
    assert.equal(cols[7], "ぬし、 おも");
    assert.equal(cols[11], "<ruby>主<rt>おも</rt></ruby> - main / primary");
    assert.equal(cols[12], "主な理由を説明してください。 ／ おもなりゆうをせつめいしてください。 ／ Please explain the main reason.");
    assert.deepEqual(exportIssues, [{
        kanji: "主",
        level: 4,
        severity: "warning",
        resolution: "offline-local-fallback",
        error: "Request timed out after 10000 ms: https://kanjiapi.dev/v1/words/%E4%B8%BB",
    }]);
});

