const test = require("node:test");
const assert = require("node:assert/strict");

const {
    parseArgs,
    parseWordIdentity,
    resolveDraftOutputPath,
} = require("../scripts/scaffoldGoldenWordExpectations");

test("Gold scaffold script parses level, limit, json, out, and word identities", () => {
    const options = parseArgs([
        "--level=N3",
        "--limit=8",
        "--json",
        "--out=out/gold-drafts/n3.json",
        "--words=実は|じつは,際:さい",
    ]);

    assert.deepEqual(options, {
        json: true,
        level: 3,
        limit: 8,
        out: "out/gold-drafts/n3.json",
        unknownArgs: [],
        words: [
            { word: "実は", reading: "じつは" },
            { word: "際", reading: "さい" },
        ],
    });
});

test("Gold scaffold script parses word identities with optional reading", () => {
    assert.deepEqual(parseWordIdentity("今日:きょう"), { word: "今日", reading: "きょう" });
    assert.deepEqual(parseWordIdentity("八|はち"), { word: "八", reading: "はち" });
    assert.deepEqual(parseWordIdentity("水"), { word: "水", reading: "" });
});

test("Gold scaffold script refuses tracked template output paths", () => {
    assert.throws(
        () => resolveDraftOutputPath("templates/golden_n3_word_review_set.json", { cwd: process.cwd() }),
        /Refusing to write Gold scaffold drafts under templates/
    );
});
