const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildCommonsPrefixUrl,
    buildCommonsSearchUrl,
    buildPrefixQueries,
    buildSearchQueries,
    discoverWikimediaStrokeOrderForKanji,
    extractFileTitle,
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
    assert.deepEqual(buildPrefixQueries("今"), [
        "今",
        "今-",
        "今 - U+",
    ]);
    assert.match(buildCommonsSearchUrl("intitle:今 order"), /commons\.wikimedia\.org\/w\/api\.php/);
    assert.match(buildCommonsPrefixUrl("今 - U+"), /aiprefix=%E4%BB%8A\+-\+U%2B/);
});

test("discovery scoring prefers known Commons stroke-order formats", () => {
    assert.ok(scoreImageTitle("円-jbw.png", "円") > scoreImageTitle("円-red.png", "円"));
    assert.ok(scoreImageTitle("今 - U+04ECA- KanjiVG stroke order.svg", "今") > 0);
    assert.ok(scoreAnimationTitle("日-order.gif", "日") > 0);
    assert.equal(selectBestTitle(["円-red.png", "円-jbw.png"], (title) => scoreImageTitle(title, "円")), "円-jbw.png");
    assert.equal(normalizeFileTitle("File:今-bw.png"), "今-bw.png");
    assert.equal(extractFileTitle({ title: "File:今-bw.png" }), "今-bw.png");
    assert.equal(extractFileTitle({ name: "今-order.gif" }), "今-order.gif");
});

test("discoverWikimediaStrokeOrderForKanji selects real Commons titles from API search and prefix results", async () => {
    const searchResponses = {
        "intitle:今 order": {
            query: {
                search: [
                    { title: "File:今 - U+04ECA- KanjiVG stroke order.svg" },
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
                search: [],
            },
        },
    };
    const prefixResponses = {
        "今": {
            query: {
                allimages: [
                    { name: "今-bw.png" },
                    { name: "今-order.gif" },
                ],
            },
        },
        "今-": {
            query: {
                allimages: [
                    { name: "今-bw.png" },
                ],
            },
        },
        "今 - U+": {
            query: {
                allimages: [
                    { name: "今 - U+04ECA- KanjiVG stroke order.svg" },
                ],
            },
        },
    };

    const result = await discoverWikimediaStrokeOrderForKanji("今", {
        async fetchJson(url) {
            const parsed = new URL(url);
            if (parsed.searchParams.get("list") === "search") {
                return searchResponses[parsed.searchParams.get("srsearch")] || { query: { search: [] } };
            }

            if (parsed.searchParams.get("list") === "allimages") {
                return prefixResponses[parsed.searchParams.get("aiprefix")] || { query: { allimages: [] } };
            }

            return { query: {} };
        },
    });

    assert.equal(result.image.fileName, "今-bw.png");
    assert.equal(result.animation.fileName, "今-order.gif");
    assert.equal(result.diagram.fileName, "今 - U+04ECA- KanjiVG stroke order.svg");
    assert.ok(result.titles.includes("今 - U+04ECA- KanjiVG stroke order.svg"));
    assert.ok(result.titles.includes("今-order.gif"));
    assert.ok(result.image.filePageUrl.endsWith(encodeURIComponent("今-bw.png")));
});

