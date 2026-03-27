const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildCommonsSearchUrl,
    buildSearchQueries,
    discoverWikimediaStrokeOrderForKanji,
    normalizeFileTitle,
    scoreAnimationTitle,
    scoreImageTitle,
    selectBestTitle,
} = require("../src/services/wikimediaStrokeOrderDiscoveryService");

test("buildSearchQueries targets Commons title discovery", () => {
    assert.deepEqual(buildSearchQueries("今"), [
        "intitle:今 order",
        "intitle:今 stroke order",
        "intitle:今 bw",
    ]);
    assert.match(buildCommonsSearchUrl("intitle:今 order"), /commons\.wikimedia\.org\/w\/api\.php/);
});

test("discovery scoring prefers known Commons stroke-order formats", () => {
    assert.ok(scoreImageTitle("円-jbw.png", "円") > scoreImageTitle("円-red.png", "円"));
    assert.ok(scoreImageTitle("今 - U+04ECA- KanjiVG stroke order.svg", "今") > 0);
    assert.ok(scoreAnimationTitle("日-order.gif", "日") > 0);
    assert.equal(selectBestTitle(["円-red.png", "円-jbw.png"], (title) => scoreImageTitle(title, "円")), "円-jbw.png");
    assert.equal(normalizeFileTitle("File:今-bw.png"), "今-bw.png");
});

test("discoverWikimediaStrokeOrderForKanji selects real Commons titles from API search results", async () => {
    const responses = {
        "intitle:今 order": {
            query: {
                search: [
                    { title: "File:今 - U+04ECA- KanjiVG stroke order.svg" },
                    { title: "File:今-bw.png" },
                ],
            },
        },
        "intitle:今 stroke order": {
            query: {
                search: [
                    { title: "File:今 - U+04ECA (Kaisho) - KanjiVG stroke order.svg" },
                ],
            },
        },
        "intitle:今 bw": {
            query: {
                search: [
                    { title: "File:今-bw.png" },
                ],
            },
        },
    };

    const result = await discoverWikimediaStrokeOrderForKanji("今", {
        async fetchJson(url) {
            const query = new URL(url).searchParams.get("srsearch");
            return responses[query] || { query: { search: [] } };
        },
    });

    assert.equal(result.image.fileName, "今-bw.png");
    assert.equal(result.animation, null);
    assert.equal(result.diagram.fileName, "今 - U+04ECA- KanjiVG stroke order.svg");
    assert.ok(result.titles.includes("今 - U+04ECA- KanjiVG stroke order.svg"));
    assert.ok(result.image.filePageUrl.endsWith(encodeURIComponent("今-bw.png")));
});
