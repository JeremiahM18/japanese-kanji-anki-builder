const test = require("node:test");
const assert = require("node:assert/strict");

const { createApp, parseLevel, parseLimit } = require("../src/app");

function buildFixtureApp() {
    const config = {
        cacheDir: "C:\\repo\\cache",
        jlptJsonPath: "C:\\repo\\data\\kanji_jlpt_only.json",
        kradfilePath: "C:\\repo\\data\\KRADFILE",
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
    };

    return createApp({
        config,
        jlptOnlyJson,
        kradMap,
        pickMainComponent: (components) => components[0] || "",
        kanjiApiClient,
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
        assert.equal(readyJson.config.exportConcurrency, 4);
    });
});

test("download export sets attachment headers", async () => {
    const app = buildFixtureApp();

    await withServer(app, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/export/N5/download?limit=1`);
        assert.equal(response.status, 200);
        assert.match(response.headers.get("content-disposition"), /jlpt_n5_kanji\.tsv/);

        const text = await response.text();
        const lines = text.trim().split("\n");

        assert.equal(lines.length, 2);
        assert.match(lines[0], /^Kanji\tMeaningJP\tReading/);
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
