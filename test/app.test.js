const test = require("node:test");
const assert = require("node:assert/strict");

const { createApp, parseLevel, parseLimit } = require("../src/app");

function buildFixtureApp() {
    const config = {
        cacheDir: "C:\\repo\\cache",
        jlptJsonPath: "C:\\repo\\data\\kanji_jlpt_only.json",
        kradfilePath: "C:\\repo\\data\\KRADFILE",
        sentenceCorpusPath: "C:\\repo\\data\\sentence_corpus.json",
        curatedStudyDataPath: "C:\\repo\\data\\curated_study_data.json",
        mediaRootDir: "C:\\repo\\data\\media",
        strokeOrderImageSourceDir: "C:\\repo\\data\\media_sources\\stroke-order\\images",
        strokeOrderAnimationSourceDir: "C:\\repo\\data\\media_sources\\stroke-order\\animations",
        audioSourceDir: "C:\\repo\\data\\media_sources\\audio",
        exportConcurrency: 4,
        fetchTimeoutMs: 2500,
    };

    const jlptOnlyJson = {
        日: { jlpt: 5 },
        本: { jlpt: 5 },
    };

    const kradMap = new Map([
        ["日", ["日"]],
        ["本", ["木"]],
    ]);

    const sentenceCorpus = [
        {
            kanji: "日",
            written: "日本",
            japanese: "日本に参る。",
            reading: "にほんにまいる。",
            english: "I go to Japan.",
            source: "dictionary-import",
            tags: ["rare", "archaic"],
            register: "literary",
            frequencyRank: 4000,
            jlpt: 1,
        },
        {
            kanji: "日",
            written: "日本",
            japanese: "日本へ行きます。",
            reading: "にほんへいきます。",
            english: "I will go to Japan.",
            source: "manual-curated",
            tags: ["core", "common", "beginner"],
            register: "neutral",
            frequencyRank: 120,
            jlpt: 5,
        },
    ];

    const curatedStudyData = {
        日: {
            englishMeaning: "sun / day marker",
            preferredWords: ["日本"],
            blockedWords: ["日中"],
            notes: "日本 （にほん） - Japan ／ curated-note",
            exampleSentence: {
                japanese: "日本は島国です。",
                reading: "にほんはしまぐにです。",
                english: "Japan is an island nation.",
            },
        },
    };

    const metrics = {
        cacheHits: 7,
        cacheMisses: 2,
        networkFetches: 2,
        cacheWrites: 2,
        payloadValidationFailures: 0,
    };

    const manifests = new Map([
        ["日", {
            kanji: "日",
            version: 1,
            updatedAt: new Date().toISOString(),
            assets: {
                strokeOrderImage: {
                    kind: "image",
                    path: "images/65E5_日-stroke-order.svg",
                    mimeType: "image/svg+xml",
                    source: "fixture",
                },
                strokeOrderAnimation: {
                    kind: "animation",
                    path: "animations/65E5_日-stroke-order.gif",
                    mimeType: "image/gif",
                    source: "fixture",
                },
                audio: [
                    {
                        kind: "audio",
                        path: "audio/65E5_日-kanji-reading-日.mp3",
                        mimeType: "audio/mpeg",
                        source: "fixture",
                        category: "kanji-reading",
                        text: "日",
                        reading: "にち",
                        locale: "ja-JP",
                    },
                ],
            },
        }],
    ]);

    const kanjiApiClient = {
        async getKanji(kanji) {
            return {
                meanings: kanji === "日" ? ["day", "sun"] : ["book", "origin"],
                on_readings: kanji === "日" ? ["ニチ"] : ["ホン"],
                kun_readings: kanji === "日" ? ["ひ"] : ["もと"],
            };
        },
        async getWords(kanji) {
            if (kanji === "日") {
                return [
                    {
                        variants: [
                            {
                                written: "日中",
                                pronounced: "にっちゅう",
                                priorities: ["ichi1", "news1"],
                            },
                        ],
                        meanings: [
                            {
                                glosses: ["daytime"],
                            },
                        ],
                    },
                    {
                        variants: [
                            {
                                written: "日本",
                                pronounced: "にほん",
                                priorities: ["ichi1"],
                            },
                        ],
                        meanings: [
                            {
                                glosses: ["Japan"],
                            },
                        ],
                    },
                ];
            }

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
                            glosses: ["book"],
                        },
                    ],
                },
            ];
        },
        getMetrics() {
            return { ...metrics };
        },
    };

    const strokeOrderService = {
        async getManifest(kanji) {
            return manifests.get(kanji) || null;
        },
        async getBestStrokeOrderPath(kanji) {
            const manifest = manifests.get(kanji);
            return manifest?.assets.strokeOrderAnimation?.path || manifest?.assets.strokeOrderImage?.path || "";
        },
        async syncKanji(kanji) {
            const manifest = manifests.get(kanji) || {
                kanji,
                version: 1,
                updatedAt: new Date().toISOString(),
                assets: {
                    strokeOrderImage: null,
                    strokeOrderAnimation: null,
                    audio: [],
                },
            };

            manifests.set(kanji, manifest);

            return {
                kanji,
                manifest,
                found: {
                    image: Boolean(manifest.assets.strokeOrderImage),
                    animation: Boolean(manifest.assets.strokeOrderAnimation),
                },
            };
        },
    };

    const audioService = {
        async getBestAudioPath(kanji, preferences = {}) {
            const manifest = manifests.get(kanji);
            const audio = manifest?.assets.audio || [];
            return audio.find((asset) => {
                if (preferences.category && asset.category !== preferences.category) {
                    return false;
                }

                if (preferences.text && asset.text !== preferences.text) {
                    return false;
                }

                return true;
            })?.path || audio[0]?.path || "";
        },
        async syncKanji(kanji, metadata = {}) {
            const manifest = manifests.get(kanji) || {
                kanji,
                version: 1,
                updatedAt: new Date().toISOString(),
                assets: {
                    strokeOrderImage: null,
                    strokeOrderAnimation: null,
                    audio: [],
                },
            };

            manifest.assets.audio = [
                {
                    kind: "audio",
                    path: "audio/65E5_日-kanji-reading-日.mp3",
                    mimeType: "audio/mpeg",
                    source: "fixture",
                    category: metadata.category || "kanji-reading",
                    text: metadata.text || kanji,
                    reading: metadata.reading || "にち",
                    locale: metadata.locale || "ja-JP",
                },
            ];
            manifests.set(kanji, manifest);

            return {
                kanji,
                manifest,
                found: {
                    audio: true,
                },
            };
        },
    };

    return createApp({
        config,
        jlptOnlyJson,
        kradMap,
        sentenceCorpus,
        curatedStudyData,
        pickMainComponent: (components) => components[0] || "",
        kanjiApiClient,
        strokeOrderService,
        audioService,
    });
}

async function withServer(app, callback) {
    const server = await new Promise((resolve) => {
        const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });

    try {
        const address = server.address();
        return await callback(`http://127.0.0.1:${address.port}`);
    } finally {
        await new Promise((resolve, reject) => {
            server.close((err) => (err ? reject(err) : resolve()));
        });
    }
}

test("parseLevel accepts N-prefix and numeric values", () => {
    assert.equal(parseLevel("N5"), 5);
    assert.equal(parseLevel(" 1 "), 1);
    assert.equal(parseLevel("N9"), null);
});

test("parseLimit floors positive numbers and rejects invalid input", () => {
    assert.equal(parseLimit("3.8"), 3);
    assert.equal(parseLimit(undefined), null);
    assert.equal(parseLimit("0"), null);
});

test("health and readiness endpoints expose operational state", async () => {
    const app = buildFixtureApp();

    await withServer(app, async (baseUrl) => {
        const healthRes = await fetch(`${baseUrl}/healthz`);
        assert.equal(healthRes.status, 200);

        const healthJson = await healthRes.json();
        assert.equal(healthJson.status, "ok");
        assert.equal(healthJson.service, "japanese-kanji-builder");

        const readyRes = await fetch(`${baseUrl}/readyz`);
        assert.equal(readyRes.status, 200);

        const readyJson = await readyRes.json();
        assert.equal(readyJson.status, "ready");
        assert.equal(readyJson.datasets.jlptKanjiCount, 2);
        assert.equal(readyJson.datasets.kradEntries, 2);
        assert.equal(readyJson.datasets.sentenceCorpusEntries, 2);
        assert.equal(readyJson.datasets.curatedStudyEntries, 1);
        assert.equal(readyJson.config.exportConcurrency, 4);
        assert.equal(readyJson.config.audioSourceDir, "C:\\repo\\data\\media_sources\\audio");
        assert.equal(readyJson.cache.cacheHits, 7);
        assert.equal(readyJson.cache.cacheMisses, 2);
    });
});

test("inference route exposes curated and corpus-backed study output", async () => {
    const app = buildFixtureApp();

    await withServer(app, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/inference/日`);
        assert.equal(response.status, 200);

        const json = await response.json();
        assert.equal(json.status, "ok");
        assert.equal(json.inference.bestWord.written, "日本");
        assert.equal(json.inference.englishMeaning, "sun / day marker");
        assert.equal(json.inference.notes, "日本 （にほん） - Japan ／ curated-note");
        assert.equal(json.inference.strokeOrderPath, "animations/65E5_日-stroke-order.gif");
        assert.equal(json.inference.strokeOrderField, '<img src="65E5_日-stroke-order.gif" />');
        assert.equal(json.inference.audioPath, "audio/65E5_日-kanji-reading-日.mp3");
        assert.equal(json.inference.audioField, "[sound:65E5_日-kanji-reading-日.mp3]");
        assert.equal(json.inference.sentenceCandidates[0].type, "curated");
        assert.equal(json.inference.curated.hasOverride, true);
    });
});

test("media routes expose manifests and sync results", async () => {
    const app = buildFixtureApp();

    await withServer(app, async (baseUrl) => {
        const manifestRes = await fetch(`${baseUrl}/media/日`);
        assert.equal(manifestRes.status, 200);

        const manifestJson = await manifestRes.json();
        assert.equal(manifestJson.status, "ok");
        assert.equal(manifestJson.bestStrokeOrderPath, "animations/65E5_日-stroke-order.gif");
        assert.equal(manifestJson.bestAudioPath, "audio/65E5_日-kanji-reading-日.mp3");

        const missingRes = await fetch(`${baseUrl}/media/山`);
        assert.equal(missingRes.status, 404);

        const syncRes = await fetch(`${baseUrl}/media/日/sync`, { method: "POST" });
        assert.equal(syncRes.status, 200);

        const syncJson = await syncRes.json();
        assert.equal(syncJson.found.image, true);
        assert.equal(syncJson.found.animation, true);

        const audioSyncRes = await fetch(`${baseUrl}/media/日/audio/sync`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                category: "kanji-reading",
                text: "日",
                reading: "にち",
            }),
        });
        assert.equal(audioSyncRes.status, 200);

        const audioSyncJson = await audioSyncRes.json();
        assert.equal(audioSyncJson.found.audio, true);
        assert.equal(audioSyncJson.bestAudioPath, "audio/65E5_日-kanji-reading-日.mp3");
    });
});

test("download export sets attachment headers and includes Anki-ready media fields", async () => {
    const app = buildFixtureApp();

    await withServer(app, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/export/N5/download?limit=1`);
        assert.equal(response.status, 200);
        assert.match(response.headers.get("content-disposition"), /jlpt_n5_kanji\.tsv/);

        const text = await response.text();
        const lines = text.trim().split("\n");
        const cols = lines[1].split("\t");

        assert.equal(lines.length, 2);
        assert.equal(lines[0], "Kanji\tMeaningJP\tReading\tStrokeOrder\tAudio\tRadical\tNotes\tExampleSentence");
        assert.equal(cols.length, 8);
        assert.equal(cols[3], '<img src="65E5_日-stroke-order.gif" />');
        assert.equal(cols[4], "[sound:65E5_日-kanji-reading-日.mp3]");
        assert.match(cols[6], /curated-note/);
        assert.match(cols[7], /日本は島国です/);
        assert.match(cols[7], /Japan is an island nation/);
    });
});

test("invalid export parameters return 400", async () => {
    const app = buildFixtureApp();

    await withServer(app, async (baseUrl) => {
        const badLevel = await fetch(`${baseUrl}/export/N9`);
        assert.equal(badLevel.status, 400);

        const badLimit = await fetch(`${baseUrl}/export/N5?limit=0`);
        assert.equal(badLimit.status, 400);
    });
});
