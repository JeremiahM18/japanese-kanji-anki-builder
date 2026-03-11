const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildTsvForJlptLevel,
    formatAnkiAudioField,
    formatAnkiStrokeOrderField,
} = require("../src/services/exportService");

test("formatAnkiAudioField emits sound markup from the managed asset name", () => {
    assert.equal(formatAnkiAudioField("audio/65E5_日-kanji-reading-日.mp3"), "[sound:65E5_日-kanji-reading-日.mp3]");
    assert.equal(formatAnkiAudioField(""), "");
});

test("formatAnkiStrokeOrderField emits image markup from the managed asset name", () => {
    assert.equal(formatAnkiStrokeOrderField("animations/65E5_日-stroke-order.gif"), '<img src="65E5_日-stroke-order.gif" />');
    assert.equal(formatAnkiStrokeOrderField(""), "");
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
    assert.equal(lines[0], "Kanji\tMeaningJP\tReading\tStrokeOrder\tAudio\tRadical\tNotes\tExampleSentence");

    const cols = lines[1].split("\t");
    assert.equal(cols[0], "日");
    assert.equal(cols[1], "日本 （にほん） ／ day");
    assert.equal(cols[2], "オン:ニチ、 ジツ ／ くん:ひ、 び、 か");
    assert.equal(cols[3], '<img src="65E5_日-stroke-order.gif" />');
    assert.equal(cols[4], "[sound:65E5_日-kanji-reading-日.mp3]");
    assert.equal(cols[5], "日");
    assert.equal(cols[6], "日本 （にほん） - Japan ／ 日よう日 （にちようび） - Sunday");
    assert.equal(cols[7], '「日本」は「Japan」です。 ／ 「にほん」は「Japan」です。 ／ "日本" means "Japan."');
});
