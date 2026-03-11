const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { z } = require("zod");

const {
    buildCacheFilePath,
    createEmptyClientMetrics,
    createKanjiApiClient,
    validatePayload,
} = require("../src/kanjiApiClient");

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "kanji-api-client-test-"));
}

function cleanupTempDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

test("buildCacheFilePath shards cache entries into subdirectories", () => {
    const cachePath = buildCacheFilePath("cache-root", "kanji__E6_97_A5");

    assert.equal(cachePath, path.join("cache-root", "ka", "kanji__E6_97_A5.json"));
});

test("createEmptyClientMetrics starts all counters at zero", () => {
    assert.deepEqual(createEmptyClientMetrics(), {
        cacheHits: 0,
        cacheMisses: 0,
        networkFetches: 0,
        cacheWrites: 0,
        payloadValidationFailures: 0,
    });
});

test("validatePayload throws a descriptive error when the payload is malformed", () => {
    const metrics = createEmptyClientMetrics();

    assert.throws(
        () => validatePayload(z.object({ required: z.string() }), {}, "fixture", metrics),
        /Invalid fixture payload/
    );

    assert.equal(metrics.payloadValidationFailures, 1);
});

test("getKanji fetches once, writes cache, and reuses cached response", async () => {
    const cacheDir = makeTempDir();
    const originalFetch = global.fetch;

    let fetchCalls = 0;

    global.fetch = async (url) => {
        fetchCalls++;

        return {
            ok: true,
            async json() {
                return {
                    kanji: "日",
                    meanings: ["day", "sun"],
                    on_readings: ["ニチ", "ジツ"],
                    kun_readings: ["ひ", "び", "か"],
                    urlSeen: url,
                };
            },
            async text() {
                return "";
            },
        };
    };

    try {
        const client = createKanjiApiClient({
            baseUrl: "https://example.test",
            cacheDir,
            fetchTimeoutMs: 10000,
        });

        const first = await client.getKanji("日");
        const second = await client.getKanji("日");
        const metrics = client.getMetrics();

        assert.equal(fetchCalls, 1, "expected only one network fetch");
        assert.equal(first.kanji, "日");
        assert.equal(second.kanji, "日");
        assert.deepEqual(second.meanings, ["day", "sun"]);
        assert.equal(metrics.cacheHits, 1);
        assert.equal(metrics.cacheMisses, 1);
        assert.equal(metrics.networkFetches, 1);
        assert.equal(metrics.cacheWrites, 1);

        const expectedFile = buildCacheFilePath(cacheDir, "kanji__E6_97_A5");
        assert.equal(fs.existsSync(expectedFile), true, "expected kanji cache file to exist");

        const cachedText = fs.readFileSync(expectedFile, "utf-8");
        const cachedJson = JSON.parse(cachedText);
        assert.equal(cachedJson.kanji, "日");
    } finally {
        global.fetch = originalFetch;
        cleanupTempDir(cacheDir);
    }
});

test("getWords uses a separate cache entry from getKanji", async () => {
    const cacheDir = makeTempDir();
    const originalFetch = global.fetch;

    const seenUrls = [];

    global.fetch = async (url) => {
        seenUrls.push(url);

        if (url.includes("/kanji/")) {
            return {
                ok: true,
                async json() {
                    return {
                        kanji: "日",
                        meanings: ["day", "sun"],
                        on_readings: ["ニチ", "ジツ"],
                        kun_readings: ["ひ", "び", "か"],
                    };
                },
                async text() {
                    return "";
                },
            };
        }

        if (url.includes("/words/")) {
            return {
                ok: true,
                async json() {
                    return [
                        {
                            variants: [
                                {
                                    written: "日本",
                                    pronounced: "にほん",
                                    priorities: ["news1"],
                                },
                            ],
                            meanings: [
                                {
                                    glosses: ["Japan"],
                                },
                            ],
                        },
                    ];
                },
                async text() {
                    return "";
                },
            };
        }

        throw new Error(`Unexpected URL: ${url}`);
    };

    try {
        const client = createKanjiApiClient({
            baseUrl: "https://example.test",
            cacheDir,
            fetchTimeoutMs: 1000,
        });

        const kanji = await client.getKanji("日");
        const words = await client.getWords("日");

        assert.equal(kanji.kanji, "日");
        assert.equal(Array.isArray(words), true);
        assert.equal(words[0].variants[0].written, "日本");

        assert.equal(seenUrls.length, 2);
        assert.match(seenUrls[0], /\/kanji\//);
        assert.match(seenUrls[1], /\/words\//);

        const kanjiCacheFile = buildCacheFilePath(cacheDir, "kanji__E6_97_A5");
        const wordsCacheFile = buildCacheFilePath(cacheDir, "words__E6_97_A5");

        assert.equal(fs.existsSync(kanjiCacheFile), true);
        assert.equal(fs.existsSync(wordsCacheFile), true);
    } finally {
        global.fetch = originalFetch;
        cleanupTempDir(cacheDir);
    }
});

test("concurrent duplicate getKanji calls share one in-flight fetch", async () => {
    const cacheDir = makeTempDir();
    const originalFetch = global.fetch;

    let fetchCalls = 0;

    global.fetch = async () => {
        fetchCalls++;

        await new Promise((resolve) => setTimeout(resolve, 25));

        return {
            ok: true,
            async json() {
                return {
                    kanji: "水",
                    meanings: ["water"],
                    on_readings: ["スイ"],
                    kun_readings: ["みず"],
                };
            },
            async text() {
                return "";
            },
        };
    };

    try {
        const client = createKanjiApiClient({
            baseUrl: "https://example.test",
            cacheDir,
            fetchTimeoutMs: 1000,
        });

        const [a, b, c] = await Promise.all([
            client.getKanji("水"),
            client.getKanji("水"),
            client.getKanji("水"),
        ]);

        assert.equal(fetchCalls, 1, "expected one shared in-flight fetch");
        assert.equal(a.kanji, "水");
        assert.equal(b.kanji, "水");
        assert.equal(c.kanji, "水");
    } finally {
        global.fetch = originalFetch;
        cleanupTempDir(cacheDir);
    }
});

test("non-ok fetch response throws an error", async () => {
    const cacheDir = makeTempDir();
    const originalFetch = global.fetch;

    global.fetch = async () => {
        return {
            ok: false,
            status: 500,
            async json() {
                return {};
            },
            async text() {
                return "server exploded";
            },
        };
    };

    try {
        const client = createKanjiApiClient({
            baseUrl: "https://example.test",
            cacheDir,
            fetchTimeoutMs: 1000,
        });

        await assert.rejects(client.getKanji("水"), /Failed to fetch 500/);
    } finally {
        global.fetch = originalFetch;
        cleanupTempDir(cacheDir);
    }
});

test("corrupted cache is discarded and refetched", async () => {
    const cacheDir = makeTempDir();
    const originalFetch = global.fetch;

    let fetchCalls = 0;

    try {
        const cacheFile = buildCacheFilePath(cacheDir, "kanji__E6_B0_B4");
        fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
        fs.writeFileSync(cacheFile, "{ not valid json", "utf-8");

        global.fetch = async () => {
            fetchCalls++;
            return {
                ok: true,
                async json() {
                    return {
                        kanji: "水",
                        meanings: ["water"],
                        on_readings: ["スイ"],
                        kun_readings: ["みず"],
                    };
                },
                async text() {
                    return "";
                },
            };
        };

        const client = createKanjiApiClient({
            baseUrl: "https://example.test",
            cacheDir,
            fetchTimeoutMs: 1000,
        });

        const result = await client.getKanji("水");

        assert.equal(fetchCalls, 1);
        assert.equal(result.kanji, "水");

        const cachedText = fs.readFileSync(cacheFile, "utf-8");
        const cachedJson = JSON.parse(cachedText);
        assert.equal(cachedJson.kanji, "水");
    } finally {
        global.fetch = originalFetch;
        cleanupTempDir(cacheDir);
    }
});

test("failed in-flight fetch does not poison later retries", async () => {
    const cacheDir = makeTempDir();
    const originalFetch = global.fetch;

    let fetchCalls = 0;

    try {
        global.fetch = async () => {
            fetchCalls++;

            if (fetchCalls === 1) {
                return {
                    ok: false,
                    status: 500,
                    async json() {
                        return {};
                    },
                    async text() {
                        return "temporary failure";
                    },
                };
            }

            return {
                ok: true,
                async json() {
                    return {
                        kanji: "火",
                        meanings: ["fire"],
                        on_readings: ["カ"],
                        kun_readings: ["ひ"],
                    };
                },
                async text() {
                    return "";
                },
            };
        };

        const client = createKanjiApiClient({
            baseUrl: "https://example.test",
            cacheDir,
            fetchTimeoutMs: 1000,
        });

        await assert.rejects(
            Promise.all([
                client.getKanji("火"),
                client.getKanji("火"),
                client.getKanji("火"),
            ]),
            /Failed to fetch 500/
        );

        const result = await client.getKanji("火");

        assert.equal(fetchCalls, 2);
        assert.equal(result.kanji, "火");
    } finally {
        global.fetch = originalFetch;
        cleanupTempDir(cacheDir);
    }
});

test("invalid upstream kanji payload is rejected before caching", async () => {
    const cacheDir = makeTempDir();
    const originalFetch = global.fetch;

    try {
        global.fetch = async () => ({
            ok: true,
            async json() {
                return {
                    kanji: "水",
                    meanings: "water",
                    on_readings: ["スイ"],
                    kun_readings: ["みず"],
                };
            },
            async text() {
                return "";
            },
        });

        const client = createKanjiApiClient({
            baseUrl: "https://example.test",
            cacheDir,
            fetchTimeoutMs: 1000,
        });

        await assert.rejects(client.getKanji("水"), /Invalid kanji payload/);
        assert.equal(client.getMetrics().payloadValidationFailures, 1);

        const cacheFile = buildCacheFilePath(cacheDir, "kanji__E6_B0_B4");
        assert.equal(fs.existsSync(cacheFile), false);
    } finally {
        global.fetch = originalFetch;
        cleanupTempDir(cacheDir);
    }
});
