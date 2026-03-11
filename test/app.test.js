const test = require("node:test");
const assert = require("node:assert/strict");

const { createApp, parseLevel, parseLimit } = require("../src/app");

function buildFixtureApp() {
    const config = {
        cacheDir: "C:\\repo\\cache",
        jlptJsonPath: "C:\\repo\\data\\kanji_jlpt_only.json",
        kradfilePath: "C:\\repo\\data\\KRADFILE",
        sentenceCorpusPath: "C:\\repo\\data\\sentence_corpus.json",
        mediaRootDir: "C:\\repo\\data\\media",
        strokeOrderImageSourceDir: "C:\\repo\\data\\media_sources\\stroke-order\\images",
        strokeOrderAnimationSourceDir: "C:\\repo\\data\\media_sources\\stroke-order\\animations",
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
                    path: "images/stroke-order.svg",
                    mimeType: "image/svg+xml",
                    source: "fixture",
                },
                strokeOrderAnimation: {
                    kind: "animation",
                    path: "animations/stroke-order.gif",
                    mimeType: "image/gif",
                    source: "fixture",
                },
                audio: [],
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
            return [
                {
                    variants: [
                        {
                            written: kanji === "日" ? "日本" : "本",
                            pronounced: kanji === "日" ? "にほん" : "ほん",
                            priorities: ["ichi1"],
                        },
                    ],
                    meanings: [
                        {
                            glosses: [kanji === "日" ? "Japan" : "book"],
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

    return createApp({
        config,
        jlptOnlyJson,
        kradMap,
        sentenceCorpus,
        pickMainComponent: (components) => components[0] || "",
        kanjiApiClient,
        strokeOrderService,
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
        assert.equal(readyJson.config.exportConcurrency, 4);
        assert.equal(readyJson.config.sentenceCorpusPath, "C:\\repo\\data\\sentence_corpus.json");
        assert.equal(readyJson.cache.cacheHits, 7);
        assert.equal(readyJson.cache.cacheMisses, 2);
    });
});

test("inference route exposes weighted corpus-backed study output and sentence candidates", async () => {
    const app = buildFixtureApp();

    await withServer(app, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/inference/日`);
        assert.equal(response.status, 200);

        const json = await response.json();
        assert.equal(json.status, "ok");
        assert.equal(json.inference.bestWord.written, "日本");
        assert.equal(json.inference.strokeOrderPath, "animations/stroke-order.gif");
        assert.equal(json.inference.sentenceCandidates[0].type, "corpus");
        assert.equal(json.inference.sentenceCandidates[0].source, "manual-curated");
        assert.equal(json.inference.sentenceCandidates[0].register, "neutral");
        assert.equal(json.inference.sentenceCandidates[0].frequencyRank, 120);
        assert.match(json.inference.sentenceCandidates[0].japanese, /日本へ行きます/);
    });
});

test("media routes expose manifests and sync results", async () => {
    const app = buildFixtureApp();

    await withServer(app, async (baseUrl) => {
        const manifestRes = await fetch(`${baseUrl}/media/日`);
        assert.equal(manifestRes.status, 200);

        const manifestJson = await manifestRes.json();
        assert.equal(manifestJson.status, "ok");
        assert.equal(manifestJson.bestStrokeOrderPath, "animations/stroke-order.gif");

        const missingRes = await fetch(`${baseUrl}/media/山`);
        assert.equal(missingRes.status, 404);

        const syncRes = await fetch(`${baseUrl}/media/日/sync`, { method: "POST" });
        assert.equal(syncRes.status, 200);

        const syncJson = await syncRes.json();
        assert.equal(syncJson.found.image, true);
        assert.equal(syncJson.found.animation, true);
    });
});

test("download export sets attachment headers and includes the top sentence", async () => {
    const app = buildFixtureApp();

    await withServer(app, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/export/N5/download?limit=1`);
        assert.equal(response.status, 200);
        assert.match(response.headers.get("content-disposition"), /jlpt_n5_kanji\.tsv/);

        const text = await response.text();
        const lines = text.trim().split("\n");
        const cols = lines[1].split("\t");

        assert.equal(lines.length, 2);
        assert.equal(lines[0], "Kanji\tMeaningJP\tReading\tStrokeOrder\tRadical\tNotes\tExampleSentence");
        assert.equal(cols.length, 7);
        assert.match(cols[3], /animations\/stroke-order\.gif/);
        assert.match(cols[6], /日本へ行きます/);
        assert.match(cols[6], /I will go to Japan/);
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
